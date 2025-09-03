import { POST, GET } from '../route';
import { NextRequest } from 'next/server';
import { AssemblyAIService } from '@/lib/services/assemblyai';
import { getAssemblyAIKey } from '@/lib/config/env-validation';
import fs from 'fs';

// Mock dependencies
jest.mock('@/lib/services/assemblyai');
jest.mock('@/lib/config/env-validation');
jest.mock('fs');

describe('Stage 3 API Route - POST', () => {
  const mockAssemblyAIService = AssemblyAIService as jest.MockedClass<typeof AssemblyAIService>;
  const mockGetAssemblyAIKey = getAssemblyAIKey as jest.MockedFunction<typeof getAssemblyAIKey>;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
  });

  const createRequest = (body: any): NextRequest => {
    return {
      json: async () => body,
    } as NextRequest;
  };

  describe('API Key Validation', () => {
    it('should use API key from request body when provided', async () => {
      const mockTranscribeBatch = jest.fn().mockResolvedValue([
        { file: 'test.wav', success: true }
      ]);

      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'user_provided_key',
        audioFiles: [{ filename: '800_test.wav' }],
        concurrentLimit: 2,
      });

      await POST(request);

      expect(mockAssemblyAIService).toHaveBeenCalledWith('user_provided_key');
      expect(mockGetAssemblyAIKey).not.toHaveBeenCalled();
    });

    it('should use environment variable when API key not in request', async () => {
      mockGetAssemblyAIKey.mockReturnValue('env_api_key');
      
      const mockTranscribeBatch = jest.fn().mockResolvedValue([]);
      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        audioFiles: [{ filename: '800_test.wav' }],
      });

      await POST(request);

      expect(mockGetAssemblyAIKey).toHaveBeenCalled();
      expect(mockAssemblyAIService).toHaveBeenCalledWith('env_api_key');
    });

    it('should return error when no API key available', async () => {
      mockGetAssemblyAIKey.mockImplementation(() => {
        throw new Error('Missing ASSEMBLYAI_API_KEY environment variable');
      });

      const request = createRequest({
        audioFiles: [{ filename: 'test.wav' }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('API Configuration Error');
      expect(data.required).toEqual(['ASSEMBLYAI_API_KEY']);
      expect(data.stage).toBe('Stage 3 - Transcribe Audio');
    });
  });

  describe('Audio Files Validation', () => {
    it('should return error when no audio files provided', async () => {
      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: [],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No audio files provided for transcription');
    });

    it('should return error when audioFiles is missing', async () => {
      const request = createRequest({
        apiKey: 'test_key',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No audio files provided for transcription');
    });
  });

  describe('Transcription Processing', () => {
    const mockAudioFiles = [
      { filename: '800_call123.wav', broker_id: '800', call_id: 'call123' },
      { filename: '715_call456.wav', broker_id: '715', call_id: 'call456' },
    ];

    it('should process transcriptions successfully', async () => {
      mockFs.existsSync.mockReturnValue(false); // No existing transcripts

      const mockResults = [
        { file: '800_call123.wav', success: true },
        { file: '715_call456.wav', success: true },
      ];

      const mockTranscribeBatch = jest.fn().mockResolvedValue(mockResults);
      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: mockAudioFiles,
        concurrentLimit: 3,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Transcription completed');
      expect(data.totalFiles).toBe(2);
      expect(data.transcribedFiles).toBe(2);
      expect(data.successful).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.results).toEqual(mockResults);
      
      // Verify transcripts structure
      expect(data.transcripts).toHaveLength(2);
      expect(data.transcripts[0]).toEqual(expect.objectContaining({
        call_id: 'call123',
        broker_id: '800',
        filename: '800_call123.wav',
      }));
    });

    it('should skip already transcribed files', async () => {
      // Mock that first file already has transcript
      mockFs.existsSync.mockImplementation((path) => {
        return path.toString().includes('800_call123.txt');
      });

      const mockTranscribeBatch = jest.fn().mockResolvedValue([
        { file: '715_call456.wav', success: true },
      ]);

      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: mockAudioFiles,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.totalFiles).toBe(2);
      expect(data.transcribedFiles).toBe(1);
      expect(data.alreadyTranscribed).toBe(1);
      
      // Verify only one file was sent for transcription
      expect(mockTranscribeBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ filename: '715_call456.wav' })
        ]),
        3,
        expect.any(Function)
      );
    });

    it('should handle all files already transcribed', async () => {
      mockFs.existsSync.mockReturnValue(true); // All files exist

      const mockTranscribeBatch = jest.fn();
      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: mockAudioFiles,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.message).toBe('All files already transcribed');
      expect(data.pendingFiles).toBe(0);
      expect(mockTranscribeBatch).not.toHaveBeenCalled();
    });

    it('should handle mixed success and failure results', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const mockResults = [
        { file: '800_call123.wav', success: true },
        { file: '715_call456.wav', success: false, error: 'Transcription failed' },
      ];

      const mockTranscribeBatch = jest.fn().mockResolvedValue(mockResults);
      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: mockAudioFiles,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.successful).toBe(1);
      expect(data.failed).toBe(1);
      expect(data.results).toEqual(mockResults);
    });

    it('should track progress with callback', async () => {
      mockFs.existsSync.mockReturnValue(false);

      let progressCallback: Function | undefined;
      const mockTranscribeBatch = jest.fn().mockImplementation(
        async (files, limit, onProgress) => {
          progressCallback = onProgress;
          // Simulate progress updates
          onProgress(1, 2, '800_call123.wav');
          onProgress(2, 2, '715_call456.wav');
          return [
            { file: '800_call123.wav', success: true },
            { file: '715_call456.wav', success: true },
          ];
        }
      );

      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: mockAudioFiles,
        concurrentLimit: 2,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.sessionId).toBeDefined();
      expect(progressCallback).toBeDefined();
      expect(mockTranscribeBatch).toHaveBeenCalledWith(
        expect.any(Array),
        2,
        expect.any(Function)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const mockTranscribeBatch = jest.fn().mockRejectedValue(
        new Error('AssemblyAI service error')
      );

      mockAssemblyAIService.mockImplementation(() => ({
        transcribeBatch: mockTranscribeBatch,
      } as any));

      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: [{ filename: 'test.wav' }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Transcription failed: AssemblyAI service error');
    });

    it('should handle unexpected errors', async () => {
      const request = createRequest({
        apiKey: 'test_key',
        audioFiles: 'invalid', // Invalid format
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });
});