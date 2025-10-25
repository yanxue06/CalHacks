import { useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  NodeTypes,
  MarkerType,
  ReactFlowInstance,
  addEdge,
  Connection
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DiagramNode as CustomNode } from '@/components/DiagramNode';
import { Toolbar } from '@/components/Toolbar';
import { StatusBanner } from '@/components/StatusBanner';
import { DetailsSidebar } from '@/components/DetailsSidebar';
import { MockWebSocketService } from '@/services/mockWebSocket';
import { DiagramNode, DiagramEdge, Decision, ActionItem, RecordingStatus } from '@/types/diagram';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const Board = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DiagramEdge | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  const wsService = useRef(new MockWebSocketService());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const undoStack = useRef<Node[][]>([]);
  const redoStack = useRef<Node[][]>([]);
  const dragSnapshotRef = useRef<Node[] | null>(null);

  useEffect(() => {
    wsService.current.connect({
      onNode: (node: DiagramNode) => {
        const flowNode: Node = {
          id: node.id,
          type: 'custom',
          position: node.position,
          data: { 
            label: node.data.label,
            nodeType: node.type,
            sourceRefs: node.data.sourceRefs,
        confidence: node.data.confidence,
        size: (node as any).data.size,
        description: (node as any).data.description
          },
        };
        
        setNodes((nds) => [...nds, flowNode]);
        
        // Auto-layout: fit view after adding nodes
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.2, duration: 800 });
        }, 100);
      },
      onEdge: (edge: DiagramEdge) => {
        const flowEdge: Edge = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
          },
          data: {
            sourceRefs: edge.data.sourceRefs,
            confidence: edge.data.confidence
          }
        };
        
        setEdges((eds) => [...eds, flowEdge]);
      },
      onFinalize: ({ decisions: newDecisions, actionItems: newActionItems }) => {
        setDecisions(newDecisions);
        setActionItems(newActionItems);
        setStatus('idle');
        toast.success('Recording finalized', {
          description: `Found ${newDecisions.length} decisions and ${newActionItems.length} action items`
        });
      }
    });

    return () => {
      wsService.current.disconnect();
    };
  }, [setNodes, setEdges, reactFlowInstance]);

  const handleStartRecording = useCallback(() => {
    setStatus('listening');
    setDecisions([]);
    setActionItems([]);
    wsService.current.startRecording();
    toast.info('Started recording', {
      description: 'Listening to your conversation...'
    });
  }, []);

  const handleStopRecording = useCallback(() => {
    setStatus('finalizing');
    wsService.current.stopRecording();
  }, []);

  const handleSave = useCallback(() => {
    toast.success('Diagram saved', {
      description: 'Your diagram has been saved successfully'
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (!reactFlowWrapper.current) return;
    
    try {
      const dataUrl = await toPng(reactFlowWrapper.current, {
        backgroundColor: 'hsl(var(--background))',
        width: reactFlowWrapper.current.offsetWidth,
        height: reactFlowWrapper.current.offsetHeight,
      });
      
      const link = document.createElement('a');
      link.download = `diagram-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      toast.success('Diagram exported', {
        description: 'PNG file downloaded successfully'
      });
    } catch (error) {
      toast.error('Export failed', {
        description: 'Could not export diagram'
      });
    }
  }, []);

  const handleRecenter = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2, duration: 800 });
    toast.info('View recentered');
  }, [reactFlowInstance]);

  const handleSimulateLarge = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setDecisions([]);
    setActionItems([]);
    wsService.current.simulateLargeTree(40, 1);
    toast.success('Generated simulation', { description: '40-node tree created' });
    setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2, duration: 800 }), 50);
  }, [reactFlowInstance, setNodes, setEdges]);

  // Snapshot before a drag to enable undo of last move
  const handleNodeDragStart = useCallback((_event: any, _node: Node) => {
    dragSnapshotRef.current = nodes.map(n => ({ ...n, position: { ...n.position } }));
  }, [nodes]);

  // After drag stops, push the snapshot to undo history
  const handleNodeDragStop = useCallback(() => {
    if (dragSnapshotRef.current) {
      undoStack.current.push(dragSnapshotRef.current);
      redoStack.current = [];
      dragSnapshotRef.current = null;
    }
  }, []);

  // Ctrl/Cmd+Z to undo last move, Shift+Ctrl/Cmd+Z to redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = undoStack.current.pop();
        if (prev) {
          const current = nodes.map(n => ({ ...n, position: { ...n.position } }));
          redoStack.current.push(current);
          setNodes(prev);
        }
      } else if (mod && key === 'z' && e.shiftKey) {
        e.preventDefault();
        const next = redoStack.current.pop();
        if (next) {
          const current = nodes.map(n => ({ ...n, position: { ...n.position } }));
          undoStack.current.push(current);
          setNodes(next);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodes, setNodes]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const diagramNode: DiagramNode = {
      id: node.id,
      type: node.data.nodeType,
      position: node.position,
      data: {
        label: node.data.label,
        sourceRefs: node.data.sourceRefs,
        confidence: node.data.confidence
      }
    };
    setSelectedNode(diagramNode);
    setSelectedEdge(null);
  }, []);

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const diagramEdge: DiagramEdge = {
      id: edge.id,
      type: 'relatesTo',
      source: edge.source,
      target: edge.target,
      data: edge.data
    };
    setSelectedEdge(diagramEdge);
    setSelectedNode(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const handleConnect = useCallback((params: Connection) => {
    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' }
        },
        eds
      )
    );
  }, [setEdges]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Toolbar
        status={status}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onSave={handleSave}
        onExport={handleExport}
        onRecenter={handleRecenter}
        onSimulateLarge={handleSimulateLarge}
      />
      
      <StatusBanner status={status} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 }
            }}
          >
            <Background gap={20} size={1} color="hsl(var(--border))" />
            <Controls className="!bg-card !border-border" />
          </ReactFlow>
        </div>

        <DetailsSidebar
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          decisions={decisions}
          actionItems={actionItems}
        />
      </div>
    </div>
  );
};

export default Board;
