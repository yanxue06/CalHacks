import axios, { AxiosResponse } from 'axios';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface OpenRouterResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface Model {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
    };
}

export class OpenRouterService {
    private apiKey: string;
    private baseUrl: string = 'https://openrouter.ai/api/v1';

    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️  OPENROUTER_API_KEY not found in environment variables');
        }
    }

    async chat(message: string, model: string = 'google/gemini-pro'): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

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
                        'HTTP-Referer': 'http://localhost:5000', // Optional: for tracking
                        'X-Title': 'CalHacks AI Backend' // Optional: for tracking
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
                        'HTTP-Referer': 'http://localhost:5000',
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
