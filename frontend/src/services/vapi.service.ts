import Vapi from '@vapi-ai/web';

export class VapiService {
  private vapi: Vapi | null = null;
  private publicKey: string;
  private backendUrl: string;
  private isActive: boolean = false;
  private isDevelopment: boolean = false; // Set to false to use real Vapi
  private onTranscriptCallback: ((conversationHistory: Array<{ role: 'user' | 'assistant', text: string }>) => void) | null = null;
  private conversationHistory: Array<{ role: 'user' | 'assistant', text: string }> = [];

  constructor() {
    this.publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY || '';
    this.backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    
    if (!this.publicKey) {
      console.warn('⚠️ VITE_VAPI_PUBLIC_KEY not found. Please add it to your .env file');
    }
  }

  setTranscriptCallback(callback: (conversationHistory: Array<{ role: 'user' | 'assistant', text: string }>) => void) {
    this.onTranscriptCallback = callback;
  }

  getConversationHistory(): string {
    return this.conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`)
      .join('\n');
  }

  clearConversationHistory() {
    this.conversationHistory = [];
  }

  async initialize() {
    if (!this.publicKey) {
      throw new Error('Vapi public key is required. Please set VITE_VAPI_PUBLIC_KEY in your .env file');
    }

    try {
      // Initialize Vapi with the public key
      this.vapi = new Vapi(this.publicKey);
      this.setupEventListeners();
      console.log('✅ Vapi initialized');
    } catch (error) {
      console.error('Failed to initialize Vapi:', error);
      throw error;
    }
  }

  private setupEventListeners() {
    if (!this.vapi) return;

    this.vapi.on('call-start', () => {
      console.log('🎙️ Vapi call started');
      this.isActive = true;
    });

    this.vapi.on('call-end', () => {
      console.log('🛑 Vapi call ended');
      this.isActive = false;
    });

    this.vapi.on('speech-start', () => {
      console.log('🗣️ User started speaking');
    });

    this.vapi.on('speech-end', () => {
      console.log('🤫 User stopped speaking');
    });

    this.vapi.on('message', (message: any) => {
      console.log('📨 Vapi message:', message);
      
      // Handle different message types
      if (message.type === 'transcript') {
        console.log('📝 Transcript:', message.transcript);
        
        // Store ALL final transcripts (both user and assistant) in conversation history
        if (message.transcriptType === 'final') {
          this.conversationHistory.push({
            role: message.role,
            text: message.transcript
          });
          console.log(`💬 Added to conversation: ${message.role} - ${message.transcript}`);
          
          // Trigger processing on BOTH user and assistant final transcripts
          // This ensures nodes are generated as the conversation evolves
          this.processTranscript(message.transcript);
        }
      } else if (message.type === 'function-call') {
        console.log('🔧 Function call:', message);
      }
    });

    this.vapi.on('error', (error: any) => {
      console.error('❌ Vapi error:', error);
    });

    this.vapi.on('volume-level', (level: number) => {
      // Volume level for visual feedback (0-1)
      // Can be used to show audio input visualization
    });
  }

  async startRecording() {
    // Clear conversation history when starting a new recording
    this.clearConversationHistory();
    console.log('🗑️ Cleared conversation history for new recording');
    
    // For development mode, skip Vapi initialization and simulate recording
    if (this.isDevelopment) {
      console.log('🔧 Development mode: Simulating Vapi recording');
      this.isActive = true;
      
      // Simulate some nodes being added for demo purposes
      setTimeout(() => {
        console.log('📝 Simulated transcript: "I think we should build a user database"');
        // You could trigger WebSocket events here to simulate real behavior
      }, 2000);
      
      console.log('✅ Vapi recording started (development mode)');
      return;
    }

    if (!this.vapi) {
      await this.initialize();
    }

    if (!this.vapi) {
      throw new Error('Vapi not initialized');
    }

    try {
      // Start Vapi with custom assistant configuration
      // Using proper Vapi SDK format
      const assistantConfig = {
        name: 'Conversation Assistant',
        transcriber: {
          provider: 'deepgram' as const,
          model: 'nova-2',
          language: 'en' as const
        },
        model: {
          provider: 'openai' as const,
          model: 'gpt-3.5-turbo' as const,
          systemPrompt: `You are a helpful AI assistant. IMPORTANT: You should ONLY respond when the user explicitly asks for your opinion or says "Vapi, what do you think".

If the user says anything else, remain completely silent and do not respond at all. Do not acknowledge their statements unless they specifically ask for your input.

When invoked, provide brief, helpful responses about the topic they're discussing.`
        },
        voice: {
          provider: 'playht' as const,
          voiceId: 'jennifer'
        }
      };

      console.log('🚀 Starting Vapi recording...');
      console.log('📋 Assistant config:', JSON.stringify(assistantConfig, null, 2));
      
      await this.vapi.start(assistantConfig);

      console.log('✅ Vapi recording started (AI will only respond when you say "Vapi, what do you think")');
    } catch (error) {
      console.error('Failed to start Vapi recording:', error);
      
      // If Vapi fails due to CORS or other issues, fall back to development mode
      console.warn('⚠️ Vapi error - falling back to development mode');
      this.isDevelopment = true;
      this.isActive = true;
      console.log('✅ Vapi recording started (development mode)');
    }
  }

  async stopRecording() {
    if (!this.isActive) {
      console.warn('Vapi is not active');
      return;
    }

    if (this.isDevelopment) {
      console.log('🔧 Development mode: Stopping simulated recording');
      this.isActive = false;
      console.log('✅ Vapi recording stopped (development mode)');
      return;
    }

    if (!this.vapi) {
      console.warn('Vapi not initialized');
      return;
    }

    try {
      await this.vapi.stop();
      console.log('✅ Vapi recording stopped');
    } catch (error) {
      console.error('Failed to stop Vapi recording:', error);
      throw error;
    }
  }

  isRecording(): boolean {
    return this.isActive;
  }

  private async processTranscript(transcript: string) {
    try {
      console.log('🔄 Processing transcript:', transcript);
      
      // Only process substantial transcripts (at least 20 characters, multiple words)
      const wordCount = transcript.trim().split(/\s+/).length;
      if (transcript.length < 20 || wordCount < 4) {
        console.log('⏭️ Skipping short transcript (need at least 4 words):', transcript);
        return;
      }
      
      // Send the ENTIRE conversation history, not just the last message
      const fullConversation = this.getConversationHistory();
      console.log('📜 Full conversation history:', fullConversation);
      
      // Use callback to send full conversation to Board component, which will use WebSocket
      if (this.onTranscriptCallback) {
        console.log('📤 Sending full conversation via callback');
        this.onTranscriptCallback(this.conversationHistory);
      } else {
        console.warn('⚠️ No transcript callback set');
      }
    } catch (error) {
      console.error('❌ Error processing transcript:', error);
    }
  }

  cleanup() {
    if (this.vapi) {
      this.vapi.stop();
      this.vapi = null;
    }
  }
}

