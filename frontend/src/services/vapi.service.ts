import Vapi from '@vapi-ai/web';

export class VapiService {
  private vapi: Vapi | null = null;
  private publicKey: string;
  private backendUrl: string;
  private isActive: boolean = false;
  private isDevelopment: boolean = true; // Set to true for localhost development

  constructor() {
    this.publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY || '';
    this.backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    
    if (!this.publicKey) {
      console.warn('⚠️ VITE_VAPI_PUBLIC_KEY not found. Please add it to your .env file');
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
      // Get the assistant configuration from backend
      const response = await fetch(`${this.backendUrl}/api/vapi/config`);
      const assistantConfig = await response.json();

      console.log('🚀 Starting Vapi call with assistant config:', assistantConfig);

      // Try starting with minimal config first
      await this.vapi.start({
        assistantId: null, // Let Vapi handle this
        serverUrl: `${this.backendUrl}/api/vapi/function-call`
      });

      console.log('✅ Vapi recording started');
    } catch (error) {
      console.error('Failed to start Vapi recording:', error);
      
      // If Vapi fails due to CORS, fall back to development mode
      if (error.message?.includes('cors') || error.type === 'cors') {
        console.warn('⚠️ Vapi CORS error - falling back to development mode');
        this.isDevelopment = true;
        this.isActive = true;
        console.log('✅ Vapi recording started (development mode)');
        return;
      }
      
      throw error;
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

  cleanup() {
    if (this.vapi) {
      this.vapi.stop();
      this.vapi = null;
    }
  }
}

