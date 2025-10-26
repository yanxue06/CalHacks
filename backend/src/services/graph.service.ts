import { randomUUID } from 'crypto';
import { Node, Edge, Graph, NodeInput, NodeImportance, NodeCategory } from '../types';

export class GraphService {
    private graph: Graph;
    private transcriptHistory: Array<{
        speaker: string;
        text: string;
        timestamp: string;
    }> = [];
    
    // Speaker tracking
    private speakerMap: Map<string, { name: string; initials: string; count: number }> = new Map();
    private speakerCounter: number = 0;

    // Tree layout configuration
    private readonly TREE_VERTICAL_SPACING = 200; // Vertical space between levels
    private readonly TREE_HORIZONTAL_SPACING = 350; // Horizontal space between siblings
    private readonly TREE_ROOT_Y = 50; // Y position of root nodes (top of tree)
    private readonly TREE_ROOT_X_START = 600; // Starting X position for root nodes
    private readonly MAX_TREE_DEPTH = 6; // Maximum depth to prevent infinite nesting

    constructor() {
        this.graph = {
            nodes: [],
            edges: []
        };
    }
    
    /**
     * Get or create speaker info from conversation context
     * Tries to detect names from conversation, otherwise assigns User 1, User 2, etc.
     */
    getSpeakerInfo(speaker: string, conversationContext?: string): { name: string; initials: string } {
        // Check if we already have this speaker
        if (this.speakerMap.has(speaker)) {
            return this.speakerMap.get(speaker)!;
        }
        
        // Try to detect name from conversation context
        let detectedName: string | null = null;
        if (conversationContext) {
            // Look for patterns like "I'm [Name]", "My name is [Name]", "This is [Name]"
            const namePatterns = [
                /(?:i'm|i am|my name is|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /^([A-Z][a-z]+):\s/m  // Speaker format like "John: hello"
            ];
            
            for (const pattern of namePatterns) {
                const match = conversationContext.match(pattern);
                if (match && match[1]) {
                    detectedName = match[1].trim();
                    break;
                }
            }
        }
        
        // If no name detected, assign User 1, User 2, etc.
        const name = detectedName || `User ${++this.speakerCounter}`;
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        const speakerInfo = { name, initials, count: 1 };
        this.speakerMap.set(speaker, speakerInfo);
        
        console.log(`👤 Registered speaker "${speaker}" as "${name}" (${initials})`);
        return speakerInfo;
    }

    getGraph(): Graph {
        return this.graph;
    }

    /**
     * Clear all nodes and edges from the graph
     */
    clear(): void {
        this.graph = {
            nodes: [],
            edges: []
        };
        this.transcriptHistory = [];
    }

    /**
     * Remove a specific node and all its edges
     */
    removeNode(nodeId: string): boolean {
        const nodeIndex = this.graph.nodes.findIndex(node => node.id === nodeId);
        if (nodeIndex === -1) return false;
        
        // Remove the node
        this.graph.nodes.splice(nodeIndex, 1);
        
        // Remove all edges connected to this node
        this.graph.edges = this.graph.edges.filter(edge => 
            edge.source !== nodeId && edge.target !== nodeId
        );
        
        return true;
    }

    /**
     * Remove a specific edge
     */
    removeEdge(edgeId: string): boolean {
        const edgeIndex = this.graph.edges.findIndex(edge => edge.id === edgeId);
        if (edgeIndex === -1) return false;
        
        this.graph.edges.splice(edgeIndex, 1);
        return true;
    }

    /**
     * Update an existing node
     */
    updateNode(nodeId: string, updates: Partial<NodeInput>): boolean {
        const nodeIndex = this.graph.nodes.findIndex(node => node.id === nodeId);
        if (nodeIndex === -1) return false;
        
        this.graph.nodes[nodeIndex] = {
            ...this.graph.nodes[nodeIndex],
            ...updates,
            id: nodeId // Ensure ID doesn't change
        };
        
        return true;
    }

    /**
     * Replace the entire graph with new data (for restructuring)
     */
    replaceGraph(newGraph: { nodes: any[], edges: any[] }): void {
        this.graph = {
            nodes: newGraph.nodes.map(node => {
                const importance: NodeImportance = node.importance || 'medium';
                const size = this.getSizeForImportance(importance);

                return {
                    id: node.id || randomUUID(),
                    type: node.type || node.category?.toLowerCase() || 'default',
                    position: node.position || { x: 0, y: 0 },
                    size,
                    data: {
                        label: node.label || node.data?.label,
                        category: (node.category || node.data?.category || 'System') as NodeCategory,
                        timestamp: node.data?.timestamp || new Date().toISOString(),
                        importance,
                        metadata: node.metadata || node.data?.metadata
                    }
                };
            }),
            edges: newGraph.edges.map(edge => ({
                id: edge.id || randomUUID(),
                source: edge.source,
                target: edge.target,
                label: edge.label,
                relationship: edge.relationship,
                type: edge.type || 'smoothstep',
                animated: edge.animated || false
            }))
        };
    }

    /**
     * Add a transcript entry with speaker information
     * Transcripts are kept for 5 minutes to support AI summary generation
     */
    addTranscript(speaker: string, text: string): void {
        const transcript = {
            speaker,
            text,
            timestamp: new Date().toISOString()
        };
        this.transcriptHistory.push(transcript);
        
        // Keep only last 5 minutes of transcripts (increased for AI summary feature)
        const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
        this.transcriptHistory = this.transcriptHistory.filter(
            t => new Date(t.timestamp).getTime() > fiveMinutesAgo
        );
    }

    /**
     * Get recent transcripts within a time window
     */
    getRecentTranscripts(durationMs: number = 15000): Array<{
        speaker: string;
        text: string;
        timestamp: string;
    }> {
        const cutoff = Date.now() - durationMs;
        return this.transcriptHistory.filter(
            t => new Date(t.timestamp).getTime() > cutoff
        );
    }

    /**
     * Get all transcripts
     */
    getAllTranscripts(): Array<{ speaker: string; text: string; timestamp: string; }> {
        return [...this.transcriptHistory];
    }

    /**
     * Calculate node size based on importance
     */
    private getSizeForImportance(importance: NodeImportance): { width: number; height: number } {
        const sizeMap = {
            small: { width: 120, height: 80 },
            medium: { width: 200, height: 100 },
            large: { width: 300, height: 150 }
        };
        return sizeMap[importance];
    }

    /**
     * Calculate the depth (level) of a node in the tree based on parent relationships
     */
    private calculateNodeDepth(nodeId: string, visited: Set<string> = new Set()): number {
        // Prevent infinite loops
        if (visited.has(nodeId)) return 0;
        visited.add(nodeId);

        // Find all parent edges (edges pointing TO this node)
        const parentEdges = this.graph.edges.filter(edge => edge.target === nodeId);

        if (parentEdges.length === 0) {
            // This is a root node (no parents)
            return 0;
        }

        // Node's depth is 1 + max depth of its parents
        const parentDepths = parentEdges.map(edge =>
            this.calculateNodeDepth(edge.source, visited)
        );

        const calculatedDepth = Math.max(...parentDepths) + 1;
        
        // Enforce maximum depth limit
        return Math.min(calculatedDepth, this.MAX_TREE_DEPTH);
    }

    /**
     * Calculate tree position for a node based on its relationships
     */
    private calculateTreePosition(nodeId: string): { x: number; y: number } {
        const depth = this.calculateNodeDepth(nodeId);

        // Y position based on depth (level)
        const y = this.TREE_ROOT_Y + (depth * this.TREE_VERTICAL_SPACING);

        // Find siblings at the same depth
        const nodesAtDepth = this.graph.nodes.filter(node => {
            const nodeDepth = this.calculateNodeDepth(node.id);
            return nodeDepth === depth;
        });

        // X position: spread siblings horizontally
        const siblingIndex = nodesAtDepth.length; // This will be the next sibling
        const totalWidth = (siblingIndex + 1) * this.TREE_HORIZONTAL_SPACING;
        const startX = this.TREE_ROOT_X_START - (totalWidth / 2);
        const x = startX + (siblingIndex * this.TREE_HORIZONTAL_SPACING);

        return { x, y };
    }

    /**
     * Find a non-overlapping position for a node (LEGACY - replaced by tree layout)
     */
    private findNonOverlappingPosition(size: { width: number; height: number }): { x: number; y: number } {
        const padding = 40; // Extra space between nodes
        const gridSize = 100; // Grid increment size
        
        // Try positions in a tree-like pattern (wider horizontal spread, less vertical)
        for (let radius = 0; radius < 20; radius++) {
            for (let theta = 0; theta < 360; theta += 15) {
                const radians = (theta * Math.PI) / 180;
                // Tree-like positioning: spread horizontally more than vertically
                const x = 500 + Math.cos(radians) * radius * gridSize * 1.5;
                const y = 600 - Math.sin(radians) * radius * gridSize * 0.5;
                
                const wouldOverlap = this.graph.nodes.some(node => {
                    const nodeSize = node.size || { width: 120, height: 80 };
                    return (
                        x < node.position.x + nodeSize.width + padding &&
                        x + size.width + padding > node.position.x &&
                        y < node.position.y + nodeSize.height + padding &&
                        y + size.height + padding > node.position.y
                    );
                });
                
                if (!wouldOverlap) {
                    return { x, y };
                }
            }
        }
        
        // Fallback: return a position away from existing nodes
        const lastNode = this.graph.nodes[this.graph.nodes.length - 1];
        if (lastNode) {
            const nodeSize = lastNode.size || { width: 120, height: 80 };
            return {
                x: lastNode.position.x + nodeSize.width + padding,
                y: lastNode.position.y
            };
        }
        
        return { x: 100, y: 100 };
    }

    /**
     * Add a node to the graph (React Flow compatible)
     */
    addNode(input: NodeInput): Node {
        const importance: NodeImportance = input.importance || 'small';
        const size = this.getSizeForImportance(importance);
        const nodeId = randomUUID();
        
        // Calculate position - use provided position or calculate tree position
        let position: { x: number; y: number };
        if (input.position) {
            position = input.position;
        } else {
            // For initial positioning, use a simple grid-based approach
            // The tree layout will be recalculated after edges are added
            const nodeCount = this.graph.nodes.length;
            const spacingX = 300;
            const spacingY = 200;
            const nodesPerRow = 4;
            
            position = {
                x: (nodeCount % nodesPerRow) * spacingX + 100,
                y: Math.floor(nodeCount / nodesPerRow) * spacingY + 100
            };
        }
        
        const newNode: Node = {
            id: nodeId,
            type: input.type || input.category.toLowerCase(), // Use category as default type
            position,
            size,  // Add size to node
            data: {
                label: input.label,
                category: input.category,
                timestamp: new Date().toISOString(),
                importance,  // Add importance to data
                metadata: input.metadata
            }
        };

        this.graph.nodes.push(newNode);
        return newNode;
    }

    /**
     * Add an edge between two nodes (React Flow compatible)
     * Supports both object and individual parameter calling patterns
     */
    addEdge(
        sourceOrEdge: string | { source: string; target: string; label?: string; relationship?: string; type?: string; animated?: boolean },
        target?: string,
        label?: string,
        type?: string,
        animated?: boolean
    ): Edge {
        let edgeData: { source: string; target: string; label?: string; relationship?: string; type?: string; animated?: boolean };

        // Handle object parameter
        if (typeof sourceOrEdge === 'object') {
            edgeData = sourceOrEdge;
        } else {
            // Handle individual parameters
            edgeData = {
                source: sourceOrEdge,
                target: target!,
                label,
                type,
                animated
            };
        }

        const newEdge: Edge = {
            id: `e-${edgeData.source}-${edgeData.target}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            source: edgeData.source,
            target: edgeData.target,
            label: edgeData.label,
            relationship: edgeData.relationship,
            type: edgeData.type || 'smoothstep', // Default to smoothstep for nice curves
            animated: edgeData.animated || false
        };

        this.graph.edges.push(newEdge);
        return newEdge;
    }

    /**
     * Add multiple nodes and edges at once
     */
    addNodesAndEdges(
        nodes: NodeInput[], 
        edges: Array<{ source: string; target: string; label?: string; type?: string; animated?: boolean }>
    ): { nodes: Node[], edges: Edge[] } {
        const addedNodes: Node[] = [];
        const addedEdges: Edge[] = [];

        // Add all nodes first
        for (const node of nodes) {
            const addedNode = this.addNode(node);
            addedNodes.push(addedNode);
        }

        // Then add edges
        for (const edge of edges) {
            const addedEdge = this.addEdge(edge.source, edge.target, edge.label, edge.type, edge.animated);
            addedEdges.push(addedEdge);
        }

        return { nodes: addedNodes, edges: addedEdges };
    }

    clearGraph(): void {
        this.graph = {
            nodes: [],
            edges: []
        };
    }

    private calculateAutoPosition(): { x: number; y: number } {
        const nodeCount = this.graph.nodes.length;
        const spacingX = 250; // Horizontal spacing
        const spacingY = 150; // Vertical spacing
        const nodesPerRow = 4;

        return {
            x: (nodeCount % nodesPerRow) * spacingX + 50,
            y: Math.floor(nodeCount / nodesPerRow) * spacingY + 50
        };
    }

    /**
     * Merge multiple nodes into a single larger node
     * This represents when multiple small thoughts combine into an agreed-upon idea
     */
    mergeNodes(nodeIds: string[], mergedLabel: string, mergedCategory?: string): Node | null {
        // Get nodes to merge
        const nodesToMerge = this.graph.nodes.filter(n => nodeIds.includes(n.id));
        
        if (nodesToMerge.length < 2) {
            return null; // Need at least 2 nodes to merge
        }

        // Collect all transcripts and metadata from source nodes
        const allTranscripts: Array<{ speaker: string; text: string; timestamp: string }> = [];
        const mergedMetadata: any = {
            mergedFrom: nodeIds,
            sourceLabels: nodesToMerge.map(n => n.data.label),
            mergeTimestamp: new Date().toISOString()
        };

        // Collect transcripts from each node's metadata
        nodesToMerge.forEach(node => {
            if (node.data.metadata?.transcripts) {
                allTranscripts.push(...node.data.metadata.transcripts);
            }
        });

        // Create merged node with "large" importance
        const mergedNodeInput: NodeInput = {
            label: mergedLabel,
            category: (mergedCategory as any) || 'System',
            importance: 'large',
            metadata: {
                ...mergedMetadata,
                transcripts: allTranscripts,
                originalNodes: nodesToMerge.length
            }
        };

        const mergedNode = this.addNode(mergedNodeInput);

        // Transfer all edges from old nodes to merged node
        const transferredEdges: Edge[] = [];
        this.graph.edges.forEach(edge => {
            if (nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)) {
                // Edge from merged node to external node
                const newEdge = this.addEdge(mergedNode.id, edge.target, edge.label, edge.type, edge.animated);
                transferredEdges.push(newEdge);
            } else if (!nodeIds.includes(edge.source) && nodeIds.includes(edge.target)) {
                // Edge from external node to merged node
                const newEdge = this.addEdge(edge.source, mergedNode.id, edge.label, edge.type, edge.animated);
                transferredEdges.push(newEdge);
            }
        });

        // Remove old edges that connected the merged nodes to each other (internal edges)
        this.graph.edges = this.graph.edges.filter(
            edge => !(nodeIds.includes(edge.source) && nodeIds.includes(edge.target))
        );

        // Remove the old nodes
        nodeIds.forEach(id => this.removeNode(id));

        return mergedNode;
    }
    
    /**
     * Recalculate tree layout for all nodes based on current edges
     * Creates a vertical hierarchy with root nodes at top, children flowing down
     */
    recalculateTreeLayout(): void {
        console.log('🌳 Recalculating vertical tree layout...');

        // Group nodes by depth (0 = root nodes at top, higher = children below)
        const nodesByDepth = new Map<number, Node[]>();

        this.graph.nodes.forEach(node => {
            const depth = this.calculateNodeDepth(node.id);
            if (!nodesByDepth.has(depth)) {
                nodesByDepth.set(depth, []);
            }
            nodesByDepth.get(depth)!.push(node);
        });

        console.log(`   Found ${nodesByDepth.size} depth levels (0=root, ${this.MAX_TREE_DEPTH}=max)`);

        // Position nodes at each depth level, starting from root (depth 0) at top
        const sortedDepths = Array.from(nodesByDepth.keys()).sort((a, b) => a - b);
        
        sortedDepths.forEach(depth => {
            const nodesAtDepth = nodesByDepth.get(depth)!;
            
            // Y position: root nodes at top, children flow downward
            const y = this.TREE_ROOT_Y + (depth * this.TREE_VERTICAL_SPACING);
            
            // X position: center siblings horizontally
            const totalNodes = nodesAtDepth.length;
            const totalWidth = Math.max(totalNodes * this.TREE_HORIZONTAL_SPACING, 400); // Minimum width
            const startX = this.TREE_ROOT_X_START - (totalWidth / 2);

            nodesAtDepth.forEach((node, index) => {
                const x = startX + (index * this.TREE_HORIZONTAL_SPACING);
                node.position = { x, y };
                
                // Log with hierarchy indicator
                const indent = '  '.repeat(depth);
                const levelLabel = depth === 0 ? 'ROOT' : `L${depth}`;
                console.log(`   ${indent}${levelLabel}: "${node.data.label}" at (${Math.round(x)}, ${y})`);
            });
        });

        console.log('✅ Vertical tree layout recalculated');
    }

    /**
     * Get hierarchy statistics for debugging
     */
    getHierarchyStats(): { totalNodes: number; depthCounts: Record<number, number>; maxDepth: number } {
        const depthCounts: Record<number, number> = {};
        let maxDepth = 0;

        this.graph.nodes.forEach(node => {
            const depth = this.calculateNodeDepth(node.id);
            depthCounts[depth] = (depthCounts[depth] || 0) + 1;
            maxDepth = Math.max(maxDepth, depth);
        });

        return {
            totalNodes: this.graph.nodes.length,
            depthCounts,
            maxDepth
        };
    }

    /**
     * Calculate automatic layout position
     * Uses a simple grid layout (can be enhanced with dagre or elkjs)
     */
}

