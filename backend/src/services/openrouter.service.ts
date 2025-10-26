import axios, { AxiosResponse } from 'axios';
import { ChatMessage, OpenRouterResponse, Model } from '../types';

export class OpenRouterService {
    private apiKey: string;
    private baseUrl: string = 'https://openrouter.ai/api/v1';

    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        console.log('🔑 OpenRouter API Key loaded:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT FOUND');
        console.log('🔍 All env vars:', Object.keys(process.env).filter(k => k.includes('OPENROUTER')));
        if (!this.apiKey) {
            console.warn('⚠️  OPENROUTER_API_KEY not found in environment variables');
        }
    }

    async chat(message: string, model: string = 'google/gemini-pro', retries: number = 3): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response: AxiosResponse<OpenRouterResponse> = await axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model,
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

                return response.data.choices[0]?.message?.content || 'No response generated';
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    
                    // If rate limited (429), wait and retry with exponential backoff
                    if (status === 429 && attempt < retries - 1) {
                        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
                        console.warn(`⏳ Rate limited (429). Waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    
                    console.error('OpenRouter API Error:', error.response?.data || error.message);
                    throw new Error(`OpenRouter API Error: ${error.response?.data?.error?.message || error.message}`);
                }
                throw new Error('Failed to communicate with OpenRouter API');
            }
        }
        throw new Error('Max retries reached for OpenRouter API');
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
