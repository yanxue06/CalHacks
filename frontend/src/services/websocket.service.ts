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
          type: 'relatesTo',
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
          type: 'relatesTo',
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

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

