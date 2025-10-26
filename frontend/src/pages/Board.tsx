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
  const [nodeSummary, setNodeSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCache, setSummaryCache] = useState<Map<string, string>>(new Map());
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  const wsService = useRef(new WebSocketService());
  const vapiService = useRef(new VapiService());
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastProcessedTime = useRef<number>(0);
  const lastRefinementTime = useRef<number>(0);
  const lastConversationLength = useRef<number>(0);
  const refinementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_PROCESS_INTERVAL = 15000; // 15 seconds between processing (4 API calls/min max)
  const REFINEMENT_INTERVAL = 30000; // 30 seconds between refinements (2 API calls/min max)
  const MIN_NEW_MESSAGES_FOR_REFINEMENT = 4; // Only refine if at least 4 new messages

  const fetchNodeSummary = useCallback(async (nodeId: string) => {
    // Check cache first
    if (summaryCache.has(nodeId)) {
      setNodeSummary(summaryCache.get(nodeId)!);
      return;
    }

    setSummaryLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      const response = await fetch(`${backendUrl}/api/node/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, contextWindow: 15000 })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.status}`);
      }
      
      const data = await response.json();
      setNodeSummary(data.summary);
      
      // Cache the summary
      setSummaryCache(prev => new Map(prev).set(nodeId, data.summary));
    } catch (error) {
      console.error('Failed to fetch node summary:', error);
      
      // Handle specific error cases
      if (error.message.includes('400')) {
        toast.error('No conversation context', {
          description: 'Please start a conversation first to generate summaries'
        });
      } else if (error.message.includes('404')) {
        toast.error('Node not found', {
          description: 'The selected node is no longer available'
        });
      } else {
        toast.error('Failed to generate summary', {
          description: 'Please try again later'
        });
      }
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryCache]);

  const handleTranscript = useCallback((conversationHistory: Array<{ role: 'user' | 'assistant', text: string }>) => {

    // Only process if we have substantial conversation (at least 2 exchanges: 1 user + 1 AI)
    if (conversationHistory.length < 2) {
      console.log('⏭️ Skipping - need at least 2 conversation exchanges');
      return;
    }

    // Check if there's enough new content (at least 2 new messages)
    const newMessagesCount = conversationHistory.length - lastConversationLength.current;
    if (newMessagesCount < 2 && lastConversationLength.current > 0) {
      console.log(`⏭️ Skipping - only ${newMessagesCount} new message(s), need at least 2`);
      return;
    }

    // Rate limiting: prevent processing too frequently
    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessedTime.current;

    if (timeSinceLastProcess < MIN_PROCESS_INTERVAL) {
      console.log(`⏱️ Rate limited: waiting ${Math.ceil((MIN_PROCESS_INTERVAL - timeSinceLastProcess) / 1000)}s before next process`);
      // Don't show toast for rate limiting - it's too noisy
      return;
    }

    // Update last processed time and conversation length
    lastProcessedTime.current = now;
    lastConversationLength.current = conversationHistory.length;

    // Format conversation for backend
    const formattedConversation = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`)
      .join('\n');

    // Send full conversation to backend via WebSocket
    wsService.current.sendTranscript(formattedConversation);

    console.log(`📤 Sent conversation to backend for processing (${conversationHistory.length} messages total, ${newMessagesCount} new)`);
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
          label: edge.type || 'relates to', // Show relationship type as label
          labelStyle: { 
            fill: 'hsl(var(--primary))', 
            fontWeight: 600,
            fontSize: 12
          },
          labelBgStyle: { 
            fill: 'hsl(var(--background))', 
            fillOpacity: 0.9 
          },
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 4,
          style: { 
            stroke: 'hsl(var(--primary))', 
            strokeWidth: 3 // Thicker for better visibility
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
            width: 25,
            height: 25,
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

      // Start refinement interval - refine graph every 30 seconds during recording
      // Only refine if there's significant new content
      let lastRefinedConversationLength = 0;
      refinementIntervalRef.current = setInterval(() => {
        const conversationHistory = vapiService.current.getConversationHistory();
        if (conversationHistory && conversationHistory.length > 0) {
          // Split into messages and count them
          const messages = conversationHistory.split('\n').filter(line => line.trim().length > 0);
          const newMessagesCount = messages.length - lastRefinedConversationLength;

          // Only refine if we have enough new content
          if (newMessagesCount >= MIN_NEW_MESSAGES_FOR_REFINEMENT) {
            console.log(`🔍 Triggering periodic graph refinement (${newMessagesCount} new messages since last refinement)`);
            wsService.current.refineGraph(conversationHistory);
            lastRefinedConversationLength = messages.length;
          } else {
            console.log(`⏭️ Skipping refinement - only ${newMessagesCount} new messages (need ${MIN_NEW_MESSAGES_FOR_REFINEMENT})`);
          }
        }
      }, REFINEMENT_INTERVAL);
      
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

      // Stop refinement interval
      if (refinementIntervalRef.current) {
        clearInterval(refinementIntervalRef.current);
        refinementIntervalRef.current = null;
        console.log('⏹️ Stopped refinement interval');
      }

      // Reset conversation tracking
      lastConversationLength.current = 0;
      lastProcessedTime.current = 0;

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
    
    // Fetch AI summary for the node
    fetchNodeSummary(node.id);
  }, [fetchNodeSummary]);

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
    setNodeSummary(null);
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
          nodeSummary={nodeSummary}
          summaryLoading={summaryLoading}
        />
      </div>
    </div>
  );
};

export default Board;
