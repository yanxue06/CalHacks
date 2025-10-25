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

