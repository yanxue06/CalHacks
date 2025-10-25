import { DiagramNode, DiagramEdge, Decision, ActionItem, SourceRef } from '@/types/diagram';

// Mock data for demonstration
const mockSpeakers = ['Alice', 'Bob', 'Charlie'];
const mockServices = ['API Gateway', 'Auth Service', 'User Service', 'Notification Service', 'Payment Service'];
const mockDatabases = ['User DB', 'Session Store', 'Analytics DB', 'Cache'];
const mockDecisions = [
  'Store tokens in Redis for faster lookup',
  'Use JWT for authentication',
  'Implement rate limiting at gateway level',
  'Add monitoring for all services'
];
const mockActions = [
  'Ian: Add monitoring dashboards',
  'Sarah: Set up CI/CD pipeline',
  'Mike: Document API endpoints',
  'Lisa: Review security policies'
];

let nodeCounter = 0;
let edgeCounter = 0;

const getRandomSpeaker = () => mockSpeakers[Math.floor(Math.random() * mockSpeakers.length)];
const getRandomTimestamp = () => Date.now() - Math.floor(Math.random() * 300000); // Last 5 minutes

const createSourceRef = (text: string): SourceRef => ({
  speaker: getRandomSpeaker(),
  timestamp: getRandomTimestamp(),
  quote: text
});

export class MockWebSocketService {
  private callbacks: {
    onNode?: (node: DiagramNode) => void;
    onEdge?: (edge: DiagramEdge) => void;
    onFinalize?: (data: { decisions: Decision[]; actionItems: ActionItem[] }) => void;
  } = {};
  
  private intervalId: number | null = null;
  private nodes: DiagramNode[] = [];
  private isRecording = false;

  connect(callbacks: typeof this.callbacks) {
    this.callbacks = callbacks;
    console.log('Mock WebSocket connected');
  }

  startRecording() {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.nodes = [];
    nodeCounter = 0;
    edgeCounter = 0;

    // Simulate nodes and edges appearing over time
    this.intervalId = window.setInterval(() => {
      if (nodeCounter < 6) {
        this.addRandomNode();
      } else if (edgeCounter < 5 && this.nodes.length > 1) {
        this.addRandomEdge();
      }
    }, 2500);
  }

  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Simulate finalization with decisions and action items
    setTimeout(() => {
      const decisions: Decision[] = mockDecisions.slice(0, 2).map(text => ({
        text,
        sourceRef: createSourceRef(`We should ${text.toLowerCase()}`),
        confidence: 0.85 + Math.random() * 0.15
      }));

      const actionItems: ActionItem[] = mockActions.slice(0, 3).map(text => {
        const [owner, task] = text.split(': ');
        return {
          text: task,
          owner,
          sourceRef: createSourceRef(`${owner}, can you ${task.toLowerCase()}?`),
          confidence: 0.80 + Math.random() * 0.15
        };
      });

      this.callbacks.onFinalize?.({ decisions, actionItems });
    }, 1000);
  }

  private addRandomNode() {
    const types: Array<'service' | 'database' | 'decision' | 'action'> = 
      nodeCounter < 3 ? ['service', 'database'] : 
      nodeCounter < 5 ? ['decision'] : ['action'];
    
    const type = types[Math.floor(Math.random() * types.length)];
    
    let label = '';
    let quote = '';
    
    switch (type) {
      case 'service':
        label = mockServices[nodeCounter % mockServices.length];
        quote = `We need ${label} to handle this`;
        break;
      case 'database':
        label = mockDatabases[nodeCounter % mockDatabases.length];
        quote = `Store that in ${label}`;
        break;
      case 'decision':
        label = mockDecisions[nodeCounter % mockDecisions.length];
        quote = `Let's decide: ${label}`;
        break;
      case 'action':
        const action = mockActions[nodeCounter % mockActions.length];
        label = action.split(': ')[1];
        quote = action;
        break;
    }

    const node: DiagramNode = {
      id: `node-${nodeCounter}`,
      type,
      position: { 
        x: 100 + (nodeCounter % 3) * 300, 
        y: 100 + Math.floor(nodeCounter / 3) * 200 
      },
      data: {
        label,
        sourceRefs: [createSourceRef(quote)],
        confidence: 0.85 + Math.random() * 0.15
      }
    };

    this.nodes.push(node);
    this.callbacks.onNode?.(node);
    nodeCounter++;
  }

  private addRandomEdge() {
    if (this.nodes.length < 2) return;

    const sourceNode = this.nodes[Math.floor(Math.random() * (this.nodes.length - 1))];
    const targetNode = this.nodes[this.nodes.length - 1];
    
    const types: Array<'calls' | 'dependsOn' | 'relatesTo' | 'assignedTo'> = 
      ['calls', 'dependsOn', 'relatesTo'];
    
    const type = types[Math.floor(Math.random() * types.length)];

    const edge: DiagramEdge = {
      id: `edge-${edgeCounter}`,
      type,
      source: sourceNode.id,
      target: targetNode.id,
      data: {
        sourceRefs: [createSourceRef(`${sourceNode.data.label} ${type} ${targetNode.data.label}`)],
        confidence: 0.80 + Math.random() * 0.15
      }
    };

    this.callbacks.onEdge?.(edge);
    edgeCounter++;
  }

  disconnect() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRecording = false;
    console.log('Mock WebSocket disconnected');
  }
}
