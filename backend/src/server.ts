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
            
            const prompt = `You are building a HIERARCHICAL knowledge graph. Extract 3-5 KEY IDEAS ONLY from this conversation.

CONVERSATION:
${data.text}

STRICT RULES:
1. Extract ONLY 3-5 MAIN IDEAS (not every statement)
2. NO REDUNDANCY - if two ideas are semantically similar, pick the most specific one
3. Each node must be UNIQUE and NON-OVERLAPPING
4. Create a HIERARCHY - parent concepts branch to child details
5. Be EXTREMELY SPECIFIC with details (when, how, why, what)

EXAMPLES:
❌ BAD (redundant):
- "User struggles with math"
- "User has difficulty with addition"
- "User finds addition challenging"
→ These are all the same! Pick ONE: "User struggles to understand addition process"

✅ GOOD (hierarchical, non-redundant):
- "User struggles to understand addition process" (PARENT)
  ├─ "Break down addition into step-by-step visual examples" (CHILD - solution)
  └─ "Use physical objects like blocks to demonstrate combining quantities" (CHILD - implementation)

WHAT TO EXTRACT:
- Main problem/topic (1 node)
- Key solutions or approaches (1-2 nodes)
- Specific implementation details (1-2 nodes)

WHAT TO SKIP:
- Repetitive statements
- Semantically duplicate ideas
- Vague generalizations
- Filler conversation

EDGES - Create DIRECTED HIERARCHY:
- Parent → Child (main idea branches to details)
- Problem → Solution
- Solution → Implementation
- Concept → Example

Return ONLY valid JSON (no markdown):
{
  "nodes": [
    {"id": "main-topic", "label": "Main idea with full context", "category": "problem|solution|technology|plan|action"}
  ],
  "edges": [
    {"source": "parent-id", "target": "child-id", "relationship": "branches to|solves|implements|exemplifies"}
  ]
}

REMEMBER: 
- MAXIMUM 5 nodes
- NO semantic duplicates
- CREATE hierarchy with directed edges
- Each node should be a DISTINCT concept`;

            const response = await openRouterService.chat(prompt, 'google/gemini-2.0-flash-exp:free');
            console.log('🤖 Gemini response:', response);

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
                        const existingWords = existingLabel.split(/\s+/).filter(w => w.length > 3);
                        const newWords = newLabel.split(/\s+/).filter(w => w.length > 3);
                        const commonWords = existingWords.filter(w => newWords.includes(w));
                        
                        // If more than 60% of words overlap, consider it a duplicate
                        const similarity = commonWords.length / Math.min(existingWords.length, newWords.length);
                        return similarity > 0.6;
                    });
                    
                    if (isDuplicate) {
                        console.log(`⏭️ Skipping duplicate node: ${node.label}`);
                        continue;
                    }
                    
                    const nodeId = graphService.addNode({
                        id: node.id || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        label: node.label,
                        category: node.category || 'service'
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
            socket.emit('error', { message: 'Failed to process transcript' });
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

            const refinementPrompt = `You are AGGRESSIVELY cleaning up a knowledge graph. Remove ALL redundancy and create clear hierarchy.

CURRENT CONVERSATION CONTEXT:
${data.conversationContext}

CURRENT GRAPH:
Nodes: ${JSON.stringify(currentGraph.nodes.map(n => ({ id: n.id, label: n.data.label })))}
Edges: ${JSON.stringify(currentGraph.edges.map(e => ({ source: e.source, target: e.target, relationship: e.relationship })))}

AGGRESSIVE CLEANUP RULES:
1. REMOVE ALL semantically duplicate nodes (keep only the most specific one)
2. REMOVE vague or generic nodes
3. Target: 3-7 nodes MAXIMUM in final graph
4. CREATE hierarchical edges between remaining nodes
5. Ensure nodes form a TREE structure (parent → children)

EXAMPLES OF DUPLICATES TO REMOVE:
- "User struggles with math" + "User has difficulty with addition" → KEEP ONLY ONE
- "Addition is combining numbers" + "Addition process" → KEEP ONLY ONE
- "AI will explain" + "AI intends to explain" → REMOVE BOTH (meta-talk)

WHAT TO KEEP:
- Most specific, detailed version of each concept
- Nodes that form a clear parent-child hierarchy
- Actionable, concrete ideas

WHAT TO REMOVE:
- Semantic duplicates (similar meaning)
- Vague generalizations
- Meta-conversation nodes
- Nodes without clear parent/child relationships

Return ONLY valid JSON (no markdown):
{
  "nodesToRemove": ["id1", "id2", "id3"],
  "nodesToUpdate": [
    {"id": "existing-id", "newLabel": "More specific label", "category": "problem|solution|technology|plan|action"}
  ],
  "edgesToAdd": [
    {"source": "parent-id", "target": "child-id", "relationship": "branches to|solves|implements"}
  ]
}

BE AGGRESSIVE: Remove 50-70% of nodes if they're redundant!`;

            const response = await openRouterService.chat(refinementPrompt, 'google/gemini-2.0-flash-exp:free');
            console.log('🤖 Refinement response:', response);

            const jsonMatch = response.match(/\{[\s\S]*\}/);
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
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
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
        const transcripts = graphService.getRecentTranscripts(contextWindow || 15000);
        const transcriptsText = transcripts.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
        
        // Use OpenRouter to generate summary
        const summaryPrompt = `Given this conversation context from the last ${Math.floor((contextWindow || 15000) / 1000)} seconds:

${transcriptsText}

Please provide a brief 2-3 sentence summary of what was discussed about: "${node.data.label}"

Be specific and focus on the key points related to this topic.`;

        const summary = await openRouterService.chat(summaryPrompt, 'google/gemini-pro');
        
        res.json({ 
            summary,
            nodeId,
            contextWindow: contextWindow || 15000
        });
    } catch (error) {
        console.error('Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
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
