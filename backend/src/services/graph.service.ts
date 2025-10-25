import { randomUUID } from 'crypto';
import { Node, Edge, Graph, NodeInput, NodeImportance } from '../types';

export class GraphService {
    private graph: Graph;
    private transcriptHistory: Array<{
        speaker: string;
        text: string;
        timestamp: string;
    }> = [];

    constructor() {
        this.graph = {
            nodes: [],
            edges: []
        };
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
    replaceGraph(newGraph: { nodes: NodeInput[], edges: any[] }): void {
        this.graph = {
            nodes: newGraph.nodes.map(node => ({
                id: node.id || randomUUID(),
                label: node.label,
                category: node.category || 'service',
                importance: node.importance || 'medium',
                position: node.position || { x: 0, y: 0 },
                data: {
                    label: node.label,
                    sourceRefs: node.data?.sourceRefs || [],
                    confidence: node.data?.confidence || 0.8
                }
            })),
            edges: newGraph.edges.map(edge => ({
                id: edge.id || randomUUID(),
                source: edge.source,
                target: edge.target,
                relationship: edge.relationship || 'relatesTo',
                data: {
                    sourceRefs: edge.data?.sourceRefs || [],
                    confidence: edge.data?.confidence || 0.8
                }
            }))
        };
    }

    /**
     * Add a transcript entry with speaker information
     */
    addTranscript(speaker: string, text: string): void {
        const transcript = {
            speaker,
            text,
            timestamp: new Date().toISOString()
        };
        this.transcriptHistory.push(transcript);
        
        // Keep only last 30 seconds of transcripts
        const thirtySecondsAgo = Date.now() - 30000;
        this.transcriptHistory = this.transcriptHistory.filter(
            t => new Date(t.timestamp).getTime() > thirtySecondsAgo
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
     * Find a non-overlapping position for a node
     */
    private findNonOverlappingPosition(size: { width: number; height: number }): { x: number; y: number } {
        const padding = 40; // Extra space between nodes
        const gridSize = 100; // Grid increment size
        
        // Try positions in a spiral pattern
        for (let radius = 0; radius < 20; radius++) {
            for (let theta = 0; theta < 360; theta += 15) {
                const radians = (theta * Math.PI) / 180;
                const x = 500 + Math.cos(radians) * radius * gridSize;
                const y = 300 + Math.sin(radians) * radius * gridSize;
                
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
        const position = input.position || this.findNonOverlappingPosition(size);
        
        const newNode: Node = {
            id: randomUUID(),
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
     */
    addEdge(source: string, target: string, label?: string, type?: string, animated?: boolean): Edge {
        const newEdge: Edge = {
            id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            source,
            target,
            label,
            type: type || 'smoothstep', // Default to smoothstep for nice curves
            animated: animated || false
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

    removeNode(nodeId: string): boolean {
        const index = this.graph.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) return false;

        this.graph.nodes.splice(index, 1);
        // Remove associated edges
        this.graph.edges = this.graph.edges.filter(
            e => e.source !== nodeId && e.target !== nodeId
        );
        return true;
    }

    /**
     * Update a node's properties
     */
    updateNode(nodeId: string, updates: Partial<Node>): Node | null {
        const node = this.graph.nodes.find(n => n.id === nodeId);
        if (!node) return null;

        // Deep merge for nested data object
        if (updates.data) {
            node.data = { ...node.data, ...updates.data };
            delete updates.data;
        }

        Object.assign(node, updates);
        return node;
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
     * Calculate automatic layout position
     * Uses a simple grid layout (can be enhanced with dagre or elkjs)
     */
}

