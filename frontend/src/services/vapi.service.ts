import Vapi from '@vapi-ai/web';

export class VapiService {
  private vapi: Vapi | null = null;
  private publicKey: string;
  private backendUrl: string;
  private isActive: boolean = false;
  private isDevelopment: boolean = false; // Set to false to use real Vapi
  private onTranscriptCallback: ((conversationHistory: Array<{ role: 'user' | 'assistant', text: string }>) => void) | null = null;
  private conversationHistory: Array<{ role: 'user' | 'assistant', text: string }> = [];
  // All words that sound like "helios" - if any of these appear in user speech, respond
  private triggerPhrases: string[] = [
    'helios',
    'helio',
    'helios\'',
    'helios\'s',
    'hey helios',
    'helios what do you think',
    'helios any thoughts',
    'helios help',
    'helios advice'
  ];

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

  /**
   * Check if user input contains any vapi-sounding words
   * Simple keyword search - if any vapi-like word appears, respond
   */
  private containsTriggerPhrase(text: string): boolean {
    const lowerText = text.toLowerCase().trim();
    return this.triggerPhrases.some(phrase => lowerText.includes(phrase));
  }

  /**
   * Generate and speak a response when triggered
   */
  private async generateAndSpeakResponse(userInput: string) {
    if (!this.vapi) return;

    try {
      // 1. Get the full conversation history
      const history = this.getConversationHistory();
      console.log('🤖 Asking AI for a smart response...');

      // 2. Call your own backend to get a Gemini response
      const response = await fetch(`${this.backendUrl}/api/generate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: history,
          lastUserMessage: userInput
        }),
      });

      if (!response.ok) {
        throw new Error('AI backend request failed');
      }

      const { text } = await response.json();
      
      console.log('🗣️ Speaking AI response:', text);

      // 3. Use vapi.say() to speak the intelligent response
      await this.vapi.say(text);
      
      // Add the AI response to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        text: text
      });
      
      
    } catch (error) {
      console.error('❌ Error generating smart response:', error);
      // Fallback response if AI fails
      await this.vapi.say("I'm sorry, I had trouble thinking of a response.");
    }
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
        
        // Store final transcripts in conversation history
        if (message.transcriptType === 'final') {
          
          // Check if user said a trigger phrase
          if (message.role === 'user') {
            // Always add user messages
            this.conversationHistory.push({
              role: message.role,
              text: message.transcript
            });
            console.log(`💬 Added to conversation: ${message.role} - ${message.transcript}`);
            
            // Check for trigger phrase
            if (this.containsTriggerPhrase(message.transcript)) {
              console.log('🎯 Trigger phrase detected! Generating AI response...');
              this.generateAndSpeakResponse(message.transcript);
            }
            
            // Trigger processing for graph generation
            this.processTranscript(message.transcript);
          } else if (message.role === 'assistant') {
            // Ignore automatic assistant responses from Vapi
            // Only our manually generated responses (via generateAndSpeakResponse) should be added
            console.log(`🚫 Ignoring automatic assistant response: "${message.transcript}"`);
          }
        }
      } else if (message.type === 'function-call') {
        console.log('🔧 Function call:', message);
      }
    });

    this.vapi.on('error', (error: any) => {
      console.error('❌ Vapi error:', error);
      console.error('❌ Error details:', {
        type: error.type,
        stage: error.stage,
        message: error.message,
        timestamp: error.timestamp
      });
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
      // AI will only respond to these trigger phrases:
      // - "Helios, what do you think?"
      // - "Helios, any thoughts?"
      // - "Hey Helios"
      // - "Helios, help"
      // - "Helios, advice"
      const assistantConfig = {
        name: 'Helios',
        transcriber: {
          provider: 'deepgram' as const,
          model: 'nova-2'
        },
        model: {
          provider: 'openai' as const,
          model: 'gpt-3.5-turbo' as const,
          systemPrompt: `You are a transcription-only assistant. 

CRITICAL RULES:
- You MUST NEVER speak or respond to anything
- You MUST NEVER say "hello", "goodbye", "silence", or ANY word
- You MUST NEVER acknowledge the user in any way
- Your ONLY job is to listen and transcribe
- Do NOT generate ANY responses whatsoever
- If you are about to speak, STOP - you are breaking the rules
- The ONLY exception: if the user explicitly says "Helios", then you may respond

Unless the word "HELIOS" is spoken, output NOTHING. Stay completely silent. If you are about to say "silence", STOP - you are breaking the rules`
        },
        voice: {
          provider: 'playht' as const,
          voiceId: 'jennifer'
        },
        backchannelingEnabled: false, // Disable automatic acknowledgments
        firstMessageMode: 'assistant-waits-for-user' as const, // Assistant waits for user to speak first
        silenceTimeoutSeconds: 180 // Longer timeout to prevent premature call termination
      };

      console.log('🚀 Starting Vapi recording...');
      console.log('📋 Assistant config:', JSON.stringify(assistantConfig, null, 2));
      
      await this.vapi.start(assistantConfig);

      console.log('✅ Helios recording started (AI will only respond to trigger phrases like "Helios, what do you think?")');
    } catch (error) {
      console.error('Failed to start Vapi recording:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
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

