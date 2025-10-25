import { randomUUID } from 'crypto';
import { Node, Edge, Graph } from '../types';

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

    addNode(node: Omit<Node, 'id' | 'timestamp'>): Node {
        const newNode: Node = {
            ...node,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            position: node.position || this.calculateAutoPosition()
        };

        this.graph.nodes.push(newNode);
        return newNode;
    }

    addEdge(source: string, target: string, label?: string): Edge {
        const newEdge: Edge = {
            id: `e-${source}-${target}`,
            source,
            target,
            label
        };

        this.graph.edges.push(newEdge);
        return newEdge;
    }

    addNodesAndEdges(nodes: Array<Omit<Node, 'id' | 'timestamp'>>, edges: Array<{ source: string; target: string; label?: string }>): { nodes: Node[], edges: Edge[] } {
        const addedNodes: Node[] = [];
        const addedEdges: Edge[] = [];

        // Add all nodes first
        for (const node of nodes) {
            const addedNode = this.addNode(node);
            addedNodes.push(addedNode);
        }

        // Then add edges
        for (const edge of edges) {
            const addedEdge = this.addEdge(edge.source, edge.target, edge.label);
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
        const spacing = 200;
        const nodesPerRow = 3;

        return {
            x: (nodeCount % nodesPerRow) * spacing,
            y: Math.floor(nodeCount / nodesPerRow) * spacing
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

    updateNode(nodeId: string, updates: Partial<Node>): Node | null {
        const node = this.graph.nodes.find(n => n.id === nodeId);
        if (!node) return null;

        Object.assign(node, updates);
        return node;
    }
}

