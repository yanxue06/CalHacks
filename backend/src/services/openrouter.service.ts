import axios, { AxiosResponse } from 'axios';
import { ChatMessage, OpenRouterResponse, Model } from '../types';

export class OpenRouterService {
    private apiKey: string;
    private baseUrl: string = 'https://openrouter.ai/api/v1';
    private lastRequestTime: number = 0;
    private minRequestInterval: number = 3000; // 3 seconds between requests (max 20 requests/min)
    
    // Model priority: start with paid models, use free as fallback
    private paidModels: string[] = [
        'google/gemini-pro',
        'google/gemini-flash-1.5',
        'anthropic/claude-3-haiku',
        'openai/gpt-3.5-turbo'
    ];
    
    private freeModels: string[] = [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.2-3b-instruct:free',
        'meta-llama/llama-3.2-1b-instruct:free',
        'qwen/qwen-2-7b-instruct:free'
    ];

    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        console.log('🔑 OpenRouter API Key loaded:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT FOUND');
        console.log('🔍 All env vars:', Object.keys(process.env).filter(k => k.includes('OPENROUTER')));
        if (!this.apiKey) {
            console.warn('⚠️  OPENROUTER_API_KEY not found in environment variables');
        }
    }

    /**
     * Throttle requests to prevent rate limiting
     */
    private async throttle(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`⏳ Throttling: waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    async chat(message: string, model?: string, retries: number = 3): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        // If no model specified, try paid models first, then free models as fallback
        const modelsToTry = model ? [model] : [...this.paidModels, ...this.freeModels];
        
        for (const currentModel of modelsToTry) {
            console.log(`🤖 Trying model: ${currentModel}`);
            
            try {
                // Throttle to prevent rate limiting
                await this.throttle();
                
                const response: AxiosResponse<OpenRouterResponse> = await axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model: currentModel,
                        messages: [
                            {
                                role: 'user',
                                content: message
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 1000
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'http://localhost:5001',
                            'X-Title': 'CalHacks AI Backend'
                        }
                    }
                );

                const result = response.data.choices[0]?.message?.content || 'No response generated';
                console.log(`✅ Model ${currentModel} succeeded`);
                return result;
                
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const errorData = error.response?.data;
                    
                    console.error('OpenRouter API Error:', errorData);
                    
                    // If rate limited (429), try next model
                    if (status === 429) {
                        console.warn(`⚠️ Model ${currentModel} rate limited, trying next model...`);
                        continue;
                    }
                    
                    // If model not found (404), try next model
                    if (status === 404) {
                        console.warn(`⚠️ Model ${currentModel} not found, trying next model...`);
                        continue;
                    }
                    
                    // For other errors, try next model
                    console.warn(`⚠️ Model ${currentModel} failed, trying next model...`);
                    continue;
                }
                
                console.error(`❌ Unexpected error with model ${currentModel}:`, error);
                continue;
            }
        }
        
        throw new Error('All models failed. Please try again later.');
    }

    async getModels(): Promise<Model[]> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        try {
            const response: AxiosResponse<{ data: Model[] }> = await axios.get(
                `${this.baseUrl}/models`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Filter for Gemini models
            return response.data.data.filter(model =>
                model.id.includes('google/gemini') ||
                model.id.includes('gemini')
            );
        } catch (error) {
            console.error('Error fetching models:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch models: ${error.response?.data?.error?.message || error.message}`);
            }
            throw new Error('Failed to fetch available models');
        }
    }

    async chatWithHistory(messages: ChatMessage[], model: string = 'google/gemini-pro'): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        try {
            const response: AxiosResponse<OpenRouterResponse> = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1000
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:5001',
                        'X-Title': 'CalHacks AI Backend'
                    }
                }
            );

            return response.data.choices[0]?.message?.content || 'No response generated';
        } catch (error) {
            console.error('OpenRouter API Error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`OpenRouter API Error: ${error.response?.data?.error?.message || error.message}`);
            }
            throw new Error('Failed to communicate with OpenRouter API');
        }
    }
}
