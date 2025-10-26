import { useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
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
import { BottomToolbar } from '@/components/BottomToolbar';
import { StatusBanner } from '@/components/StatusBanner';
import { DetailsSidebar } from '@/components/DetailsSidebar';
import { WebSocketService } from '@/services/websocket.service';
import { VapiService } from '@/services/vapi.service';
import { DiagramNode, DiagramEdge, Decision, ActionItem, RecordingStatus } from '@/types/diagram';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import { GripVertical } from 'lucide-react';

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
  const saveDebounceRef = useRef<number | null>(null);
  const MIN_PROCESS_INTERVAL = 20000; // 20 seconds between processing (3 API calls/min max)
  const REFINEMENT_INTERVAL = 60000; // 60 seconds between refinements (1 API call/min max)
  const MIN_NEW_MESSAGES_FOR_REFINEMENT = 6; // Only refine if at least 6 new messages
  const [collapsedMap, setCollapsedMap] = useState<Record<string, string[]>>({});
  const COLLAPSE_ZOOM = 0.9; // collapse sooner so it's noticeable
  const EXPAND_ZOOM = 1.0;   // expand when zoomed back near 1
  const [sidebarWidth, setSidebarWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [isResizing, setIsResizing] = useState(false);

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
    // Load from local storage on first mount
    try {
      const raw = localStorage.getItem('confab-graph');
      if (raw) {
        const parsed = JSON.parse(raw) as { nodes?: Node[]; edges?: Edge[] };
        if (parsed.nodes && Array.isArray(parsed.nodes)) setNodes(parsed.nodes);
        if (parsed.edges && Array.isArray(parsed.edges)) setEdges(parsed.edges);
        console.log('📦 Loaded graph from local storage');
      }
    } catch (e) {
      console.warn('Failed to load graph from local storage');
    }

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
            confidence: node.data.confidence,
            speakerName: node.data.metadata?.speakerName,
            speakerInitials: node.data.metadata?.speakerInitials,
            speakerAvatar: node.data.metadata?.speakerAvatar
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

  // Persist nodes/edges to local storage (debounced)
  useEffect(() => {
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      try {
        const payload = JSON.stringify({ nodes, edges });
        localStorage.setItem('confab-graph', payload);
        // console.debug('💾 Graph saved');
      } catch (e) {
        console.warn('Failed to save graph to local storage');
      }
    }, 300);
    return () => {
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
  }, [nodes, edges]);

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

      // Trigger final graph reformation to connect all nodes
      try {
        console.log('🔗 Triggering final graph reformation to connect all nodes');
        const conversationHistory = vapiService.current.getConversationHistory();
        if (conversationHistory && conversationHistory.trim().length > 0) {
          wsService.current.finalizeGraph(conversationHistory);
        } else {
          console.log('⏭️ No conversation history to finalize');
        }
      } catch (finalizationError) {
        console.error('⚠️ Finalization failed (non-critical):', finalizationError);
        // Don't throw - finalization is optional
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Error stopping recording', {
        description: 'Recording may have already stopped'
      });
      setStatus('idle');
    }
  }, []);

  const handleSave = useCallback(() => {
    try {
      const payload = JSON.stringify({ nodes, edges });
      localStorage.setItem('confab-graph', payload);
    } catch (e) {
      // ignore
    }
    toast.success('Diagram saved', {
      description: 'Your diagram has been saved successfully'
    });
  }, [nodes, edges]);

  const handleQuickAddNode = useCallback((opts: { label: string; color: string }) => {
    const id = `manual-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'custom',
      position: { x: (Math.random() * 600) + 100, y: (Math.random() * 400) + 100 },
      data: {
        label: opts.label,
        nodeType: 'service',
        sourceRefs: [],
        confidence: 0.95,
        color: opts.color
      }
    };
    setNodes((nds) => [...nds, newNode]);
    // Optionally broadcast to backend as a manual add via restructure, skipped for now
  }, [setNodes]);

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
    try { localStorage.removeItem('confab-graph'); } catch {}
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

  // Copy/paste selected nodes
  const clipboardRef = useRef<Node[] | null>(null);
  const handleCopy = useCallback(() => {
    const selected = nodes.filter(n => (n as any).selected);
    if (selected.length === 0) return;
    clipboardRef.current = selected.map(n => ({ ...n, position: { ...n.position } }));
    toast.info(`Copied ${selected.length} node(s)`);
  }, [nodes]);

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.length === 0) return;
    const dx = 30, dy = 30;
    const cloned = clipboardRef.current.map(n => ({
      ...n,
      id: `${n.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      position: { x: n.position.x + dx, y: n.position.y + dy },
      selected: false
    }));
    setNodes(nds => [...nds, ...cloned]);
    toast.success(`Pasted ${cloned.length} node(s)`);
  }, [setNodes]);

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCopy, handlePaste]);

  // --- Zoom-based grouping (collapse/expand many small nodes under a parent) ---
  const buildChildrenMap = useCallback((): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    edges.forEach((e) => {
      (map[e.source] ||= []).push(e.target);
    });
    return map;
  }, [edges]);

  const collapseParent = useCallback((parentId: string, childIds: string[]) => {
    setNodes((nds) => {
      const childSet = new Set(childIds);
      const parent = nds.find(n => n.id === parentId);
      const children = nds.filter(n => childSet.has(n.id));
      const centroid = children.length > 0
        ? {
            x: children.reduce((a, n) => a + n.position.x, 0) / children.length,
            y: children.reduce((a, n) => a + n.position.y, 0) / children.length,
          }
        : parent?.position || { x: 0, y: 0 };

      const clusterNode: Node = {
        id: `cluster-${parentId}`,
        type: 'custom',
        position: { x: centroid.x, y: centroid.y },
        data: {
          label: `Group (${childIds.length})`,
          nodeType: 'service',
          sourceRefs: [],
          confidence: 1,
        },
      } as any;

      const next = nds.map(n => childSet.has(n.id) ? { ...n, hidden: true } : n);
      // Avoid duplicating cluster if already present
      if (!next.some(n => n.id === clusterNode.id)) next.push(clusterNode);
      return next;
    });

    setEdges((eds) => {
      const childSet = new Set(childIds);
      const next = eds.map(e => (e.source === parentId && childSet.has(e.target)) ? { ...e, hidden: true } : e);
      const clusterEdgeId = `cluster-edge-${parentId}`;
      if (!next.some(e => e.id === clusterEdgeId)) {
        next.push({
          id: clusterEdgeId,
          source: parentId,
          target: `cluster-${parentId}`,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 }
        } as any);
      }
      return next;
    });

    setCollapsedMap((m) => ({ ...m, [parentId]: childIds }));
  }, [setNodes, setEdges]);

  const expandParent = useCallback((parentId: string) => {
    const childIds = collapsedMap[parentId];
    if (!childIds) return;
    setNodes((nds) => nds
      .filter(n => n.id !== `cluster-${parentId}`)
      .map(n => childIds.includes(n.id) ? { ...n, hidden: false } : n)
    );
    setEdges((eds) => eds
      .filter(e => e.id !== `cluster-edge-${parentId}`)
      .map(e => (e.source === parentId && childIds.includes(e.target)) ? { ...e, hidden: false } : e)
    );
    setCollapsedMap((m) => {
      const { [parentId]: _, ...rest } = m;
      return rest;
    });
  }, [collapsedMap]);

  const handleMove = useCallback((_evt: any, viewport: { zoom: number }) => {
    const zoom = viewport?.zoom ?? reactFlowInstance?.getZoom?.() ?? 1;
    const childrenMap = buildChildrenMap();
    if (zoom < COLLAPSE_ZOOM) {
      Object.entries(childrenMap).forEach(([parentId, list]) => {
        if (list.length >= 6 && !collapsedMap[parentId]) {
          collapseParent(parentId, list);
        }
      });
    } else if (zoom >= EXPAND_ZOOM) {
      Object.keys(collapsedMap).forEach(expandParent);
    }
  }, [reactFlowInstance, buildChildrenMap, collapsedMap, collapseParent, expandParent]);

  // Sidebar resize handlers
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    // Min width: 280px, Max width: 600px
    setSidebarWidth(Math.max(280, Math.min(600, newWidth)));
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Also recheck on nodes/edges change using current zoom
  useEffect(() => {
    const zoom = reactFlowInstance?.getZoom?.() ?? 1;
    handleMove(undefined as any, { zoom });
  }, [nodes, edges]);

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
            onMove={handleMove}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            minZoom={0.2}
            maxZoom={2}
            className="bg-background"
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: 'hsl(var(--border))', strokeWidth: 1.5 }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={2} color="hsl(var(--border))" />
            <Controls className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
          </ReactFlow>

          <BottomToolbar onQuickAddNode={handleQuickAddNode} />
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`relative w-px bg-border hover:bg-primary transition-colors cursor-col-resize z-50 ${
            isResizing ? 'bg-primary' : ''
          }`}
          style={{ touchAction: 'none' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md p-1 shadow-lg">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0">
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
    </div>
  );
};

export default Board;
