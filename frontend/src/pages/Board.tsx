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
import { VoiceRecordingService } from '@/services/voiceRecordingService';
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
  const [transcriptions, setTranscriptions] = useState<Array<{
    id: string;
    text: string;
    timestamp: string;
    confidence: number;
    duration: number;
  }>>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  const voiceService = useRef(new VoiceRecordingService());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    voiceService.current.connect({
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
        
        setEdges((eds) => [...eds, flowEdge]);
      },
      onFinalize: ({ decisions: newDecisions, actionItems: newActionItems }) => {
        setDecisions(newDecisions);
        setActionItems(newActionItems);
        setStatus('idle');
        toast.success('Recording finalized', {
          description: `Found ${newDecisions.length} decisions and ${newActionItems.length} action items`
        });
      },
      onTranscription: (transcription) => {
        setTranscriptions(prev => [...prev, {
          id: transcription.id,
          text: transcription.text,
          timestamp: transcription.timestamp,
          confidence: transcription.confidence,
          duration: transcription.duration
        }]);
        toast.info('New transcription', {
          description: transcription.text.substring(0, 100) + '...'
        });
      },
      onSessionUpdate: (session) => {
        console.log('Session updated:', session);
      }
    });

    return () => {
      voiceService.current.disconnect();
    };
  }, [setNodes, setEdges, reactFlowInstance]);

  const handleStartRecording = useCallback(async () => {
    try {
      setStatus('listening');
      setDecisions([]);
      setActionItems([]);
      
      await voiceService.current.startRecording();
      
      toast.info('Started recording', {
        description: 'Voice recording session started. Upload audio files to transcribe.'
      });
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to start recording', {
        description: 'Please check your connection to the backend.'
      });
      setStatus('idle');
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    try {
      setStatus('finalizing');
      await voiceService.current.stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Failed to stop recording', {
        description: 'Please try again.'
      });
      setStatus('idle');
    }
  }, []);

  const handleSave = useCallback(() => {
    toast.success('Diagram saved', {
      description: 'Your diagram has been saved successfully'
    });
  }, []);

  const handleUploadAudio = useCallback(async (file: File) => {
    try {
      setStatus('processing');
      const transcription = await voiceService.current.uploadAudio(file, file.name);
      
      toast.success('Audio transcribed', {
        description: `Transcribed: "${transcription.text.substring(0, 50)}..."`
      });
      
      setStatus('listening');
    } catch (error) {
      console.error('Failed to upload audio:', error);
      toast.error('Failed to transcribe audio', {
        description: 'Please try again with a different audio file.'
      });
      setStatus('listening');
    }
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
          onUploadAudio={handleUploadAudio}
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
          transcriptions={transcriptions}
        />
      </div>
    </div>
  );
};

export default Board;
