import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { OpenRouterService } from './services/openrouter.service';
import { GraphService } from './services/graph.service';
import { VapiService } from './services/vapi.service';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 1;

// Initialize services
const openRouterService = new OpenRouterService();
const graphService = new GraphService();
const vapiService = new VapiService();

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:8080',
            'http://localhost:8081',
            'http://localhost:8082',
            'https://api.vapi.ai'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Send current graph state to newly connected client
    socket.emit('graph:update', graphService.getGraph());

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });

    socket.on('graph:request', () => {
        socket.emit('graph:update', graphService.getGraph());
    });

    socket.on('process-transcript', async (data: { text: string }) => {
        try {
            console.log('📝 Received conversation via WebSocket:', data.text);
            
            // Store the conversation as transcripts for AI summary feature
            // Parse the conversation text to extract individual messages
            const lines = data.text.split('\n');
            let currentSpeaker = '';
            let currentText = '';
            
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return;
                
                const match = trimmedLine.match(/^(User|AI):\s*(.+)$/);
                if (match) {
                    // Save previous message if exists
                    if (currentSpeaker && currentText) {
                        graphService.addTranscript(currentSpeaker, currentText.trim());
                    }
                    // Start new message
                    currentSpeaker = match[1].toLowerCase();
                    currentText = match[2];
                } else if (currentSpeaker && trimmedLine) {
                    // Continue current message (multi-line)
                    currentText += ' ' + trimmedLine;
                }
            });
            
            // Save the last message
            if (currentSpeaker && currentText) {
                graphService.addTranscript(currentSpeaker, currentText.trim());
            }
            
            console.log(`📝 Stored transcripts. Total count: ${graphService.getRecentTranscripts(15000).length}`);
            
            const prompt = `You are building a HIERARCHICAL knowledge graph. Extract 2-4 KEY IDEAS ONLY from this conversation.

CONVERSATION:
${data.text}

CRITICAL RULES:
1. Extract ONLY 2-4 MAIN IDEAS (the absolute core concepts)
2. IGNORE ALL META-CONVERSATION (anything about AI, assistance, explanations, etc.)
3. ONLY extract ACTUAL CONTENT (the topic being discussed, not the discussion itself)
4. NO REDUNDANCY - if similar, pick the most specific one
5. Create PARENT→CHILD hierarchy with directed edges

❌ NEVER EXTRACT (Meta-conversation):
- "AI expresses inability..."
- "User seeks explanation..."
- "AI will provide assistance..."
- "User asks for help..."
- Anything about the conversation process itself

✅ ALWAYS EXTRACT (Actual content):
- The actual topic/problem 
- Specific solutions 
- Implementation details

HIERARCHY STRUCTURE:
Main Concept (PARENT)
  ├─ Specific Example (CHILD)
  └─ Implementation Method (CHILD)

🎮 SPECIAL: CLASH ROYALE CONVERSATIONS
If and ONLY if the conversation is about Clash Royale:
- Use SPECIFIC card names (e.g., "Hog Rider", "Electro Giant", "X-Bow", "Royal Giant")
- Include SPECIFIC strategies (e.g., "Split-lane pressure", "Spell cycling", "Beatdown push")
- Reference SPECIFIC game mechanics (e.g., "Elixir advantage", "King tower activation", "Ladder climbing")
- Mention SPECIFIC deck archetypes (e.g., "2.6 Hog Cycle", "Golem Beatdown", "X-Bow Siege")
- Include pro player tactics or meta strategies when relevant
- Use game-specific terminology (e.g., "defending opposite lane", "spell value", "counterpush")
Examples for Clash Royale:
- Instead of: "Improve at game" → Use: "Master Hog 2.6 cycle deck timing"
- Instead of: "Learn strategy" → Use: "Counter Electro Giant with building placement"
- Instead of: "Watch replays" → Use: "Study top ladder Morten replays for X-Bow defense"

Return ONLY valid JSON (no markdown):
{
  "nodes": [
    {"id": "kebab-case-id", "label": "Specific content with details", "category": "concept|example|method|tool"}
  ],
  "edges": [
    {"source": "parent-id", "target": "child-id", "relationship": "exemplifies|implements|uses"}
  ]
}

REMEMBER: 
- MAXIMUM 4 nodes
- ZERO meta-conversation
- ONLY actual topic content
- Clear parent→child hierarchy`;

            // Try multiple free models in case one is rate limited
            let response;
            // Use OpenRouterService's automatic model fallback (paid first, then free)
            response = await openRouterService.chat(prompt);
            console.log('🤖 Gemini response:', response);

            if (!response) {
                console.error('❌ No response from model');
                socket.emit('error', { message: 'Failed to get response from model' });
                return;
            }

            // Parse JSON response
            let jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('❌ No JSON found in response');
                socket.emit('error', { message: 'Failed to parse AI response' });
                return;
            }

            const parsedData = JSON.parse(jsonMatch[0]);
            console.log('✅ Parsed data:', parsedData);

            // Add nodes and edges to graph (with deduplication check)
            const addedNodes: any[] = [];
            const addedEdges: any[] = [];
            const currentGraph = graphService.getGraph();

            if (parsedData.nodes && Array.isArray(parsedData.nodes)) {
                for (const node of parsedData.nodes) {
                    // Check if a similar node already exists (simple label similarity check)
                    const isDuplicate = currentGraph.nodes.some(existingNode => {
                        const existingLabel = existingNode.data.label.toLowerCase();
                        const newLabel = node.label.toLowerCase();
                        
                        // Check for exact match or high similarity
                        if (existingLabel === newLabel) return true;
                        
                        // Check if one label contains most words from the other (semantic similarity)
                        const existingWords = existingLabel.split(/\s+/).filter((w: string) => w.length > 3);
                        const newWords = newLabel.split(/\s+/).filter((w: string) => w.length > 3);
                        const commonWords = existingWords.filter((w: string) => newWords.includes(w));
                        
                        // If more than 60% of words overlap, consider it a duplicate
                        const similarity = commonWords.length / Math.min(existingWords.length, newWords.length);
                        return similarity > 0.6;
                    });
                    
                    if (isDuplicate) {
                        console.log(`⏭️ Skipping duplicate node: ${node.label}`);
                        continue;
                    }
                    
                    const nodeId = graphService.addNode({
                        //id: node.id || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        label: node.label,
                        category: node.category || 'service',
                        metadata: {
                            conversationContext: data.text // Store the full conversation for AI summary
                        }
                    });
                    addedNodes.push({ id: nodeId, label: node.label });
                }
            }

            if (parsedData.edges && Array.isArray(parsedData.edges)) {
                for (const edge of parsedData.edges) {
                    const edgeId = graphService.addEdge({
                        source: edge.source,
                        target: edge.target,
                        relationship: edge.relationship || 'relatesTo'
                    });
                    addedEdges.push({ id: edgeId, ...edge });
                }
            }

            // Recalculate tree layout after adding nodes and edges
            if (addedNodes.length > 0 || addedEdges.length > 0) {
                graphService.recalculateTreeLayout();
                
                // Log hierarchy statistics
                const stats = graphService.getHierarchyStats();
                console.log(`📊 Hierarchy: ${stats.totalNodes} nodes, max depth: ${stats.maxDepth}, distribution:`, stats.depthCounts);
            }

            // Broadcast graph update to all clients
            io.emit('graph:update', graphService.getGraph());

            console.log(`✅ Added ${addedNodes.length} nodes and ${addedEdges.length} edges`);
            socket.emit('transcript-processed', {
                success: true,
                nodes: addedNodes,
                edges: addedEdges
            });
        } catch (error) {
            console.error('❌ Error processing transcript:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Error details:', errorMessage);
            socket.emit('error', { message: `Failed to process transcript: ${errorMessage}` });
        }
    });

    socket.on('clear-graph', () => {
        console.log('🗑️ Clearing graph via WebSocket');
        graphService.clear();
        io.emit('graph:update', graphService.getGraph());
        console.log('✅ Graph cleared');
    });

    socket.on('remove-node', (data: { nodeId: string }) => {
        console.log('🗑️ Removing node:', data.nodeId);
        const success = graphService.removeNode(data.nodeId);
        if (success) {
            io.emit('graph:update', graphService.getGraph());
            socket.emit('node-removed', { nodeId: data.nodeId, success: true });
            console.log('✅ Node removed');
        } else {
            socket.emit('error', { message: 'Node not found' });
        }
    });

    socket.on('remove-edge', (data: { edgeId: string }) => {
        console.log('🗑️ Removing edge:', data.edgeId);
        const success = graphService.removeEdge(data.edgeId);
        if (success) {
            io.emit('graph:update', graphService.getGraph());
            socket.emit('edge-removed', { edgeId: data.edgeId, success: true });
            console.log('✅ Edge removed');
        } else {
            socket.emit('error', { message: 'Edge not found' });
        }
    });

    socket.on('restructure-graph', (data: { nodes: any[], edges: any[] }) => {
        console.log('🔄 Restructuring graph with new data');
        graphService.replaceGraph(data);
        io.emit('graph:update', graphService.getGraph());
        socket.emit('graph-restructured', { success: true });
        console.log('✅ Graph restructured');
    });

    socket.on('refine-graph', async (data: { conversationContext: string }) => {
        try {
            console.log('🔍 Refining graph based on current state');
            const currentGraph = graphService.getGraph();
            
            if (currentGraph.nodes.length === 0) {
                console.log('⏭️ No nodes to refine');
                return;
            }

            const refinementPrompt = `You are carefully cleaning up a knowledge graph. Remove ONLY clear redundancy and maintain useful nodes.

CURRENT CONVERSATION CONTEXT:
${data.conversationContext}

CURRENT GRAPH:
Nodes: ${JSON.stringify(currentGraph.nodes.map(n => ({ id: n.id, label: n.data.label })))}
Edges: ${JSON.stringify(currentGraph.edges.map(e => ({ source: e.source, target: e.target, relationship: e.relationship })))}

CONSERVATIVE CLEANUP RULES:
1. Remove ONLY nodes that are EXACT duplicates (same exact text)
2. Merge nodes only if they are clearly the same concept with different wording
3. Keep nodes that provide unique value or different perspectives
4. Preserve the most detailed and specific nodes
5. Only remove nodes if you're 100% certain they're redundant

EXAMPLES OF WHAT TO REMOVE (ONLY these):
- "User struggles with math" + "User struggles with math" → REMOVE ONE (exact duplicate)
- "AI will explain" + "AI intends to explain" → REMOVE BOTH (meta-talk)

EXAMPLES OF WHAT TO KEEP:
- "User struggles with math" + "User has difficulty with addition" → KEEP BOTH (different concepts)
- "Addition is combining numbers" + "Addition process" → KEEP BOTH (different aspects)

WHAT TO KEEP:
- All nodes that provide unique information
- Nodes with different perspectives on the same topic
- Specific, detailed concepts
- Actionable ideas

🎮 SPECIAL: CLASH ROYALE CONVERSATIONS
If and ONLY if this is about Clash Royale, when updating node labels:
- Use SPECIFIC card names instead of generic terms (e.g., "Hog Rider" not "unit")
- Include deck archetypes (e.g., "2.6 Hog Cycle", "Golem Night Witch Beatdown")
- Reference specific mechanics (e.g., "King tower activation", "Elixir counting")
- Keep strategy-specific nodes even if they seem similar (they represent different tactics!)

Return ONLY valid JSON (no markdown):
{
  "nodesToRemove": ["id1", "id2"],
  "nodesToUpdate": [
    {"id": "existing-id", "newLabel": "More specific label", "category": "problem|solution|technology|plan|action"}
  ],
  "edgesToAdd": [
    {"source": "parent-id", "target": "child-id", "relationship": "branches to|solves|implements"}
  ]
}

BE CONSERVATIVE: Only remove nodes that are clearly duplicates or meta-conversation!`;

            // Try multiple free models for refinement
            let response;
            console.log('🤖 Refinement prompt:', refinementPrompt);
            
            // Use OpenRouterService's automatic model fallback (paid first, then free)
            response = await openRouterService.chat(refinementPrompt);
            console.log('🤖 Refinement response:', response);

            const jsonMatch = response?.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('❌ No JSON found in refinement response');
                return;
            }

            const refinements = JSON.parse(jsonMatch[0]);
            console.log('✅ Parsed refinements:', refinements);

            // Apply refinements
            let changesMade = false;

            // Remove nodes
            if (refinements.nodesToRemove && Array.isArray(refinements.nodesToRemove)) {
                for (const nodeId of refinements.nodesToRemove) {
                    if (graphService.removeNode(nodeId)) {
                        console.log(`🗑️ Removed node: ${nodeId}`);
                        changesMade = true;
                    }
                }
            }

            // Update nodes
            if (refinements.nodesToUpdate && Array.isArray(refinements.nodesToUpdate)) {
                for (const update of refinements.nodesToUpdate) {
                    if (graphService.updateNode(update.id, { 
                        label: update.newLabel,
                        category: update.category 
                    })) {
                        console.log(`✏️ Updated node: ${update.id} -> ${update.newLabel}`);
                        changesMade = true;
                    }
                }
            }

            // Add edges
            if (refinements.edgesToAdd && Array.isArray(refinements.edgesToAdd)) {
                for (const edge of refinements.edgesToAdd) {
                    graphService.addEdge({
                        source: edge.source,
                        target: edge.target,
                        relationship: edge.relationship || 'relatesTo'
                    });
                    console.log(`➕ Added edge: ${edge.source} -> ${edge.target}`);
                    changesMade = true;
                }
            }

            if (changesMade) {
                graphService.recalculateTreeLayout();
                io.emit('graph:update', graphService.getGraph());
                socket.emit('graph-refined', { success: true });
                console.log('✅ Graph refinement complete');
            } else {
                console.log('ℹ️ No refinements needed');
            }

        } catch (error) {
            console.error('❌ Error refining graph:', error);
            socket.emit('error', { message: 'Failed to refine graph' });
        }
    });

    socket.on('finalize-graph', async (data: { conversationContext: string }) => {
        try {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('🔗 FINAL GRAPH FINALIZATION STARTED');
            console.log('═══════════════════════════════════════════════════════════');

            const currentGraph = graphService.getGraph();

            if (currentGraph.nodes.length === 0) {
                console.log('⏭️ No nodes to finalize - graph is empty');
                socket.emit('graph-finalized', { success: true, message: 'No nodes to finalize' });
                return;
            }

            console.log(`📊 Current graph state:`);
            console.log(`   - Total nodes: ${currentGraph.nodes.length}`);
            console.log(`   - Total edges: ${currentGraph.edges.length}`);

            // Log all nodes with their current connections
            console.log('\n📍 Current nodes:');
            currentGraph.nodes.forEach((node, idx) => {
                const incomingEdges = currentGraph.edges.filter(e => e.target === node.id);
                const outgoingEdges = currentGraph.edges.filter(e => e.source === node.id);
                const totalConnections = incomingEdges.length + outgoingEdges.length;

                console.log(`   ${idx + 1}. [${node.id}] "${node.data.label}"`);
                console.log(`      Category: ${node.data.category}`);
                console.log(`      Connections: ${totalConnections} (${incomingEdges.length} in, ${outgoingEdges.length} out)`);

                if (totalConnections === 0) {
                    console.log(`      ⚠️  ISOLATED NODE - NO CONNECTIONS`);
                }
            });

            console.log('\n🔗 Current edges:');
            currentGraph.edges.forEach((edge, idx) => {
                const sourceNode = currentGraph.nodes.find(n => n.id === edge.source);
                const targetNode = currentGraph.nodes.find(n => n.id === edge.target);
                console.log(`   ${idx + 1}. "${sourceNode?.data.label}" --[${edge.relationship}]--> "${targetNode?.data.label}"`);
            });

            // Create comprehensive prompt for AI
            const nodesList = currentGraph.nodes.map(n => ({
                id: n.id,
                label: n.data.label,
                category: n.data.category
            }));

            const edgesList = currentGraph.edges.map(e => ({
                source: e.source,
                target: e.target,
                relationship: e.relationship
            }));

            console.log('\n🤖 Preparing AI finalization prompt...');
            console.log(`   - Conversation length: ${data.conversationContext.length} chars`);

            const finalizationPrompt = `You are finalizing a knowledge graph after a conversation has ended.

FULL CONVERSATION CONTEXT:
${data.conversationContext}

CURRENT GRAPH STATE:
Nodes (${nodesList.length} total):
${JSON.stringify(nodesList, null, 2)}

Edges (${edgesList.length} total):
${JSON.stringify(edgesList, null, 2)}

YOUR TASK:
1. Analyze the ENTIRE conversation context and ALL existing nodes
2. Connect EVERY node to at least ONE other node (no isolated nodes allowed!)
3. Create meaningful, logical connections based on the conversation flow
4. Use appropriate relationship labels that describe WHY nodes are connected

🚨 CRITICAL REQUIREMENTS:
✓ You MUST use the EXACT "id" values from the nodes list above (the UUID strings like "a28357e2-a5f9-455c-bfc0-ca73c00e4e1e")
✓ DO NOT make up new IDs or use simplified names like "basic-addition" or "practice"
✓ COPY the exact UUID from the nodes list for both source and target
✓ EVERY single node MUST have AT LEAST one connection (incoming or outgoing)
✓ Connections should reflect actual conversation flow and logical relationships
✓ Use descriptive relationship labels (e.g., "leads to", "enables", "requires", "results in", "part of", "supports")
✓ Create hierarchical parent→child relationships where appropriate
✓ Connect related concepts even if they weren't explicitly linked in earlier processing

EXAMPLE - If nodes list contains:
[
  {"id": "abc-123-def", "label": "Addition", "category": "concept"},
  {"id": "xyz-789-ghi", "label": "Practice", "category": "method"}
]

Then your edge MUST use these EXACT IDs:
{
  "source": "abc-123-def",
  "target": "xyz-789-ghi",
  "relationship": "requires"
}

RELATIONSHIP TYPES TO USE:
- "leads to" - causal or sequential relationship
- "enables" - one thing makes another possible
- "requires" - dependency relationship
- "part of" - component/whole relationship
- "supports" - reinforcing relationship
- "contradicts" - opposing ideas
- "elaborates" - provides detail about
- "exemplifies" - specific example of general concept
- "implements" - concrete realization of abstract idea

🎮 SPECIAL: CLASH ROYALE CONVERSATIONS
If and ONLY if this conversation is about Clash Royale, create connections using game-specific relationships:
- "counters" - one card/strategy counters another (e.g., "Inferno Tower" counters "Golem")
- "synergizes with" - cards that work well together (e.g., "Hog Rider" synergizes with "Earthquake")
- "baits out" - strategy to bait opponent's response (e.g., "Goblin Barrel" baits out "Log")
- "pressures" - applying offensive pressure (e.g., "Split-lane push" pressures "Both towers")
- "defends against" - defensive strategy (e.g., "Cannon placement" defends against "Hog Rider")
- "outcycles" - faster cycle strategy (e.g., "2.6 Hog" outcycles "Heavy beatdown")
Use SPECIFIC Clash Royale terminology in your reasoning!

Return ONLY valid JSON (no markdown, no code blocks, no extra text):
{
  "edgesToAdd": [
    {
      "source": "EXACT-UUID-FROM-NODES-LIST",
      "target": "EXACT-UUID-FROM-NODES-LIST",
      "relationship": "descriptive relationship label",
      "reasoning": "Brief explanation of why this connection makes sense"
    }
  ],
  "summary": "Brief summary of the finalization (what connections were created and why)"
}

REMEMBER:
- USE EXACT UUIDs FROM THE NODES LIST - DO NOT INVENT NEW IDS
- Focus on creating NEW edges (don't duplicate existing ones)
- EVERY node must end up with at least one connection
- Make connections that capture the actual meaning and flow of the conversation
- Be thoughtful about relationship directions (source → target should make semantic sense)`;

            console.log('\n🤖 Sending finalization request to AI...');

            // Try multiple free models with exponential backoff
            let response;
            let aiSucceeded = false;

            try {
                // Use OpenRouterService's automatic model fallback (paid first, then free)
                response = await openRouterService.chat(finalizationPrompt);
                console.log(`   ✅ Model responded successfully`);
                aiSucceeded = true;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('   ❌ All AI models exhausted or rate limited:', errorMsg);
            }

            // Fallback: If all AI models fail, use simple rule-based connection
            if (!aiSucceeded || !response) {
                console.log('\n🔧 AI UNAVAILABLE - Using rule-based fallback to connect isolated nodes...');

                const isolatedNodes = currentGraph.nodes.filter(node => {
                    const connections = currentGraph.edges.filter(e =>
                        e.source === node.id || e.target === node.id
                    ).length;
                    return connections === 0;
                });

                console.log(`   Found ${isolatedNodes.length} isolated nodes`);

                let fallbackEdgesAdded = 0;

                // Simple strategy: Connect each isolated node to the most connected node
                if (isolatedNodes.length > 0) {
                    // Find the most connected node
                    let mostConnectedNode = currentGraph.nodes[0];
                    let maxConnections = 0;

                    currentGraph.nodes.forEach(node => {
                        const connections = currentGraph.edges.filter(e =>
                            e.source === node.id || e.target === node.id
                        ).length;
                        if (connections > maxConnections) {
                            maxConnections = connections;
                            mostConnectedNode = node;
                        }
                    });

                    console.log(`   Connecting isolated nodes to hub: "${mostConnectedNode.data.label}"`);

                    for (const isolatedNode of isolatedNodes) {
                        try {
                            graphService.addEdge({
                                source: mostConnectedNode.id,
                                target: isolatedNode.id,
                                relationship: 'relates to'
                            });
                            console.log(`   ✅ Connected: "${mostConnectedNode.data.label}" --> "${isolatedNode.data.label}"`);
                            fallbackEdgesAdded++;
                        } catch (error) {
                            console.error(`   ❌ Failed to connect ${isolatedNode.id}:`, error);
                        }
                    }
                }

                graphService.recalculateTreeLayout();
                io.emit('graph:update', graphService.getGraph());

                socket.emit('graph-finalized', {
                    success: true,
                    edgesAdded: fallbackEdgesAdded,
                    isolatedNodesRemaining: 0,
                    usedFallback: true,
                    summary: `Used rule-based fallback due to AI rate limits. Connected ${fallbackEdgesAdded} isolated nodes.`
                });

                console.log('✅ Fallback finalization complete');
                console.log('═══════════════════════════════════════════════════════════\n');
                return;
            }

            console.log('\n📥 AI Response received:');
            console.log(response);

            // Extract JSON more carefully - find first { and last }
            let jsonStr = '';
            const firstBrace = response.indexOf('{');
            const lastBrace = response.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
                console.error('❌ No valid JSON structure found in AI response');
                console.error('Raw response:', response);
                socket.emit('error', { message: 'Failed to parse AI finalization response' });
                return;
            }

            jsonStr = response.substring(firstBrace, lastBrace + 1);
            console.log('\n📦 Extracted JSON string:');
            console.log(jsonStr);

            let finalization;
            try {
                // Try to parse as-is first
                finalization = JSON.parse(jsonStr);
            } catch (parseError) {
                console.warn('⚠️ Initial JSON parse failed, attempting cleanup...');
                
                try {
                    // Clean up common JSON issues
                    let cleanedJson = jsonStr
                        // Remove trailing commas before closing brackets/braces
                        .replace(/,(\s*[}\]])/g, '$1')
                        // Fix missing commas between array elements
                        .replace(/\}(\s*)\{/g, '},$1{')
                        // Remove any trailing commas at the end
                        .replace(/,(\s*)$/g, '$1');
                    
                    finalization = JSON.parse(cleanedJson);
                    console.log('✅ JSON cleaned and parsed successfully');
                } catch (cleanupError) {
                    console.error('❌ JSON parse error after cleanup:', cleanupError);
                    console.error('Attempted to parse:', jsonStr);
                    socket.emit('error', { message: 'Failed to parse AI finalization response - invalid JSON' });
                    return;
                }
            }
            console.log('\n✅ Parsed AI finalization:');
            console.log(JSON.stringify(finalization, null, 2));

            let edgesAdded = 0;
            const addedEdgeDetails: Array<{source: string, target: string, relationship: string}> = [];

            // Add new edges
            if (finalization.edgesToAdd && Array.isArray(finalization.edgesToAdd)) {
                console.log(`\n➕ Adding ${finalization.edgesToAdd.length} new edges...`);

                for (const edge of finalization.edgesToAdd) {
                    try {
                        // Validate that source and target nodes exist
                        const sourceNode = currentGraph.nodes.find(n => n.id === edge.source);
                        const targetNode = currentGraph.nodes.find(n => n.id === edge.target);

                        if (!sourceNode) {
                            console.warn(`   ⚠️  Skipping edge: source node ID "${edge.source}" not found`);
                            console.warn(`      AI tried to use: "${edge.source}"`);
                            console.warn(`      Valid node IDs are:`);
                            currentGraph.nodes.forEach(n => {
                                console.warn(`        - ${n.id} ("${n.data.label}")`);
                            });
                            continue;
                        }

                        if (!targetNode) {
                            console.warn(`   ⚠️  Skipping edge: target node ID "${edge.target}" not found`);
                            console.warn(`      AI tried to use: "${edge.target}"`);
                            console.warn(`      Valid node IDs are:`);
                            currentGraph.nodes.forEach(n => {
                                console.warn(`        - ${n.id} ("${n.data.label}")`);
                            });
                            continue;
                        }

                        // Check if edge already exists
                        const edgeExists = currentGraph.edges.some(
                            e => e.source === edge.source && e.target === edge.target
                        );

                        if (edgeExists) {
                            console.log(`   ⏭️  Skipping duplicate edge: ${edge.source} -> ${edge.target}`);
                            continue;
                        }

                        // sourceNode and targetNode already found above during validation

                        const newEdge = graphService.addEdge({
                            source: edge.source,
                            target: edge.target,
                            relationship: edge.relationship || 'relates to'
                        });

                        edgesAdded++;
                        addedEdgeDetails.push({
                            source: edge.source,
                            target: edge.target,
                            relationship: edge.relationship || 'relates to'
                        });

                        console.log(`   ✅ Added: "${sourceNode?.data.label}" --[${edge.relationship}]--> "${targetNode?.data.label}"`);
                        if (edge.reasoning) {
                            console.log(`      Reasoning: ${edge.reasoning}`);
                        }
                    } catch (error) {
                        console.error(`   ❌ Error adding edge:`, error);
                    }
                }
            }

            // Validate that all nodes are now connected
            console.log('\n🔍 Validating node connections after finalization...');
            const finalGraph = graphService.getGraph();
            const isolatedNodes: Array<{id: string, label: string}> = [];

            finalGraph.nodes.forEach(node => {
                const incomingEdges = finalGraph.edges.filter(e => e.target === node.id);
                const outgoingEdges = finalGraph.edges.filter(e => e.source === node.id);
                const totalConnections = incomingEdges.length + outgoingEdges.length;

                if (totalConnections === 0) {
                    isolatedNodes.push({ id: node.id, label: node.data.label });
                    console.log(`   ⚠️  STILL ISOLATED: [${node.id}] "${node.data.label}"`);
                } else {
                    console.log(`   ✅ Connected: [${node.id}] "${node.data.label}" (${totalConnections} connections)`);
                }
            });

            // If AI failed to connect isolated nodes, use fallback
            if (isolatedNodes.length > 0) {
                console.log('\n🔧 AI created invalid node IDs - Using rule-based fallback for remaining isolated nodes...');
                console.log(`   ${isolatedNodes.length} nodes still need connections`);

                // Find the most connected node (hub)
                let mostConnectedNode = finalGraph.nodes[0];
                let maxConnections = 0;

                finalGraph.nodes.forEach(node => {
                    const connections = finalGraph.edges.filter(e =>
                        e.source === node.id || e.target === node.id
                    ).length;
                    if (connections > maxConnections) {
                        maxConnections = connections;
                        mostConnectedNode = node;
                    }
                });

                console.log(`   Connecting to hub node: "${mostConnectedNode.data.label}" (${maxConnections} connections)`);

                let fallbackEdgesAdded = 0;
                for (const isolatedNode of isolatedNodes) {
                    try {
                        // Check if this edge would be a duplicate
                        const wouldBeDuplicate = finalGraph.edges.some(
                            e => (e.source === mostConnectedNode.id && e.target === isolatedNode.id) ||
                                 (e.source === isolatedNode.id && e.target === mostConnectedNode.id)
                        );

                        if (!wouldBeDuplicate) {
                            graphService.addEdge({
                                source: mostConnectedNode.id,
                                target: isolatedNode.id,
                                relationship: 'relates to'
                            });
                            console.log(`   ✅ Connected: "${mostConnectedNode.data.label}" --> "${isolatedNode.label}"`);
                            fallbackEdgesAdded++;
                            edgesAdded++;
                        }
                    } catch (error) {
                        console.error(`   ❌ Failed to connect "${isolatedNode.label}":`, error);
                    }
                }

                console.log(`   Fallback added ${fallbackEdgesAdded} edges`);

                // Re-validate after fallback
                isolatedNodes.length = 0; // Clear the array
                finalGraph.nodes.forEach(node => {
                    const connections = graphService.getGraph().edges.filter(e =>
                        e.source === node.id || e.target === node.id
                    ).length;
                    if (connections === 0) {
                        isolatedNodes.push({ id: node.id, label: node.data.label });
                    }
                });
            }

            // Recalculate tree layout after finalization
            graphService.recalculateTreeLayout();

            // Broadcast update to all clients
            io.emit('graph:update', graphService.getGraph());

            console.log('\n═══════════════════════════════════════════════════════════');
            console.log('✅ FINAL GRAPH FINALIZATION COMPLETE');
            console.log(`   - Edges added: ${edgesAdded}`);
            console.log(`   - Total nodes: ${graphService.getGraph().nodes.length}`);
            console.log(`   - Total edges: ${graphService.getGraph().edges.length}`);
            console.log(`   - Isolated nodes remaining: ${isolatedNodes.length}`);
            if (isolatedNodes.length > 0) {
                console.log(`   ⚠️  WARNING: Some nodes are still isolated!`);
                isolatedNodes.forEach(node => {
                    console.log(`      - "${node.label}"`);
                });
            }
            if (finalization.summary) {
                console.log(`\n📝 AI Summary: ${finalization.summary}`);
            }
            console.log('═══════════════════════════════════════════════════════════\n');

            socket.emit('graph-finalized', {
                success: true,
                edgesAdded,
                isolatedNodesRemaining: isolatedNodes.length,
                isolatedNodes,
                summary: finalization.summary
            });

        } catch (error) {
            console.error('═══════════════════════════════════════════════════════════');
            console.error('❌ ERROR IN FINAL GRAPH FINALIZATION');
            console.error('═══════════════════════════════════════════════════════════');
            console.error('Error details:', error);
            console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
            console.error('═══════════════════════════════════════════════════════════\n');
            socket.emit('error', { message: 'Failed to finalize graph' });
        }
    });
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8082',
        'https://api.vapi.ai'
    ],
    credentials: true
})); // Enable CORS
app.use(morgan('combined')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Routes
app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'CalHacks Backend API with Gemini AI',
        version: '1.0.0',
        status: 'running',
        features: ['gemini-ai', 'typescript', 'openrouter']
    });
});

app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// AI Chat endpoint
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { message, model = 'google/gemini-pro' } = req.body;

        if (!message) {
            res.status(400).json({ error: 'Message is required' });
            return;
        }

        const response = await openRouterService.chat(message, model);
        res.json({ response });
    } catch (error) {
        next(error);
    }
});

// Process text through Gemini and generate graph (for testing without Vapi)
app.post('/api/process-text', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { text } = req.body;

        if (!text) {
            res.status(400).json({ error: 'Text is required' });
            return;
        }

        console.log('📝 Processing text:', text);

        // Create a prompt for Gemini to extract nodes and edges
        const prompt = `You are analyzing a conversation and extracting structured information.

Conversation: "${text}"

Extract key nodes (topics, decisions, actions, systems) and relationships from this conversation.
Return a JSON object with this structure:
{
  "nodes": [
    {"label": "Node name", "type": "Decision|Action|System|Input|Output"}
  ],
  "edges": [
    {"source": "Source node label", "target": "Target node label", "label": "relationship"}
  ]
}

Node types:
- Decision: A decision point or choice made
- Action: A task or action to be taken
- System: A service, database, or system component
- Input: Starting point or initial topic
- Output: Result or outcome

Return ONLY valid JSON, no other text.`;

        const response = await openRouterService.chat(prompt, 'google/gemini-2.0-flash-exp:free');
        
        console.log('🤖 Gemini response:', response);

        // Parse the JSON response
        let graphData;
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                graphData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Gemini response:', parseError);
            res.status(500).json({ error: 'Failed to parse AI response', details: response });
            return;
        }

        // Add nodes and edges to the graph
        const { nodes = [], edges = [] } = graphData;
        const nodeIdMap: Record<string, string> = {};

        // Add nodes
        const addedNodes = nodes.map((node: any) => {
            const newNode = graphService.addNode({
                label: node.label,
                category: node.type || 'System',
                metadata: { source: 'manual-text' }
            });
            nodeIdMap[node.label] = newNode.id;
            return newNode;
        });

        // Add edges
        const addedEdges = edges.map((edge: any) => {
            const sourceId = nodeIdMap[edge.source] || edge.source;
            const targetId = nodeIdMap[edge.target] || edge.target;
            return graphService.addEdge(sourceId, targetId, edge.label);
        });

        // Broadcast to all connected clients
        io.emit('graph:update', graphService.getGraph());
        io.emit('graph:nodeAdded', { nodes: addedNodes, edges: addedEdges });

        console.log(`✅ Added ${addedNodes.length} nodes and ${addedEdges.length} edges`);

        res.json({
            success: true,
            nodes: addedNodes,
            edges: addedEdges,
            geminiResponse: response
        });
    } catch (error) {
        next(error);
    }
});

// Get available models
app.get('/api/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await openRouterService.getModels();
        res.json({ models });
    } catch (error) {
        next(error);
    }
});

// ==================== VAPI INTEGRATION ENDPOINTS ====================

// Get Vapi assistant configuration
app.get('/api/vapi/config', (req: Request, res: Response) => {
    try {
        const config = vapiService.getAssistantConfig();
        res.json(config);
    } catch (error) {
        console.error('Error getting Vapi config:', error);
        res.status(500).json({ error: 'Failed to get Vapi configuration' });
    }
});

// Webhook endpoint for Vapi function calls
app.post('/api/vapi/function-call', async (req: Request, res: Response): Promise<void> => {
    try {
        const { message } = req.body;

        console.log('📞 Vapi function call received:', JSON.stringify(message, null, 2));

        // Extract the function call from Vapi
        if (message?.toolCalls && message.toolCalls.length > 0) {
            const toolCall = message.toolCalls[0];
            const functionName = toolCall.function?.name;
            
            if (functionName === 'updateGraph') {
                // Parse the function arguments
                let args;
                try {
                    args = typeof toolCall.function.arguments === 'string' 
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;
                } catch (e) {
                    console.error('Error parsing function arguments:', e);
                    res.status(400).json({ error: 'Invalid function arguments' });
                    return;
                }

                console.log('📊 Updating graph with:', args);

                const { nodes = [], edges = [] } = args;

                // Create a map to track node IDs by label
                const nodeIdMap: Record<string, string> = {};

                // Add nodes to graph (React Flow format)
                const addedNodes = nodes.map((node: any) => {
                    const newNode = graphService.addNode({
                        label: node.label,
                        category: node.type || node.category, // Support both 'type' and 'category' from Gemini
                        importance: node.importance || 'small', // Add importance from Vapi
                        metadata: node.data
                    });
                    nodeIdMap[node.label] = newNode.id;
                    return newNode;
                });

                // Add edges (map labels to IDs)
                const addedEdges = edges.map((edge: any) => {
                    const sourceId = nodeIdMap[edge.source] || edge.source;
                    const targetId = nodeIdMap[edge.target] || edge.target;
                    return graphService.addEdge(sourceId, targetId, edge.label);
                });

                // Broadcast update to all connected clients via WebSocket
                io.emit('graph:update', graphService.getGraph());
                io.emit('graph:nodeAdded', { nodes: addedNodes, edges: addedEdges });

                console.log('✅ Graph updated and broadcasted');

                // Respond to Vapi
                res.json({
                    result: `Successfully added ${addedNodes.length} nodes and ${addedEdges.length} edges`,
                    nodes: addedNodes,
                    edges: addedEdges
                });
                return;
            }
        }

        // Default response if no function call was recognized
        res.json({ result: 'No action taken' });
    } catch (error) {
        console.error('Error handling Vapi function call:', error);
        res.status(500).json({ error: 'Failed to process function call' });
    }
});

// General Vapi webhook endpoint for other events
app.post('/api/vapi/webhook', (req: Request, res: Response) => {
    try {
        const event = req.body;
        console.log('🔔 Vapi webhook event:', event.type || 'unknown');

        // Handle different Vapi events
        switch (event.type) {
            case 'transcript':
                // Store transcript with speaker information
                if (event.transcript) {
                    const speaker = event.speaker || 'unknown';
                    graphService.addTranscript(speaker, event.transcript);
                    
                    // Broadcast to clients with speaker info
                    io.emit('transcript:update', {
                        text: event.transcript,
                        speaker: speaker,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
            
            case 'conversation-start':
                console.log('🎙️ Conversation started');
                io.emit('conversation:started');
                break;
            
            case 'conversation-end':
                console.log('🛑 Conversation ended');
                io.emit('conversation:ended');
                break;
            
            case 'function-call':
                // This should be handled by /api/vapi/function-call endpoint
                console.log('Function call received via webhook');
                break;
            
            default:
                console.log('Unknown event type:', event.type);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error handling Vapi webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// ==================== AI SUMMARY ENDPOINT ====================

// Generate AI summary for a node
app.post('/api/node/summary', async (req: Request, res: Response) => {
    try {
        const { nodeId, contextWindow } = req.body;
        
        const node = graphService.getGraph().nodes.find(n => n.id === nodeId);
        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        
        // Get recent transcripts for context
        let transcripts = graphService.getRecentTranscripts(contextWindow || 15000);
        console.log(`📝 Found ${transcripts.length} transcripts for summary generation`);
        
        // If no transcripts available (server restart), try to get conversation context from node metadata
        let transcriptsText = '';
        if (transcripts.length === 0) {
            // Check if node has conversation context in metadata
            if (node.data.metadata?.conversationContext) {
                transcriptsText = node.data.metadata.conversationContext;
                console.log(`📝 Using conversation context from node metadata: ${transcriptsText.length} characters`);
            } else {
                res.status(400).json({ error: 'No conversation context available. Please start a conversation first.' });
                return;
            }
        } else {
            transcriptsText = transcripts.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
            console.log(`📝 Transcript text length: ${transcriptsText.length} characters`);
        }
        
        // Use OpenRouter to generate summary
        const summaryPrompt = `Given this conversation context from the last ${Math.floor((contextWindow || 15000) / 1000)} seconds:

${transcriptsText}

Please provide a brief 2-3 sentence summary of what was discussed about: "${node.data.label}"

Be specific and focus on the key points related to this topic.`;

        // Use OpenRouterService's automatic model fallback (paid first, then free)
        const summary = await openRouterService.chat(summaryPrompt);
        
        console.log(`✅ Generated summary for node "${node.data.label}": ${summary.substring(0, 100)}...`);
        
        res.json({ 
            summary,
            nodeId,
            contextWindow: contextWindow || 15000
        });
    } catch (error) {
        console.error('❌ Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// ==================== VAPI RESPONSE GENERATION ====================

/**
 * Generate an intelligent response using Gemini for Vapi
 */
app.post('/api/generate-response', async (req: Request, res: Response) => {
    try {
        const { history, lastUserMessage } = req.body;

        if (!history || !lastUserMessage) {
            res.status(400).json({ error: 'Missing history or lastUserMessage' });
            return;
        }

        console.log('🤖 Generating Helios response with Gemini...');
        console.log('📜 Conversation history:', history);
        console.log('💬 Last user message:', lastUserMessage);

        // Create a prompt for Gemini to generate a helpful response
        const prompt = `You are Helios, a helpful AI assistant in a conversation. The user has asked for your opinion or advice.

CONVERSATION HISTORY:
${history}

The user just said: "${lastUserMessage}"

Provide a brief (1-2 sentences), helpful, and insightful response about the topic being discussed. Be conversational and supportive. Focus on asking clarifying questions or offering practical advice.`;

        // Use OpenRouter service to call Gemini
        const aiResponse = await openRouterService.chat(prompt);

        console.log('✅ Generated response:', aiResponse);

        res.json({ text: aiResponse });

    } catch (error) {
        console.error('❌ Error generating Vapi response:', error);
        res.status(500).json({ 
            error: 'Failed to generate response',
            text: "I'm having trouble thinking right now. Could you rephrase that?"
        });
    }
});

// ==================== GRAPH MANAGEMENT ENDPOINTS ====================

// Get current graph
app.get('/api/graph', (req: Request, res: Response) => {
    res.json(graphService.getGraph());
});

// Clear graph
app.post('/api/graph/clear', (req: Request, res: Response) => {
    graphService.clearGraph();
    io.emit('graph:update', graphService.getGraph());
    res.json({ message: 'Graph cleared' });
});

// Manually add node (for testing)
app.post('/api/graph/node', (req: Request, res: Response): void => {
    try {
        const { label, category, type, metadata, position } = req.body;
        
        if (!label || !category) {
            res.status(400).json({ error: 'Label and category are required' });
            return;
        }

        const node = graphService.addNode({ 
            label, 
            category,
            type,
            metadata,
            position
        });
        io.emit('graph:update', graphService.getGraph());
        
        res.json({ node });
    } catch (error) {
        console.error('Error adding node:', error);
        res.status(500).json({ error: 'Failed to add node' });
    }
});

// Manually add edge (for testing)
app.post('/api/graph/edge', (req: Request, res: Response): void => {
    try {
        const { source, target, label, type, animated } = req.body;
        
        if (!source || !target) {
            res.status(400).json({ error: 'Source and target are required' });
            return;
        }

        const edge = graphService.addEdge(source, target, label, type, animated);
        io.emit('graph:update', graphService.getGraph());
        
        res.json({ edge });
    } catch (error) {
        console.error('Error adding edge:', error);
        res.status(500).json({ error: 'Failed to add edge' });
    }
});

// Merge multiple nodes into one
app.post('/api/graph/merge', (req: Request, res: Response): void => {
    try {
        const { nodeIds, mergedLabel, mergedCategory } = req.body;
        
        if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
            res.status(400).json({ error: 'At least 2 node IDs are required' });
            return;
        }
        
        if (!mergedLabel) {
            res.status(400).json({ error: 'Merged label is required' });
            return;
        }

        const mergedNode = graphService.mergeNodes(nodeIds, mergedLabel, mergedCategory);
        
        if (!mergedNode) {
            res.status(400).json({ error: 'Failed to merge nodes' });
            return;
        }

        // Broadcast update to all clients
        io.emit('graph:update', graphService.getGraph());
        io.emit('nodes:merged', { mergedNode, sourceNodeIds: nodeIds });
        
        res.json({ 
            message: 'Nodes merged successfully',
            mergedNode,
            mergedFrom: nodeIds
        });
    } catch (error) {
        console.error('Error merging nodes:', error);
        res.status(500).json({ error: 'Failed to merge nodes' });
    }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
    console.log(`🤖 AI Chat at http://localhost:${PORT}/api/chat`);
    console.log(`🔌 WebSocket ready for real-time updates`);
    console.log(`🎙️  Vapi webhook at http://localhost:${PORT}/api/vapi/webhook`);
    console.log(`📊 Vapi function calls at http://localhost:${PORT}/api/vapi/function-call`);
});

export default app;
