/**
 * Simple test script to verify graph service and Vapi integration
 * Run with: npx ts-node test-graph.ts
 */

import { GraphService } from './src/services/graph.service';
import { VapiService } from './src/services/vapi.service';

console.log('🧪 Testing Graph Service...\n');

const graphService = new GraphService();

// Test 1: Add nodes
console.log('1️⃣ Adding nodes...');
const node1 = graphService.addNode({
    label: 'Meeting Started',
    type: 'Input'
});
console.log('✅ Added node 1:', node1);

const node2 = graphService.addNode({
    label: 'Discuss Budget',
    type: 'Action'
});
console.log('✅ Added node 2:', node2);

const node3 = graphService.addNode({
    label: 'Budget Approved',
    type: 'Decision'
});
console.log('✅ Added node 3:', node3);

// Test 2: Add edges
console.log('\n2️⃣ Adding edges...');
const edge1 = graphService.addEdge(node1.id, node2.id, 'leads to');
console.log('✅ Added edge 1:', edge1);

const edge2 = graphService.addEdge(node2.id, node3.id, 'decision point');
console.log('✅ Added edge 2:', edge2);

// Test 3: Get full graph
console.log('\n3️⃣ Current graph state:');
const graph = graphService.getGraph();
console.log(JSON.stringify(graph, null, 2));

// Test 4: Vapi service config
console.log('\n4️⃣ Testing Vapi Service...');
const vapiService = new VapiService();
const config = vapiService.getAssistantConfig();
console.log('✅ Vapi config loaded');
console.log('Assistant name:', config.name);
console.log('Model:', config.model.model);
console.log('Functions:', config.model.functions?.map(f => f.name));

// Test 5: Simulate function call
console.log('\n5️⃣ Simulating Vapi function call...');
const functionCallArgs = {
    nodes: [
        { label: 'Task 1', type: 'Action' as const },
        { label: 'Task 2', type: 'Action' as const }
    ],
    edges: [
        { source: 'Task 1', target: 'Task 2' }
    ]
};

const nodeIdMap: Record<string, string> = {};

functionCallArgs.nodes.forEach(node => {
    const newNode = graphService.addNode(node);
    nodeIdMap[node.label] = newNode.id;
    console.log(`✅ Added node from function call: ${newNode.label}`);
});

functionCallArgs.edges.forEach(edge => {
    const sourceId = nodeIdMap[edge.source];
    const targetId = nodeIdMap[edge.target];
    if (sourceId && targetId) {
        const newEdge = graphService.addEdge(sourceId, targetId);
        console.log(`✅ Added edge from function call: ${sourceId} -> ${targetId}`);
    }
});

// Test 6: Final graph state
console.log('\n6️⃣ Final graph state:');
const finalGraph = graphService.getGraph();
console.log(`Total nodes: ${finalGraph.nodes.length}`);
console.log(`Total edges: ${finalGraph.edges.length}`);
console.log('\nNodes:', finalGraph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type })));
console.log('\nEdges:', finalGraph.edges.map(e => ({ id: e.id, source: e.source, target: e.target })));

console.log('\n✅ All tests passed!');

