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

  // Fast generation of a large, tree-like graph for design sessions
  simulateLargeTree(totalNodes: number = 100, treeCount: number = 5) {
    // Reset previous state
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRecording = false;
    this.nodes = [];
    nodeCounter = 0;
    edgeCounter = 0;
    this.decisionsCreated = [];
    this.servicesCreated = [];
    this.actionsCreated = [];

    // Layout helpers geared for top->bottom trees
    const treeOffsetX = (treeId: number) => 200 + treeId * 900; // wider spacing between trees
    const rootY = 80;
    const verticalStep = (level: number) => (level === 0 ? 240 : level === 1 ? 240 : 220);
    const horizontalStep = (level: number) => (level === 0 ? 360 : level === 1 ? 320 : 280);

    // Per-level occupancy to avoid overlaps within each tree
    type Range = { start: number; end: number };
    const occupancyByTree: Record<number, Record<number, Range[]>> = {};
    const baseNodeWidth = 240; // rough card width before scaling
    const gapX = 60; // horizontal gap between cards
    const reserveX = (treeId: number, level: number, desiredX: number, size: number) => {
      if (!occupancyByTree[treeId]) occupancyByTree[treeId] = {};
      if (!occupancyByTree[treeId][level]) occupancyByTree[treeId][level] = [];
      const ranges = occupancyByTree[treeId][level];
      const width = baseNodeWidth * size;
      const half = width / 2;
      const collides = (x: number) => ranges.some(r => !((x + half + gapX) < r.start || (x - half - gapX) > r.end));
      let x = desiredX;
      while (collides(x)) {
        x += width + gapX; // bump to the right until free
      }
      ranges.push({ start: x - half, end: x + half });
      return x;
    };

    const createNode = (
      type: 'service' | 'database' | 'decision' | 'action',
      label: string,
      quote: string,
      level: number,
      treeId: number,
      parent?: DiagramNode,
      siblingIndex: number = 0,
      siblingsTotal: number = 1
    ): DiagramNode => {
      const size = level === 0 ? 1.4 : level === 1 ? 1.15 : level === 2 ? 1.0 : 0.85;
      const baseX = parent ? parent.position.x : treeOffsetX(treeId);
      const baseY = parent ? parent.position.y : rootY;
      const offset = parent ? (siblingIndex - (siblingsTotal - 1) / 2) * horizontalStep(level) : 0;
      let x = baseX + offset;
      const y = baseY + (parent ? verticalStep(level) : 0);
      // Ensure no overlap on this level within the tree
      x = reserveX(treeId, level, x, size);
      const node: DiagramNode = {
        id: `node-${nodeCounter}`,
        type,
        position: { x, y },
        data: {
          label,
          description: `${type.toUpperCase()} • Placeholder summary about ${label.toLowerCase()}.` ,
          sourceRefs: [createSourceRef(quote)],
          confidence: 0.86 + Math.random() * 0.12,
          level,
          size,
          treeId
        } as any
      };
      nodeCounter++;
      this.nodes.push(node);
      this.callbacks.onNode?.(node);
      if (type === 'decision') this.decisionsCreated.push(node);
      if (type === 'service') this.servicesCreated.push(node);
      if (type === 'action') this.actionsCreated.push(node);
      return node;
    };

    const createEdge = (sourceId: string, targetId: string, type: 'calls' | 'dependsOn' | 'blocks' | 'assignedTo' | 'relatesTo', treeId?: number) => {
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
      edgeCounter++;
      this.callbacks.onEdge?.(edge);
    };

    // Seed root and breadth-first expansion
    type QueueItem = { node: DiagramNode; level: number; treeId: number };
    const queue: QueueItem[] = [];
    // Seed multiple roots (forest)
    const rootLabels = [
      'Vision: Activation & Onboarding',
      'Vision: Billing & Monetization',
      'Vision: Collaboration & Sharing',
      'Vision: Insights & Analytics',
      'Vision: Reliability & Ops'
    ];
    const roots = new Array(Math.min(treeCount, 5)).fill(0).map((_, t) =>
      createNode('decision', rootLabels[t] || `Vision ${t+1}`, 'Ava (PM): Let’s align on goals.', 0, t)
    );
    for (let t = 0; t < roots.length; t++) {
      queue.push({ node: roots[t], level: 0, treeId: t });
    }

    const pick = <T,>(arr: T[], idx: number) => arr[idx % arr.length];
    let created = 1;

    while (queue.length > 0 && created < totalNodes) {
      const { node, level, treeId } = queue.shift()!;
      const nextLevel = level + 1;

      // Determine branching based on type/level to get a tree (non-linear)
      let childrenTarget = 3;
      if (nextLevel === 1) childrenTarget = 4; // features under the root
      if (nextLevel >= 3) childrenTarget = 2; // taper branching deeper

      for (let i = 0; i < childrenTarget && created < totalNodes; i++) {
        // Alternate types to diversify
        const type: 'service' | 'database' | 'decision' | 'action' =
          nextLevel % 3 === 1 ? 'service' : nextLevel % 3 === 2 ? 'action' : 'decision';

        let label = '';
        let quote = '';
        if (type === 'service') {
          label = `${pick(mockServices, i)} ${level}.${i}`;
          quote = `Ben (Eng): We should build ${label} next.`;
        } else if (type === 'action') {
          const a = pick(mockActions, i + level);
          const [owner, task] = a.split(': ');
          label = task || a;
          quote = `${owner || 'Owner'}: ${task || a}`;
        } else if (type === 'decision') {
          const d = pick(mockDecisions, i + level);
          label = d;
          quote = `Ava (PM): ${d}.`;
        } else {
          label = pick(mockDatabases, i);
          quote = `Leo (Data): Persist in ${label}.`;
        }

        const child = createNode(
          type,
          label,
          quote,
          nextLevel,
          treeId,
          node,
          i,
          childrenTarget
        );
        // Connect with appropriate edge type
        const edgeType = type === 'action' ? 'assignedTo' : type === 'service' ? 'relatesTo' : 'relatesTo';
        createEdge(node.id, child.id, edgeType, treeId);

        // Occasionally attach a database dependency to services
        if (type === 'service' && created + 1 < totalNodes && (i % 2 === 0)) {
          const db = createNode('database', pick(mockDatabases, i + level), `Nina (Ops): ${pick(mockDatabases, i + level)} needed.`, nextLevel + 1, treeId);
          createEdge(child.id, db.id, 'dependsOn', treeId);
          queue.push({ node: db, level: nextLevel + 1, treeId });
          created += 1;
        }

        queue.push({ node: child, level: nextLevel, treeId });
        created += 1;
      }
    }

    // Finalize with collected decisions and actions
    const decisions: Decision[] = this.decisionsCreated.slice(0, 50).map(n => ({
      text: n.data.label,
      sourceRef: n.data.sourceRefs[0],
      confidence: 0.86 + Math.random() * 0.12
    }));
    const actionItems: ActionItem[] = this.actionsCreated.slice(0, 80).map(n => {
      const raw = n.data.sourceRefs[0]?.quote || '';
      const [owner, task] = raw.includes(': ') ? raw.split(': ') : ['', n.data.label];
      return {
        text: task || n.data.label,
        owner: owner || undefined,
        sourceRef: n.data.sourceRefs[0],
        confidence: 0.80 + Math.random() * 0.15
      };
    });
    this.callbacks.onFinalize?.({ decisions, actionItems });
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
