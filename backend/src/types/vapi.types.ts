export interface VapiConfig {
    apiKey: string;
    model?: string;
    voice?: string;
    transcriber?: {
        provider: string;
        model: string;
    };
}

export interface VapiAssistant {
    name: string;
    firstMessage: string;
    model: {
        provider: string;
        model: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
        functions?: VapiFunction[];
    };
    voice: {
        provider: string;
        voiceId: string;
    };
    transcriber?: {
        provider: string;
        model: string;
    };
}

export interface VapiFunction {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface VapiToolCall {
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

