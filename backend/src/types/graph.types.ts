export interface Node {
    id: string;
    label: string;
    type: 'Input' | 'System' | 'Action' | 'Output' | 'Decision';
    links?: {
        linkTo: string[];
        linkFrom: string[];
    };
    position?: {
        x: number;
        y: number;
    };
    data?: any;
    timestamp?: string;
}

export interface Edge {
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
}

export interface Graph {
    nodes: Node[];
    edges: Edge[];
}

