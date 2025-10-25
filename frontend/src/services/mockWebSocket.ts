import { DiagramNode, DiagramEdge, Decision, ActionItem, SourceRef } from '@/types/diagram';

// Mock data for a product planning conversation
const mockSpeakers = ['Ava (PM)', 'Ben (Eng)', 'Mia (Design)', 'Leo (Data)', 'Nina (Ops)'];
const mockServices = ['Onboarding Flow', 'Billing Integration', 'AI Meeting Summary'];
const mockDatabases = ['User DB', 'Session Store', 'Analytics DB', 'Cache'];
const mockDecisions = [
  'Reduce onboarding friction to improve activation',
  'Offer self-serve billing for faster GTM',
  'Ship AI meeting notes to Jira for follow-through'
];
const mockActions = [
  'Ava: Define the success metrics for activation v1',
  'Mia: Design sign-up funnel v1',
  'Ben: Integrate Stripe Checkout',
  'Nina: Set up webhook retriers',
  'Leo: Create Jira sync job for action items'
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
  private plannedIndex = 0;
  private decisionsCreated: DiagramNode[] = [];
  private servicesCreated: DiagramNode[] = [];
  private actionsCreated: DiagramNode[] = [];

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
    this.plannedIndex = 0;
    this.decisionsCreated = [];
    this.servicesCreated = [];
    this.actionsCreated = [];

    // Simulate a realistic conversation flow: idea -> feature -> executable
    this.intervalId = window.setInterval(() => {
      const sequence = this.getPlannedSequence();
      if (this.plannedIndex < sequence.length) {
        this.addRandomNode(sequence[this.plannedIndex]);
        this.plannedIndex++;
      }
    }, 2200);
  }

  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Simulate finalization with decisions and action items derived from the session
    setTimeout(() => {
      const decisions: Decision[] = this.decisionsCreated.map(node => ({
        text: node.data.label,
        sourceRef: node.data.sourceRefs[0],
        confidence: 0.85 + Math.random() * 0.15
      }));

      // Use a subset of planned actions to generate action items with owners
      const actionItems: ActionItem[] = this.actionsCreated.map(node => {
        // Expect the first sourceRef.quote to be in the form "Owner: Task"
        const raw = node.data.sourceRefs[0]?.quote || '';
        const [owner, task] = raw.includes(': ') ? raw.split(': ') : ['', node.data.label];
        return {
          text: task || node.data.label,
          owner: owner || undefined,
          sourceRef: node.data.sourceRefs[0],
          confidence: 0.80 + Math.random() * 0.15
        };
      });

      this.callbacks.onFinalize?.({ decisions, actionItems });
    }, 1000);
  }

  private addRandomNode(item: { type: 'service' | 'database' | 'decision' | 'action'; label: string; quote: string; group?: number }) {
    const type = item.type;
    const label = item.label;
    const quote = item.quote;

    const node: DiagramNode = {
      id: `node-${nodeCounter}`,
      type,
      position: { 
        x: 120 + (nodeCounter % 3) * 320, 
        y: 120 + Math.floor(nodeCounter / 3) * 220 
      },
      data: {
        label,
        sourceRefs: [createSourceRef(quote)],
        confidence: 0.86 + Math.random() * 0.12
      }
    };

    this.nodes.push(node);
    this.callbacks.onNode?.(node);

    // Track by type for later linking and summary
    if (type === 'decision') {
      this.decisionsCreated.push(node);
    } else if (type === 'service') {
      this.servicesCreated.push(node);
      // Link idea -> feature when both exist in the same group/order
      const idx = this.servicesCreated.length - 1;
      if (this.decisionsCreated[idx]) {
        this.addEdge(this.decisionsCreated[idx].id, node.id, 'relatesTo');
      }
    } else if (type === 'action') {
      this.actionsCreated.push(node);
      const idx = this.actionsCreated.length - 1;
      if (this.servicesCreated[idx]) {
        this.addEdge(this.servicesCreated[idx].id, node.id, 'assignedTo');
      }
    }

    nodeCounter++;
  }

  private addEdge(sourceId: string, targetId: string, type: 'calls' | 'dependsOn' | 'blocks' | 'assignedTo' | 'relatesTo') {
    const edge: DiagramEdge = {
      id: `edge-${edgeCounter}`,
      type,
      source: sourceId,
      target: targetId,
      data: {
        sourceRefs: [createSourceRef(`${type} link created`)],
        confidence: 0.82 + Math.random() * 0.14
      }
    };
    this.callbacks.onEdge?.(edge);
    edgeCounter++;
  }

  private getPlannedSequence(): Array<{ type: 'service' | 'database' | 'decision' | 'action'; label: string; quote: string; group?: number }> {
    // Build a simple grouped sequence: [idea, feature, action] x N
    const sequence: Array<{ type: 'service' | 'database' | 'decision' | 'action'; label: string; quote: string; group?: number }> = [];
    const ideas = mockDecisions;
    const features = mockServices;
    const actions = mockActions;

    const groups = Math.min(ideas.length, features.length, Math.ceil(actions.length / 2));
    for (let i = 0; i < groups; i++) {
      // Idea
      sequence.push({
        type: 'decision',
        label: ideas[i],
        quote: `I think we should ${ideas[i].toLowerCase()}.`
      });
      // Feature
      sequence.push({
        type: 'service',
        label: features[i],
        quote: `Let's scope the ${features[i]} to support that.`
      });
      // Two actions per group if available
      const action1 = actions[i * 2];
      if (action1) {
        const [owner, task] = action1.split(': ');
        sequence.push({
          type: 'action',
          label: task || action1,
          quote: `${owner || 'Someone'}: ${task || action1}`
        });
      }
      const action2 = actions[i * 2 + 1];
      if (action2) {
        const [owner, task] = action2.split(': ');
        sequence.push({
          type: 'action',
          label: task || action2,
          quote: `${owner || 'Someone'}: ${task || action2}`
        });
      }
    }
    return sequence;
  }

  // Removed random edge generator to prefer deterministic conversation links

  disconnect() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRecording = false;
    console.log('Mock WebSocket disconnected');
  }
}
