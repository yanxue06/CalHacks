import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { OpenRouterService } from './services/openrouter.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize OpenRouter service
const openRouterService = new OpenRouterService();

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
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { message, model = 'google/gemini-pro' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
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
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
    console.log(`🤖 AI Chat at http://localhost:${PORT}/api/chat`);
});

export default app;
