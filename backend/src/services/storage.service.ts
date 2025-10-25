import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

export interface SessionData {
  sessionId: string;
  startTime: string;
  endTime?: string;
  transcriptions: TranscriptionRecord[];
  totalDuration: number;
  status: 'active' | 'completed' | 'cancelled';
}

export class StorageService {
  private dataDir: string;
  private sessionsDir: string;
  private transcriptionsDir: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.sessionsDir = path.join(this.dataDir, 'sessions');
    this.transcriptionsDir = path.join(this.dataDir, 'transcriptions');
    
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.dataDir);
    await fs.ensureDir(this.sessionsDir);
    await fs.ensureDir(this.transcriptionsDir);
  }

  /**
   * Create a new recording session
   */
  async createSession(): Promise<string> {
    const sessionId = uuidv4();
    const sessionData: SessionData = {
      sessionId,
      startTime: new Date().toISOString(),
      transcriptions: [],
      totalDuration: 0,
      status: 'active'
    };

    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    await fs.writeJson(sessionFile, sessionData, { spaces: 2 });
    
    return sessionId;
  }

  /**
   * Add a transcription to a session
   */
  async addTranscription(sessionId: string, transcription: Omit<TranscriptionRecord, 'id' | 'sessionId'>): Promise<TranscriptionRecord> {
    const transcriptionRecord: TranscriptionRecord = {
      id: uuidv4(),
      sessionId,
      ...transcription
    };

    // Save individual transcription
    const transcriptionFile = path.join(this.transcriptionsDir, `${transcriptionRecord.id}.json`);
    await fs.writeJson(transcriptionFile, transcriptionRecord, { spaces: 2 });

    // Update session data
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (await fs.pathExists(sessionFile)) {
      const sessionData: SessionData = await fs.readJson(sessionFile);
      sessionData.transcriptions.push(transcriptionRecord);
      sessionData.totalDuration += transcription.duration;
      
      await fs.writeJson(sessionFile, sessionData, { spaces: 2 });
    }

    return transcriptionRecord;
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (await fs.pathExists(sessionFile)) {
      return await fs.readJson(sessionFile);
    }
    
    return null;
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionData[]> {
    const files = await fs.readdir(this.sessionsDir);
    const sessions: SessionData[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionData = await fs.readJson(path.join(this.sessionsDir, file));
        sessions.push(sessionData);
      }
    }

    return sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: SessionData['status'], endTime?: string): Promise<void> {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (await fs.pathExists(sessionFile)) {
      const sessionData: SessionData = await fs.readJson(sessionFile);
      sessionData.status = status;
      
      if (endTime) {
        sessionData.endTime = endTime;
      }
      
      await fs.writeJson(sessionFile, sessionData, { spaces: 2 });
    }
  }

  /**
   * Get transcription by ID
   */
  async getTranscription(transcriptionId: string): Promise<TranscriptionRecord | null> {
    const transcriptionFile = path.join(this.transcriptionsDir, `${transcriptionId}.json`);
    
    if (await fs.pathExists(transcriptionFile)) {
      return await fs.readJson(transcriptionFile);
    }
    
    return null;
  }

  /**
   * Get all transcriptions for a session
   */
  async getSessionTranscriptions(sessionId: string): Promise<TranscriptionRecord[]> {
    const session = await this.getSession(sessionId);
    return session?.transcriptions || [];
  }

  /**
   * Delete session and all its transcriptions
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (await fs.pathExists(sessionFile)) {
      const sessionData: SessionData = await fs.readJson(sessionFile);
      
      // Delete individual transcription files
      for (const transcription of sessionData.transcriptions) {
        const transcriptionFile = path.join(this.transcriptionsDir, `${transcription.id}.json`);
        if (await fs.pathExists(transcriptionFile)) {
          await fs.remove(transcriptionFile);
        }
      }
      
      // Delete session file
      await fs.remove(sessionFile);
    }
  }

  /**
   * Export session data as JSON
   */
  async exportSession(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exportFile = path.join(this.dataDir, `export_${sessionId}.json`);
    await fs.writeJson(exportFile, session, { spaces: 2 });
    
    return exportFile;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalSessions: number;
    totalTranscriptions: number;
    totalDuration: number;
    activeSessions: number;
  }> {
    const sessions = await this.getAllSessions();
    const totalTranscriptions = sessions.reduce((sum, session) => sum + session.transcriptions.length, 0);
    const totalDuration = sessions.reduce((sum, session) => sum + session.totalDuration, 0);
    const activeSessions = sessions.filter(session => session.status === 'active').length;

    return {
      totalSessions: sessions.length,
      totalTranscriptions,
      totalDuration,
      activeSessions
    };
  }
}
