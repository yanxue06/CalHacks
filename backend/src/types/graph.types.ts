/**
 * Node categories for conversation graph
 */
export type NodeCategory = 'Input' | 'System' | 'Action' | 'Output' | 'Decision';

export type NodeImportance = 'small' | 'medium' | 'large';

/**
 * React Flow compatible Node structure
 * This matches the format expected by ReactFlow
 */
export interface Node {
    id: string;
    type?: string; // React Flow node type (for custom rendering)
    position: {
        x: number;
        y: number;
    };
    size?: {  // Visual size for collision detection
        width: number;
        height: number;
    };
    data: {
        label: string; // Display text
        category: NodeCategory; // Semantic category
        timestamp?: string; // When this was created
        importance?: NodeImportance; // Size indicator
        metadata?: any; // Additional conversation context
    };
}

/**
 * React Flow compatible Edge structure
 */
export interface Edge {
    id: string;
    source: string; // Source node ID
    target: string; // Target node ID
    label?: string; // Optional edge label
    type?: string; // React Flow edge type (smoothstep, step, straight, etc.)
    animated?: boolean; // Animate the edge
}

/**
 * Complete graph structure
 */
export interface Graph {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Input format for adding nodes (before ID generation)
 */
export interface NodeInput {
    label: string;
    category: NodeCategory;
    type?: string;
    position?: {
        x: number;
        y: number;
    };
    importance?: NodeImportance; // Size indicator
    metadata?: any;
}

