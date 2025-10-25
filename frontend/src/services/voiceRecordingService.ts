import { DiagramNode, DiagramEdge, Decision, ActionItem, SourceRef } from '@/types/diagram';

export interface VoiceSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  transcriptions: TranscriptionRecord[];
  totalDuration: number;
  status: 'active' | 'completed' | 'cancelled';
}

export interface TranscriptionRecord {
  id: string;
  sessionId: string;
  text: string;
  confidence: number;
  language: string;
  duration: number;
  timestamp: string;
  audioFileName?: string;
  callId?: string;
  metadata?: Record<string, any>;
}

export class VoiceRecordingService {
  private callbacks: {
    onNode?: (node: DiagramNode) => void;
    onEdge?: (edge: DiagramEdge) => void;
    onFinalize?: (data: { decisions: Decision[]; actionItems: ActionItem[] }) => void;
    onTranscription?: (transcription: TranscriptionRecord) => void;
    onSessionUpdate?: (session: VoiceSession) => void;
  } = {};
  
  private currentSession: VoiceSession | null = null;
  private isRecording = false;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  connect(callbacks: typeof this.callbacks) {
    this.callbacks = callbacks;
    console.log('Voice Recording Service connected');
  }

  async startRecording(): Promise<string> {
    if (this.isRecording) return this.currentSession?.sessionId || '';

    try {
      const response = await fetch(`${this.baseUrl}/api/voice/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.statusText}`);
      }

      const data = await response.json();
      this.currentSession = {
        sessionId: data.sessionId,
        startTime: data.timestamp,
        transcriptions: [],
        totalDuration: 0,
        status: 'active'
      };

      this.isRecording = true;
      this.callbacks.onSessionUpdate?.(this.currentSession);
      
      console.log('Recording session started:', data.sessionId);
      return data.sessionId;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording || !this.currentSession) return;

    try {
      const response = await fetch(`${this.baseUrl}/api/voice/session/${this.currentSession.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to end session: ${response.statusText}`);
      }

      const data = await response.json();
      this.currentSession = data.session;
      this.isRecording = false;

      // Generate decisions and action items from transcriptions
      await this.generateInsights();

      this.callbacks.onSessionUpdate?.(this.currentSession);
      console.log('Recording session ended');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }

  async uploadAudio(audioBlob: Blob, filename: string): Promise<TranscriptionRecord> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    formData.append('sessionId', this.currentSession.sessionId);

    try {
      const response = await fetch(`${this.baseUrl}/api/voice/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to transcribe audio: ${response.statusText}`);
      }

      const data = await response.json();
      const transcription = data.transcription;

      // Update current session
      if (this.currentSession) {
        this.currentSession.transcriptions.push(transcription);
        this.currentSession.totalDuration += transcription.duration;
      }

      this.callbacks.onTranscription?.(transcription);
      return transcription;
    } catch (error) {
      console.error('Failed to upload audio:', error);
      throw error;
    }
  }

  async getSessions(): Promise<VoiceSession[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice/sessions`);
      
      if (!response.ok) {
        throw new Error(`Failed to get sessions: ${response.statusText}`);
      }

      const data = await response.json();
      return data.sessions;
    } catch (error) {
      console.error('Failed to get sessions:', error);
      return [];
    }
  }

  async getSession(sessionId: string): Promise<VoiceSession | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice/session/${sessionId}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to get session: ${response.statusText}`);
      }

      const data = await response.json();
      return data.session;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  async exportSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/voice/session/${sessionId}/export`);
      
      if (!response.ok) {
        throw new Error(`Failed to export session: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export session:', error);
      throw error;
    }
  }

  private async generateInsights(): Promise<void> {
    if (!this.currentSession || this.currentSession.transcriptions.length === 0) {
      this.callbacks.onFinalize?.({ decisions: [], actionItems: [] });
      return;
    }

    try {
      // Use AI to analyze transcriptions and generate insights
      const transcriptText = this.currentSession.transcriptions
        .map(t => `[${new Date(t.timestamp).toLocaleTimeString()}]: ${t.text}`)
        .join('\n');

      const prompt = `Analyze this conversation transcript and extract:
1. Key decisions made (2-3 sentences each)
2. Action items with owners (format: "Owner: Task")

Transcript:
${transcriptText}

Return as JSON: {"decisions": [{"text": "...", "confidence": 0.9}], "actionItems": [{"text": "...", "owner": "...", "confidence": 0.9}]}`;

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          model: 'google/gemini-pro'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to analyze transcript: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.response;

      // Parse AI response (it should be JSON)
      let insights;
      try {
        insights = JSON.parse(aiResponse);
      } catch {
        // Fallback: create simple insights from transcriptions
        insights = this.createFallbackInsights();
      }

      // Convert to the expected format
      const decisions: Decision[] = (insights.decisions || []).map((d: any, idx: number) => ({
        text: d.text || `Decision ${idx + 1}`,
        sourceRef: this.createSourceRef(d.text || `Decision ${idx + 1}`),
        confidence: d.confidence || 0.85
      }));

      const actionItems: ActionItem[] = (insights.actionItems || []).map((a: any, idx: number) => ({
        text: a.text || `Action ${idx + 1}`,
        owner: a.owner,
        sourceRef: this.createSourceRef(a.text || `Action ${idx + 1}`),
        confidence: a.confidence || 0.80
      }));

      this.callbacks.onFinalize?.({ decisions, actionItems });
    } catch (error) {
      console.error('Failed to generate insights:', error);
      // Fallback to simple insights
      const fallbackInsights = this.createFallbackInsights();
      this.callbacks.onFinalize?.(fallbackInsights);
    }
  }

  private createFallbackInsights(): { decisions: Decision[]; actionItems: ActionItem[] } {
    if (!this.currentSession || this.currentSession.transcriptions.length === 0) {
      return { decisions: [], actionItems: [] };
    }

    // Create simple insights from transcriptions
    const decisions: Decision[] = this.currentSession.transcriptions
      .filter(t => t.text.toLowerCase().includes('decide') || t.text.toLowerCase().includes('should'))
      .slice(0, 3)
      .map(t => ({
        text: t.text,
        sourceRef: this.createSourceRef(t.text),
        confidence: t.confidence
      }));

    const actionItems: ActionItem[] = this.currentSession.transcriptions
      .filter(t => t.text.toLowerCase().includes('need to') || t.text.toLowerCase().includes('will'))
      .slice(0, 5)
      .map(t => ({
        text: t.text,
        sourceRef: this.createSourceRef(t.text),
        confidence: t.confidence
      }));

    return { decisions, actionItems };
  }

  private createSourceRef(text: string): SourceRef {
    return {
      speaker: 'Voice Recording',
      timestamp: Date.now(),
      quote: text
    };
  }

  disconnect() {
    this.isRecording = false;
    this.currentSession = null;
    console.log('Voice Recording Service disconnected');
  }

  getCurrentSession(): VoiceSession | null {
    return this.currentSession;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}
