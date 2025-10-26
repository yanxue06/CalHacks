import { io, Socket } from 'socket.io-client';
import { DiagramNode, DiagramEdge, Decision, ActionItem } from '@/types/diagram';

interface WebSocketCallbacks {
  onNode?: (node: DiagramNode) => void;
  onEdge?: (edge: DiagramEdge) => void;
  onFinalize?: (data: { decisions: Decision[]; actionItems: ActionItem[] }) => void;
  onTranscript?: (data: { text: string; timestamp: string }) => void;
  onConversationStarted?: () => void;
  onConversationEnded?: () => void;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private callbacks: WebSocketCallbacks = {};
  private backendUrl: string;

  constructor() {
    this.backendUrl = import.meta.env.VITE_BACKEND_WS_URL || 'http://localhost:5000';
  }

  connect(callbacks: WebSocketCallbacks) {
    this.callbacks = callbacks;

    this.socket = io(this.backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to backend WebSocket');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from backend WebSocket');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('transcript-processed', (data: { success: boolean; nodes: any[]; edges: any[] }) => {
      console.log('✅ Transcript processed successfully:', data);
    });

    this.socket.on('error', (error: { message: string }) => {
      console.error('❌ WebSocket error:', error.message);
    });

    // Listen for graph updates
    this.socket.on('graph:update', (graph: { nodes: any[]; edges: any[] }) => {
      console.log('📊 Received graph update:', graph);
      
      // Convert backend nodes to frontend DiagramNode format
      graph.nodes.forEach((node: any) => {
        const diagramNode: DiagramNode = {
          id: node.id,
          type: this.mapNodeType(node.data?.category || node.type),
          position: node.position,
          data: {
            label: node.data?.label || node.label,
            sourceRefs: [],
            confidence: 0.85
          }
        };
        this.callbacks.onNode?.(diagramNode);
      });

      // Convert backend edges to frontend DiagramEdge format
      graph.edges.forEach((edge: any) => {
        const diagramEdge: DiagramEdge = {
          id: edge.id,
          type: edge.relationship || edge.type || 'relates to', // Use actual relationship from backend
          source: edge.source,
          target: edge.target,
          data: {
            sourceRefs: [],
            confidence: 0.85
          }
        };
        this.callbacks.onEdge?.(diagramEdge);
      });
    });

    // Listen for new nodes and edges being added
    this.socket.on('graph:nodeAdded', (data: { nodes: any[]; edges: any[] }) => {
      console.log('➕ New nodes/edges added:', data);
      
      // Convert backend format to frontend DiagramNode format
      data.nodes.forEach((node: any) => {
        const diagramNode: DiagramNode = {
          id: node.id,
          type: this.mapNodeType(node.data.category),
          position: node.position,
          data: {
            label: node.data.label,
            sourceRefs: [],
            confidence: 0.85
          }
        };
        this.callbacks.onNode?.(diagramNode);
      });

      // Convert backend format to frontend DiagramEdge format
      data.edges.forEach((edge: any) => {
        const diagramEdge: DiagramEdge = {
          id: edge.id,
          type: edge.relationship || edge.type || 'relates to', // Use actual relationship from backend
          source: edge.source,
          target: edge.target,
          data: {
            sourceRefs: [],
            confidence: 0.85
          }
        };
        this.callbacks.onEdge?.(diagramEdge);
      });
    });

    // Listen for transcript updates
    this.socket.on('transcript:update', (data: { text: string; timestamp: string }) => {
      console.log('📝 Transcript update:', data);
      this.callbacks.onTranscript?.(data);
    });

    // Listen for conversation events
    this.socket.on('conversation:started', () => {
      console.log('🎙️ Conversation started');
      this.callbacks.onConversationStarted?.();
    });

    this.socket.on('conversation:ended', () => {
      console.log('🛑 Conversation ended');
      this.callbacks.onConversationEnded?.();
    });

    // Request current graph state
    this.socket.emit('graph:request');
  }

  private mapNodeType(category: string): 'service' | 'database' | 'decision' | 'action' {
    const lowerCategory = category?.toLowerCase() || '';
    
    if (lowerCategory.includes('decision')) return 'decision';
    if (lowerCategory.includes('action')) return 'action';
    if (lowerCategory.includes('database') || lowerCategory.includes('data')) return 'database';
    
    return 'service'; // Default to service
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendTranscript(text: string) {
    if (this.socket) {
      console.log('📤 Sending transcript via WebSocket:', text);
      this.socket.emit('process-transcript', { text });
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  clearGraph() {
    if (this.socket) {
      console.log('🗑️ Clearing graph via WebSocket');
      this.socket.emit('clear-graph');
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  removeNode(nodeId: string) {
    if (this.socket) {
      console.log('🗑️ Removing node via WebSocket:', nodeId);
      this.socket.emit('remove-node', { nodeId });
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  removeEdge(edgeId: string) {
    if (this.socket) {
      console.log('🗑️ Removing edge via WebSocket:', edgeId);
      this.socket.emit('remove-edge', { edgeId });
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  restructureGraph(nodes: any[], edges: any[]) {
    if (this.socket) {
      console.log('🔄 Restructuring graph via WebSocket');
      this.socket.emit('restructure-graph', { nodes, edges });
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  refineGraph(conversationContext: string) {
    if (this.socket) {
      console.log('🔍 Requesting graph refinement via WebSocket');
      this.socket.emit('refine-graph', { conversationContext });
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

