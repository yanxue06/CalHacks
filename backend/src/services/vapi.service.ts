import axios from 'axios';
import { VapiConfig, VapiAssistant, VapiFunction, VapiToolCall } from '../types';
import { prisma } from './db.service';

export class VapiService {
    private apiKey: string;
    private baseUrl: string = 'https://api.vapi.ai';

    constructor() {
        this.apiKey = process.env.VAPI_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️  VAPI_API_KEY not found in environment variables');
        }
    }

    // Persist a transcript message tied to a conversation (by external call id)
    async saveTranscript(params: { vapiCallId?: string; conversationId?: string; speaker: string; text: string; startMs?: number; endMs?: number; isFinal?: boolean; }) {
        const { vapiCallId, conversationId, speaker, text, startMs, endMs, isFinal = true } = params;
        let convoId = conversationId;
        if (!convoId && vapiCallId) {
            const convo = await prisma.conversation.upsert({
                where: { vapiCallId },
                update: {},
                create: { vapiCallId, status: 'active' }
            });
            convoId = convo.id;
        }
        if (!convoId) return;
        await prisma.message.create({
            data: { conversationId: convoId, speaker, text, startMs, endMs, isFinal }
        });
    }

    /**
     * Create a Vapi assistant with function calling for graph updates
     */
    async createAssistant(webhookUrl: string): Promise<any> {
        if (!this.apiKey) {
            throw new Error('Vapi API key not configured');
        }

        const assistant: VapiAssistant = {
            name: 'Confab Graph Assistant',
            firstMessage: 'Hi! I\'m your conversation assistant. Start talking and I\'ll help visualize the flow of your discussion.',
            model: {
                provider: 'openrouter',
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant that listens to conversations and creates visual node graphs.
                        
Your job is to:
1. Listen to the conversation in real-time
2. Identify key topics, decisions, actions, and ideas
3. Create nodes and edges to visualize the conversation flow
4. Call the updateGraph function whenever you identify something important

Node types:
- "Input": Starting points or initial topics
- "System": Core concepts or processes
- "Action": Tasks or actions to be taken
- "Decision": Decision points
- "Output": Results or outcomes

When you hear something important in the conversation, call the updateGraph function with appropriate nodes and edges.
Be proactive but not overwhelming - create nodes for meaningful points, not every single sentence.`
                    }
                ],
                functions: [
                    {
                        name: 'updateGraph',
                        description: 'Add new nodes and edges to the conversation graph when important points are discussed',
                        parameters: {
                            type: 'object',
                            properties: {
                                nodes: {
                                    type: 'array',
                                    description: 'Array of nodes to add to the graph',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            label: {
                                                type: 'string',
                                                description: 'The text label to display on the node'
                                            },
                                            type: {
                                                type: 'string',
                                                enum: ['Input', 'System', 'Action', 'Output', 'Decision'],
                                                description: 'The category/type of node (Input=start, System=concept, Action=task, Decision=choice, Output=result)'
                                            },
                                            importance: {
                                                type: 'string',
                                                enum: ['small', 'medium', 'large'],
                                                description: 'Size/importance of the node (small=simple thought, medium=important point, large=agreed consensus)'
                                            },
                                            data: {
                                                type: 'object',
                                                description: 'Additional metadata or context about this node (optional)'
                                            }
                                        },
                                        required: ['label', 'type']
                                    }
                                },
                                edges: {
                                    type: 'array',
                                    description: 'Array of edges connecting nodes (use node labels to reference)',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            source: {
                                                type: 'string',
                                                description: 'Label of the source node'
                                            },
                                            target: {
                                                type: 'string',
                                                description: 'Label of the target node'
                                            },
                                            label: {
                                                type: 'string',
                                                description: 'Label for the edge (optional)'
                                            }
                                        },
                                        required: ['source', 'target']
                                    }
                                }
                            },
                            required: ['nodes']
                        }
                    }
                ]
            },
            voice: {
                provider: 'elevenlabs',
                voiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel voice
            },
            transcriber: {
                provider: 'deepgram',
                model: 'nova-2'
            }
        };

        try {
            const response = await axios.post(
                `${this.baseUrl}/assistant`,
                assistant,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error creating Vapi assistant:', error);
            throw error;
        }
    }

    /**
     * Get assistant configuration
     */
    getAssistantConfig(): VapiAssistant {
        return {
            name: 'Confab Graph Assistant',
            firstMessage: 'Hi! Start talking and I\'ll help visualize your conversation.',
            model: {
                provider: 'openrouter',
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant that listens to conversations and creates visual node graphs.
                        
Your job is to:
1. Listen to the conversation in real-time
2. Identify key topics, decisions, actions, and ideas
3. Create nodes and edges to visualize the conversation flow
4. Call the updateGraph function whenever you identify something important

Node types:
- "Input": Starting points or initial topics
- "System": Core concepts or processes
- "Action": Tasks or actions to be taken
- "Decision": Decision points
- "Output": Results or outcomes

When you hear something important in the conversation, call the updateGraph function with appropriate nodes and edges.
Be proactive but not overwhelming - create nodes for meaningful points, not every single sentence.`
                    }
                ],
                functions: [
                    {
                        name: 'updateGraph',
                        description: 'Add new nodes and edges to the conversation graph',
                        parameters: {
                            type: 'object',
                            properties: {
                                nodes: {
                                    type: 'array',
                                    description: 'Array of nodes to add',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            label: { 
                                                type: 'string',
                                                description: 'Display label'
                                            },
                                            type: {
                                                type: 'string',
                                                enum: ['Input', 'System', 'Action', 'Output', 'Decision'],
                                                description: 'Node category'
                                            },
                                            importance: {
                                                type: 'string',
                                                enum: ['small', 'medium', 'large'],
                                                description: 'Size/importance of the node (small=simple thought, medium=important point, large=agreed consensus)'
                                            },
                                            data: { 
                                                type: 'object',
                                                description: 'Extra metadata'
                                            }
                                        },
                                        required: ['label', 'type']
                                    }
                                },
                                edges: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            source: { type: 'string' },
                                            target: { type: 'string' },
                                            label: { type: 'string' }
                                        }
                                    }
                                }
                            },
                            required: ['nodes']
                        }
                    }
                ]
            },
            voice: {
                provider: 'elevenlabs',
                voiceId: '21m00Tcm4TlvDq8ikWAM'
            },
            transcriber: {
                provider: 'deepgram',
                model: 'nova-2'
            }
        };
    }
}

