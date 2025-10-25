import { randomUUID } from 'crypto';
import { Node, Edge, Graph, NodeInput } from '../types';

export class GraphService {
    private graph: Graph;

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
     * Add a node to the graph (React Flow compatible)
     */
    addNode(input: NodeInput): Node {
        const newNode: Node = {
            id: randomUUID(),
            type: input.type || input.category.toLowerCase(), // Use category as default type
            position: input.position || this.calculateAutoPosition(),
            data: {
                label: input.label,
                category: input.category,
                timestamp: new Date().toISOString(),
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
            id: `e-${source}-${target}`,
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
     * Calculate automatic layout position
     * Uses a simple grid layout (can be enhanced with dagre or elkjs)
     */
}

