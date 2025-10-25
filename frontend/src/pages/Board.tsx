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
import { WebSocketService } from '@/services/websocket.service';
import { VapiService } from '@/services/vapi.service';
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
  
  const wsService = useRef(new WebSocketService());
  const vapiService = useRef(new VapiService());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastProcessedTime = useRef<number>(0);
  const MIN_PROCESS_INTERVAL = 5000; // 5 seconds between processing

  const handleTranscript = useCallback((transcript: string) => {
    console.log('📝 Received transcript from Vapi:', transcript);
    
    // Rate limiting: prevent processing too frequently
    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessedTime.current;
    
    if (timeSinceLastProcess < MIN_PROCESS_INTERVAL) {
      console.log(`⏱️ Rate limited: waiting ${Math.ceil((MIN_PROCESS_INTERVAL - timeSinceLastProcess) / 1000)}s before next process`);
      toast.warning('Please wait', {
        description: `Wait ${Math.ceil((MIN_PROCESS_INTERVAL - timeSinceLastProcess) / 1000)}s between requests`
      });
      return;
    }
    
    // Update last processed time
    lastProcessedTime.current = now;
    
    // Send transcript to backend via WebSocket
    wsService.current.sendTranscript(transcript);
    
    toast.info('Processing speech...', {
      description: 'Generating diagram nodes'
    });
  }, []);

  useEffect(() => {
    // Set transcript callback for Vapi
    vapiService.current.setTranscriptCallback(handleTranscript);

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
            confidence: node.data.confidence
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
        
        setEdges((eds) => {
          // Check if edge already exists to prevent duplicates
          const exists = eds.some(e => e.id === flowEdge.id);
          if (exists) return eds;
          return [...eds, flowEdge];
        });
      },
      onTranscript: (data) => {
        console.log('📝 Transcript:', data);
        // Could show this in the UI if desired
      },
      onConversationStarted: () => {
        setStatus('listening');
        toast.info('Listening...', {
          description: 'Vapi is now transcribing your audio'
        });
      },
      onConversationEnded: () => {
        setStatus('finalizing');
        setTimeout(() => {
          setStatus('idle');
          toast.success('Recording complete', {
            description: 'Your conversation has been processed'
          });
        }, 1000);
      }
    });

    return () => {
      wsService.current.disconnect();
      vapiService.current.cleanup();
    };
  }, [setNodes, setEdges, reactFlowInstance, handleTranscript]);

  const handleStartRecording = useCallback(async () => {
    try {
      setStatus('processing');
      setDecisions([]);
      setActionItems([]);
      
      await vapiService.current.startRecording();
      
      toast.success('Recording started', {
        description: 'Speak naturally and Vapi will transcribe and analyze your conversation'
      });
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('idle');
      toast.error('Failed to start recording', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    try {
      setStatus('finalizing');
      await vapiService.current.stopRecording();
      
      toast.info('Processing...', {
        description: 'Finalizing your conversation analysis'
      });
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Error stopping recording', {
        description: 'Recording may have already stopped'
      });
      setStatus('idle');
    }
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

  const handleClear = useCallback(() => {
    wsService.current.clearGraph();
    setNodes([]);
    setEdges([]);
    toast.success('Graph cleared', {
      description: 'All nodes and edges removed'
    });
  }, [setNodes, setEdges]);

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
        onClear={handleClear}
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
