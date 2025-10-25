export type NodeType = 'service' | 'database' | 'decision' | 'action';
export type EdgeType = 'calls' | 'dependsOn' | 'blocks' | 'assignedTo' | 'relatesTo';

export interface SourceRef {
  speaker: string;
  timestamp: number;
  quote: string;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    sourceRefs: SourceRef[];
    confidence?: number;
  };
}

export interface DiagramEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  data: {
    sourceRefs: SourceRef[];
    confidence?: number;
  };
}

export interface Decision {
  text: string;
  sourceRef: SourceRef;
  confidence: number;
}

export interface ActionItem {
  text: string;
  owner?: string;
  due?: string;
  sourceRef: SourceRef;
  confidence: number;
}

export type RecordingStatus = 'idle' | 'listening' | 'processing' | 'finalizing';
