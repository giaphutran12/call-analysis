q import { TranscriptionConfig, TranscriptionResult, TranscriptionUtterance, TranscriptionFile } from '@/lib/types/pipeline';
import fs from 'fs';
import path from 'path';

export class AssemblyAIService {
  private apiKey: string;
  private baseUrl = 'https://api.assemblyai.com/v2';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Upload audio file to AssemblyAI
   */
  async uploadAudio(filePath: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    
    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'content-type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload audio: ${response.statusText}`);
    }

    const data = await response.json();
    return data.upload_url;
  }

  /**
   * Create transcription job
   */
  async createTranscription(audioUrl: string, config: TranscriptionConfig): Promise<string> {
    const response = await fetch(`${this.baseUrl}/transcript`, {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        ...config,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create transcription: ${response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Poll transcription status
   */
  async getTranscriptionStatus(transcriptId: string): Promise<TranscriptionResult> {
    const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
      headers: {
        'authorization': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get transcription status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Wait for transcription to complete
   */
  async waitForTranscription(transcriptId: string, maxWaitTime = 300000): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWaitTime) {
      const result = await this.getTranscriptionStatus(transcriptId);
      
      if (result.status === 'completed' || result.status === 'error') {
        return result;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Transcription timeout');
  }

  /**
   * Transcribe a single audio file
   */
  async transcribeFile(fileInfo: TranscriptionFile): Promise<TranscriptionResult> {
    try {
      // Upload audio file
      const audioUrl = await this.uploadAudio(fileInfo.filepath);
      
      // Create transcription with slam-1 model like original
      const config: TranscriptionConfig = {
        speech_model: 'best',  // Using 'best' as slam-1 may not be available
        speaker_labels: true,
        language_code: 'en_us',
      };
      
      const transcriptId = await this.createTranscription(audioUrl, config);
      
      // Wait for completion
      const result = await this.waitForTranscription(transcriptId);
      
      if (result.status === 'completed') {
        // Save formatted transcript
        const formattedText = this.formatTranscript(result);
        fs.writeFileSync(fileInfo.transcriptFile, formattedText, 'utf-8');
        
        // Save raw JSON
        const rawData = {
          id: result.id,
          status: result.status,
          text: result.text,
          utterances: result.utterances,
          words: result.words,
          audio_duration: result.audio_duration,
          confidence: result.confidence,
          language_code: result.language_code,
          created: result.created,
        };
        fs.writeFileSync(fileInfo.rawTranscriptFile, JSON.stringify(rawData, null, 2), 'utf-8');
      }
      
      return result;
    } catch (error) {
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format transcript with speaker labels and timestamps
   */
  formatTranscript(transcript: TranscriptionResult): string {
    if (!transcript.utterances || transcript.utterances.length === 0) {
      return transcript.text || "No transcript available";
    }
    
    const formattedLines: string[] = [];
    
    for (const utterance of transcript.utterances) {
      // Convert milliseconds to time format
      const startMs = utterance.start;
      const totalSeconds = Math.floor(startMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      let timestamp: string;
      if (hours > 0) {
        timestamp = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      
      const speaker = `Speaker ${utterance.speaker}`;
      formattedLines.push(`[${timestamp}] ${speaker}: ${utterance.text}`);
    }
    
    return formattedLines.join('\n');
  }

  /**
   * Get audio files that need transcription
   */
  async getAudioFilesForTranscription(audioDir: string, transcriptsDir: string): Promise<TranscriptionFile[]> {
    const audioFiles: TranscriptionFile[] = [];
    const rawTranscriptsDir = path.join(transcriptsDir, 'raw');
    
    // Create directories if they don't exist
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    if (!fs.existsSync(rawTranscriptsDir)) {
      fs.mkdirSync(rawTranscriptsDir, { recursive: true });
    }
    
    // Get all WAV files
    const files = fs.readdirSync(audioDir).filter(f => f.endsWith('.wav'));
    
    for (const filename of files) {
      // Extract broker_id and call_id from filename
      const parts = filename.replace('.wav', '').split('_');
      if (parts.length >= 2) {
        const brokerId = parts[0];
        const callId = parts.slice(1).join('_');
        
        const transcriptFile = path.join(transcriptsDir, `${brokerId}_${callId}.txt`);
        const rawTranscriptFile = path.join(rawTranscriptsDir, `${brokerId}_${callId}.json`);
        
        // Check if already transcribed
        if (!fs.existsSync(transcriptFile)) {
          audioFiles.push({
            filepath: path.join(audioDir, filename),
            filename: filename,
            broker_id: brokerId,
            call_id: callId,
            transcriptFile: transcriptFile,
            rawTranscriptFile: rawTranscriptFile,
          });
        }
      }
    }
    
    return audioFiles;
  }

  /**
   * Process batch of files with concurrency control
   */
  async transcribeBatch(
    files: TranscriptionFile[], 
    concurrentLimit: number = 3,
    onProgress?: (completed: number, total: number, current: string) => void
  ): Promise<Array<{file: string; success: boolean; error?: string}>> {
    const results: Array<{file: string; success: boolean; error?: string}> = [];
    let completed = 0;
    
    // Process files in batches
    for (let i = 0; i < files.length; i += concurrentLimit) {
      const batch = files.slice(i, i + concurrentLimit);
      
      const batchPromises = batch.map(async (fileInfo) => {
        try {
          const result = await this.transcribeFile(fileInfo);
          completed++;
          if (onProgress) {
            onProgress(completed, files.length, fileInfo.filename);
          }
          return {
            file: fileInfo.filename,
            success: result.status === 'completed',
            error: result.error,
          };
        } catch (error) {
          completed++;
          if (onProgress) {
            onProgress(completed, files.length, fileInfo.filename);
          }
          return {
            file: fileInfo.filename,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
}