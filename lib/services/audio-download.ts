import { RecordingInfo, DownloadResult, CallRecord } from '@/lib/types/pipeline';
import fs from 'fs';
import path from 'path';

export class AudioDownloadService {
  private accessToken: string | null = null;
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    baseUrl?: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl || 'https://integrate.versature.com';
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if available
    if (this.accessToken) {
      return this.accessToken;
    }
    
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      return data.access_token;
    } catch (error) {
      throw new Error(`Failed to get access token: ${error}`);
    }
  }

  async getRecordingInfo(callId: string): Promise<RecordingInfo> {
    if (!this.accessToken) {
      this.accessToken = await this.getAccessToken();
    }

    const url = `${this.baseUrl}/api/recordings/call_ids/${callId}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.integrate.v1.4.0+json',
          'Authorization': `Bearer ${this.accessToken}`
        },
      });

      if (response.status === 401) {
        // Token expired, refresh and retry
        this.accessToken = null;  // Clear the cached token
        this.accessToken = await this.getAccessToken();
        return this.getRecordingInfo(callId);
      }

      if (!response.ok) {
        return {
          status: 'NotFound',
          call_id: callId
        };
      }

      const data = await response.json();
      
      // Check if recordings array exists and has data
      if (!data.recordings || data.recordings.length === 0) {
        return {
          status: 'NotFound',
          call_id: callId
        };
      }
      
      const recording = data.recordings[0];
      return {
        status: recording.status || 'Available',
        url: recording.url,
        call_id: callId,
        duration: recording.duration,
        file_size: recording.file_size
      };
    } catch (error) {
      return {
        status: 'Failed',
        call_id: callId
      };
    }
  }

  async downloadAudio(
    call: CallRecord,
    outputDir: string,
    onProgress?: (progress: number) => void
  ): Promise<DownloadResult | null> {
    try {
      // Get recording info first
      const recordingInfo = await this.getRecordingInfo(call.call_id);
      
      if (recordingInfo.status !== 'Available' || !recordingInfo.url) {
        console.warn(`Recording not available for call ${call.call_id}`);
        return null;
      }

      // Download the audio file
      const response = await fetch(recordingInfo.url);
      
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      // Get the content length for progress tracking
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      // Create filename using first 3 chars of broker_id with sanitization
      const safeBrokerId = this.sanitizeSegment(call.broker_id).slice(0, 3) || 'unk';
      const safeCallId = this.sanitizeSegment(call.call_id) || 'unknown';
      const filename = `${safeBrokerId}_${safeCallId}.wav`;
      const filePath = path.join(outputDir, filename);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Download with progress tracking
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        if (onProgress && total > 0) {
          onProgress((receivedLength / total) * 100);
        }
      }

      // Combine chunks and write to file
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(filePath, buffer);

      // Verify file was created
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        fs.unlinkSync(filePath);
        throw new Error('Downloaded file is empty');
      }

      return {
        filePath,
        filename,
        size: stats.size,
        call_id: call.call_id,
        broker_id: call.broker_id
      };

    } catch (error) {
      console.error(`Failed to download audio for call ${call.call_id}:`, error);
      return null;
    }
  }

  async downloadBatch(
    calls: CallRecord[],
    outputDir: string,
    options?: {
      batchSize?: number;
      batchDelay?: number;
      onProgress?: (current: number, total: number, currentCall: CallRecord) => void;
      onCallProgress?: (callId: string, progress: number) => void;
    },
    onProgress?: (current: number, total: number) => void
  ): Promise<{
    successful: DownloadResult[];
    failed: { call_id: string; error: string }[];
  }> {
    const successful: DownloadResult[] = [];
    const failed: { call_id: string; error: string }[] = [];
    const batchSize = options?.batchSize || 4;
    const batchDelay = options?.batchDelay || 1000;

    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, Math.min(i + batchSize, calls.length));
      
      // Process batch in parallel
      const batchPromises = batch.map(async (call) => {
        if (onProgress) {
          onProgress(successful.length + failed.length + 1, calls.length);
        }
        if (options?.onProgress) {
          options.onProgress(
            successful.length + failed.length + 1,
            calls.length,
            call
          );
        }

        try {
          const result = await this.downloadAudio(
            call,
            outputDir,
            options?.onCallProgress ? (progress) => options.onCallProgress(call.call_id, progress) : undefined
          );
          
          if (result) {
            successful.push(result);
          } else {
            failed.push({ call_id: call.call_id, error: 'Download failed' });
          }
        } catch (error) {
          failed.push({ 
            call_id: call.call_id, 
            error: error instanceof Error ? error.message : 'Download failed' 
          });
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches
      if (i + batchSize < calls.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    return { successful, failed };
  }

  filterCallsForDownload(calls: CallRecord[], minDuration: number = 15): {
    eligible: CallRecord[];
    skippedTooShort: number;
    skippedNoRecording: number;
    skippedNoCallId: number;
  } {
    const eligible: CallRecord[] = [];
    let skippedTooShort = 0;
    let skippedNoRecording = 0;
    let skippedNoCallId = 0;

    calls.forEach(call => {
      // Must have call_id
      if (!call.call_id) {
        skippedNoCallId++;
        return;
      }
      
      // Must meet minimum duration
      if (call.duration < minDuration) {
        skippedTooShort++;
        return;
      }
      
      // Must have recording URL
      if (!call.recording_url || !call.recording_url.trim()) {
        skippedNoRecording++;
        return;
      }
      
      eligible.push(call);
    });

    return {
      eligible,
      skippedTooShort,
      skippedNoRecording,
      skippedNoCallId
    };
  }

  /**
   * Sanitize filename segments to prevent path traversal and invalid characters
   */
  private sanitizeSegment(input: string): string {
    if (!input) return '';
    
    // Remove any path traversal attempts and dangerous characters
    return input
      .replace(/\.\./g, '')           // Remove ..
      .replace(/[\/\\]/g, '_')         // Replace path separators with _
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Keep only alphanumeric, dots, underscores, hyphens
      .replace(/^\.+/, '')             // Remove leading dots
      .substring(0, 100);              // Limit length to prevent overly long filenames
  }
}