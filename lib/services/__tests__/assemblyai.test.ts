import { AssemblyAIService } from '../assemblyai';
import { TranscriptionFile, TranscriptionResult } from '@/lib/types/pipeline';
import fs from 'fs';
import path from 'path';

// Mock fs module
jest.mock('fs');

// Mock fetch globally
global.fetch = jest.fn();

describe('AssemblyAIService', () => {
  let service: AssemblyAIService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const testApiKey = 'test_assemblyai_api_key';

  // Realistic AssemblyAI API responses
  const mockUploadResponse = {
    upload_url: 'https://cdn.assemblyai.com/upload/ccbbbfaf-f319-4455-9556-272d48faaf7f'
  };

  const mockTranscriptionCreateResponse = {
    id: 'rx7v7v8v-8c4b-4d3e-9c5c-8f8f8f8f8f8f',
    status: 'queued',
    acoustic_model: 'assemblyai_default',
    language_model: 'assemblyai_default',
    language_code: 'en_us',
    audio_url: 'https://cdn.assemblyai.com/upload/ccbbbfaf-f319-4455-9556-272d48faaf7f',
    speaker_labels: true,
  };

  const mockCompletedTranscription: TranscriptionResult = {
    id: 'rx7v7v8v-8c4b-4d3e-9c5c-8f8f8f8f8f8f',
    status: 'completed',
    text: 'Hello, this is a test transcription. Speaker two here.',
    audio_duration: 12.5,
    confidence: 0.956,
    language_code: 'en_us',
    created: '2025-01-03T10:00:00.000Z',
    utterances: [
      {
        start: 0,
        end: 3500,
        text: 'Hello, this is a test transcription.',
        speaker: 'A',
        confidence: 0.98,
        words: []
      },
      {
        start: 3700,
        end: 5200,
        text: 'Speaker two here.',
        speaker: 'B',
        confidence: 0.92,
        words: []
      }
    ],
    words: [
      { text: 'Hello', start: 0, end: 500, confidence: 0.99, speaker: 'A' },
      { text: 'this', start: 600, end: 800, confidence: 0.98, speaker: 'A' },
    ],
  };

  const mockErrorTranscription: TranscriptionResult = {
    id: 'rx7v7v8v-8c4b-4d3e-9c5c-8f8f8f8f8f8f',
    status: 'error',
    error: 'Audio file could not be decoded',
    text: null,
    utterances: null,
    words: null,
    audio_duration: null,
    confidence: null,
    language_code: 'en_us',
    created: '2025-01-03T10:00:00.000Z',
  };

  beforeEach(() => {
    service = new AssemblyAIService(testApiKey);
    jest.clearAllMocks();
    
    // Default fs mocks
    mockFs.readFileSync.mockReturnValue(Buffer.from('test audio data'));
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.readdirSync.mockReturnValue([]);
  });

  describe('uploadAudio', () => {
    it('should successfully upload audio file', async () => {
      const testFilePath = '/path/to/audio.wav';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUploadResponse,
      } as Response);

      const uploadUrl = await service.uploadAudio(testFilePath);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(testFilePath);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.assemblyai.com/v2/upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'authorization': testApiKey,
            'content-type': 'application/octet-stream',
          },
          body: expect.any(Buffer),
        })
      );
      expect(uploadUrl).toBe(mockUploadResponse.upload_url);
    });

    it('should throw error when upload fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      } as Response);

      await expect(service.uploadAudio('/path/to/audio.wav')).rejects.toThrow(
        'Failed to upload audio: Bad Request'
      );
    });

    it('should handle file read errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(service.uploadAudio('/nonexistent.wav')).rejects.toThrow('File not found');
    });
  });

  describe('createTranscription', () => {
    const audioUrl = 'https://cdn.assemblyai.com/upload/test-audio';
    const config = {
      speech_model: 'best' as const,
      speaker_labels: true,
      language_code: 'en_us',
    };

    it('should create transcription job with config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTranscriptionCreateResponse,
      } as Response);

      const transcriptId = await service.createTranscription(audioUrl, config);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.assemblyai.com/v2/transcript',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'authorization': testApiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            audio_url: audioUrl,
            ...config,
          }),
        })
      );
      expect(transcriptId).toBe(mockTranscriptionCreateResponse.id);
    });

    it('should throw error when transcription creation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(service.createTranscription(audioUrl, config)).rejects.toThrow(
        'Failed to create transcription: Unauthorized'
      );
    });
  });

  describe('getTranscriptionStatus', () => {
    const transcriptId = 'rx7v7v8v-8c4b-4d3e-9c5c-8f8f8f8f8f8f';

    it('should get transcription status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCompletedTranscription,
      } as Response);

      const result = await service.getTranscriptionStatus(transcriptId);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        expect.objectContaining({
          headers: {
            'authorization': testApiKey,
          },
        })
      );
      expect(result).toEqual(mockCompletedTranscription);
    });

    it('should handle error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockErrorTranscription,
      } as Response);

      const result = await service.getTranscriptionStatus(transcriptId);
      expect(result.status).toBe('error');
      expect(result.error).toBe('Audio file could not be decoded');
    });
  });

  describe('waitForTranscription', () => {
    const transcriptId = 'rx7v7v8v-8c4b-4d3e-9c5c-8f8f8f8f8f8f';

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should poll until transcription completes', async () => {
      const queuedResponse = { ...mockTranscriptionCreateResponse, status: 'queued' };
      const processingResponse = { ...mockTranscriptionCreateResponse, status: 'processing' };
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => queuedResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => processingResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCompletedTranscription,
        } as Response);

      const waitPromise = service.waitForTranscription(transcriptId);

      // Advance timers for polling
      await jest.runOnlyPendingTimersAsync();
      await jest.runOnlyPendingTimersAsync();

      const result = await waitPromise;
      expect(result).toEqual(mockCompletedTranscription);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should timeout after max wait time', async () => {
      const processingResponse = { ...mockTranscriptionCreateResponse, status: 'processing' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => processingResponse,
      } as Response);

      const waitPromise = service.waitForTranscription(transcriptId, 5000);

      // Advance past timeout
      await jest.advanceTimersByTimeAsync(6000);

      await expect(waitPromise).rejects.toThrow('Transcription timeout');
    });

    it('should return immediately on error status', async () => {
      const errorTranscript = { ...mockCompletedTranscription, status: 'error' as const, error: 'Test error' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => errorTranscript,
      } as Response);

      const result = await service.waitForTranscription(transcriptId);
      expect(result.status).toBe('error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatTranscript', () => {
    it('should format transcript with speaker labels and timestamps', () => {
      const formatted = service.formatTranscript(mockCompletedTranscription);
      
      expect(formatted).toContain('[0:00] Speaker A: Hello, this is a test transcription.');
      expect(formatted).toContain('[0:03] Speaker B: Speaker two here.');
    });

    it('should handle transcripts without utterances', () => {
      const transcriptNoUtterances = {
        ...mockCompletedTranscription,
        utterances: null,
        text: 'Simple text without speaker labels',
      };

      const formatted = service.formatTranscript(transcriptNoUtterances);
      expect(formatted).toBe('Simple text without speaker labels');
    });

    it('should handle long timestamps with hours', () => {
      const longTranscript = {
        ...mockCompletedTranscription,
        utterances: [
          {
            start: 3661000, // 1 hour, 1 minute, 1 second
            end: 3665000,
            text: 'Long recording test',
            speaker: 'A',
            confidence: 0.95,
            words: []
          }
        ]
      };

      const formatted = service.formatTranscript(longTranscript);
      expect(formatted).toContain('[1:01:01] Speaker A: Long recording test');
    });
  });
});