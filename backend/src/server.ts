import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { OpenRouterService } from './services/openrouter.service';
import { GraphService } from './services/graph.service';
import { VapiService } from './services/vapi.service';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize services
const openRouterService = new OpenRouterService();
const graphService = new GraphService();
const vapiService = new VapiService();

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Send current graph state to newly connected client
    socket.emit('graph:update', graphService.getGraph());

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });

    socket.on('graph:request', () => {
        socket.emit('graph:update', graphService.getGraph());
    });
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('combined')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Routes
app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'CalHacks Backend API with Gemini AI',
        version: '1.0.0',
        status: 'running',
        features: ['gemini-ai', 'typescript', 'openrouter']
    });
});

app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// AI Chat endpoint
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { message, model = 'google/gemini-pro' } = req.body;

        if (!message) {
            res.status(400).json({ error: 'Message is required' });
            return;
        }

        const response = await openRouterService.chat(message, model);
        res.json({ response });
    } catch (error) {
        next(error);
    }
});

// Get available models
app.get('/api/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const models = await openRouterService.getModels();
        res.json({ models });
    } catch (error) {
        next(error);
    }
});

// ==================== VAPI INTEGRATION ENDPOINTS ====================

// Get Vapi assistant configuration
app.get('/api/vapi/config', (req: Request, res: Response) => {
    try {
        const config = vapiService.getAssistantConfig();
        res.json(config);
    } catch (error) {
        console.error('Error getting Vapi config:', error);
        res.status(500).json({ error: 'Failed to get Vapi configuration' });
    }
});

// Webhook endpoint for Vapi function calls
app.post('/api/vapi/function-call', async (req: Request, res: Response): Promise<void> => {
    try {
        const { message } = req.body;

        console.log('📞 Vapi function call received:', JSON.stringify(message, null, 2));

        // Extract the function call from Vapi
        if (message?.toolCalls && message.toolCalls.length > 0) {
            const toolCall = message.toolCalls[0];
            const functionName = toolCall.function?.name;
            
            if (functionName === 'updateGraph') {
                // Parse the function arguments
                let args;
                try {
                    args = typeof toolCall.function.arguments === 'string' 
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;
                } catch (e) {
                    console.error('Error parsing function arguments:', e);
                    res.status(400).json({ error: 'Invalid function arguments' });
                    return;
                }

                console.log('📊 Updating graph with:', args);

                const { nodes = [], edges = [] } = args;

                // Create a map to track node IDs by label
                const nodeIdMap: Record<string, string> = {};

                // Add nodes to graph (React Flow format)
                const addedNodes = nodes.map((node: any) => {
                    const newNode = graphService.addNode({
                        label: node.label,
                        category: node.type || node.category, // Support both 'type' and 'category' from Gemini
                        importance: node.importance || 'small', // Add importance from Vapi
                        metadata: node.data
                    });
                    nodeIdMap[node.label] = newNode.id;
                    return newNode;
                });

                // Add edges (map labels to IDs)
                const addedEdges = edges.map((edge: any) => {
                    const sourceId = nodeIdMap[edge.source] || edge.source;
                    const targetId = nodeIdMap[edge.target] || edge.target;
                    return graphService.addEdge(sourceId, targetId, edge.label);
                });

                // Broadcast update to all connected clients via WebSocket
                io.emit('graph:update', graphService.getGraph());
                io.emit('graph:nodeAdded', { nodes: addedNodes, edges: addedEdges });

                console.log('✅ Graph updated and broadcasted');

                // Respond to Vapi
                res.json({
                    result: `Successfully added ${addedNodes.length} nodes and ${addedEdges.length} edges`,
                    nodes: addedNodes,
                    edges: addedEdges
                });
                return;
            }
        }

        // Default response if no function call was recognized
        res.json({ result: 'No action taken' });
    } catch (error) {
        console.error('Error handling Vapi function call:', error);
        res.status(500).json({ error: 'Failed to process function call' });
    }
});

// General Vapi webhook endpoint for other events
app.post('/api/vapi/webhook', (req: Request, res: Response) => {
    try {
        const event = req.body;
        console.log('🔔 Vapi webhook event:', event.type || 'unknown');

        // Handle different Vapi events
        switch (event.type) {
            case 'transcript':
                // Store transcript with speaker information
                if (event.transcript) {
                    const speaker = event.speaker || 'unknown';
                    graphService.addTranscript(speaker, event.transcript);
                    
                    // Broadcast to clients with speaker info
                    io.emit('transcript:update', {
                        text: event.transcript,
                        speaker: speaker,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
            
            case 'conversation-start':
                console.log('🎙️ Conversation started');
                io.emit('conversation:started');
                break;
            
            case 'conversation-end':
                console.log('🛑 Conversation ended');
                io.emit('conversation:ended');
                break;
            
            case 'function-call':
                // This should be handled by /api/vapi/function-call endpoint
                console.log('Function call received via webhook');
                break;
            
            default:
                console.log('Unknown event type:', event.type);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error handling Vapi webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// ==================== AI SUMMARY ENDPOINT ====================

// Generate AI summary for a node
app.post('/api/node/summary', async (req: Request, res: Response) => {
    try {
        const { nodeId, contextWindow } = req.body;
        
        const node = graphService.getGraph().nodes.find(n => n.id === nodeId);
        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        
        // Get recent transcripts for context
        const transcripts = graphService.getRecentTranscripts(contextWindow || 15000);
        const transcriptsText = transcripts.map(t => `[${t.speaker}]: ${t.text}`).join('\n');
        
        // Use OpenRouter to generate summary
        const summaryPrompt = `Given this conversation context from the last ${Math.floor((contextWindow || 15000) / 1000)} seconds:

${transcriptsText}

Please provide a brief 2-3 sentence summary of what was discussed about: "${node.data.label}"

Be specific and focus on the key points related to this topic.`;

        const summary = await openRouterService.chat(summaryPrompt, 'google/gemini-pro');
        
        res.json({ 
            summary,
            nodeId,
            contextWindow: contextWindow || 15000
        });
    } catch (error) {
        console.error('Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

// ==================== GRAPH MANAGEMENT ENDPOINTS ====================

// Get current graph
app.get('/api/graph', (req: Request, res: Response) => {
    res.json(graphService.getGraph());
});

// Clear graph
app.post('/api/graph/clear', (req: Request, res: Response) => {
    graphService.clearGraph();
    io.emit('graph:update', graphService.getGraph());
    res.json({ message: 'Graph cleared' });
});

// Manually add node (for testing)
app.post('/api/graph/node', (req: Request, res: Response): void => {
    try {
        const { label, category, type, metadata, position } = req.body;
        
        if (!label || !category) {
            res.status(400).json({ error: 'Label and category are required' });
            return;
        }

        const node = graphService.addNode({ 
            label, 
            category,
            type,
            metadata,
            position
        });
        io.emit('graph:update', graphService.getGraph());
        
        res.json({ node });
    } catch (error) {
        console.error('Error adding node:', error);
        res.status(500).json({ error: 'Failed to add node' });
    }
});

// Manually add edge (for testing)
app.post('/api/graph/edge', (req: Request, res: Response): void => {
    try {
        const { source, target, label, type, animated } = req.body;
        
        if (!source || !target) {
            res.status(400).json({ error: 'Source and target are required' });
            return;
        }

        const edge = graphService.addEdge(source, target, label, type, animated);
        io.emit('graph:update', graphService.getGraph());
        
        res.json({ edge });
    } catch (error) {
        console.error('Error adding edge:', error);
        res.status(500).json({ error: 'Failed to add edge' });
    }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
    console.log(`🤖 AI Chat at http://localhost:${PORT}/api/chat`);
    console.log(`🔌 WebSocket ready for real-time updates`);
    console.log(`🎙️  Vapi webhook at http://localhost:${PORT}/api/vapi/webhook`);
    console.log(`📊 Vapi function calls at http://localhost:${PORT}/api/vapi/function-call`);
});

export default app;
