import { POST } from '../route';
import { NextRequest } from 'next/server';
import { SupabaseUploadService } from '@/lib/services/supabase-upload';
import { getSupabaseConfig } from '@/lib/config/env-validation';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('@/lib/services/supabase-upload');
jest.mock('@/lib/config/env-validation');
jest.mock('fs');

describe('Stage 4 API Route - Upload Audio to Supabase', () => {
  const mockSupabaseUploadService = SupabaseUploadService as jest.MockedClass<typeof SupabaseUploadService>;
  const mockGetSupabaseConfig = getSupabaseConfig as jest.MockedFunction<typeof getSupabaseConfig>;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(Buffer.from('test audio data'));
  });

  const createRequest = (body: any): NextRequest => {
    return {
      json: async () => body,
    } as NextRequest;
  };

  describe('Configuration Validation', () => {
    it('should use Supabase credentials from request body when provided', async () => {
      const mockProcessUpload = jest.fn().mockResolvedValue({
        success: true,
        call_id: 'test123',
        audio_url: 'https://storage.url/audio.wav',
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        processAudioUpload: mockProcessUpload,
        uploadBatch: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://custom.supabase.co',
        supabaseKey: 'custom-key',
        audioFiles: [{
          filepath: '/audio/800_test.wav',
          filename: '800_test.wav',
          call_id: 'test123',
          broker_id: '800',
        }],
        transcripts: [],
      });

      await POST(request);

      expect(mockSupabaseUploadService).toHaveBeenCalledWith({
        url: 'https://custom.supabase.co',
        anonKey: 'custom-key',
        bucketName: 'audio-files',
      });
      expect(mockGetSupabaseConfig).not.toHaveBeenCalled();
    });

    it('should use environment variables when credentials not in request', async () => {
      mockGetSupabaseConfig.mockReturnValue({
        url: 'https://env.supabase.co',
        anonKey: 'env-key',
      });

      const mockProcessUpload = jest.fn().mockResolvedValue({
        success: true,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        processAudioUpload: mockProcessUpload,
        uploadBatch: jest.fn(),
      } as any));

      const request = createRequest({
        audioFiles: [{
          filepath: '/audio/800_test.wav',
          filename: '800_test.wav',
          call_id: 'test123',
          broker_id: '800',
        }],
      });

      await POST(request);

      expect(mockGetSupabaseConfig).toHaveBeenCalled();
      expect(mockSupabaseUploadService).toHaveBeenCalledWith({
        url: 'https://env.supabase.co',
        anonKey: 'env-key',
        bucketName: 'audio-files',
      });
    });

    it('should return error when no Supabase config available', async () => {
      mockGetSupabaseConfig.mockImplementation(() => {
        throw new Error('Missing Supabase configuration: SUPABASE_DATABASE_KEY, ANON_PUBLIC_API_KEY_SUPABASE');
      });

      const request = createRequest({
        audioFiles: [{ filename: 'test.wav' }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('API Configuration Error');
      expect(data.required).toEqual(['SUPABASE_DATABASE_KEY', 'ANON_PUBLIC_API_KEY_SUPABASE']);
      expect(data.stage).toBe('Stage 4 - Upload Audio');
    });
  });

  describe('Input Validation', () => {
    it('should return error when no audio files provided', async () => {
      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No audio files provided for upload');
    });

    it('should return error when audioFiles is missing', async () => {
      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No audio files provided for upload');
    });
  });

  describe('Audio Upload Processing', () => {
    const mockAudioFiles = [
      {
        filepath: '/output/audio/800_call123.wav',
        filename: '800_call123.wav',
        call_id: 'call123',
        broker_id: '800',
        size: 1024000,
      },
      {
        filepath: '/output/audio/715_call456.wav',
        filename: '715_call456.wav',
        call_id: 'call456',
        broker_id: '715',
        size: 2048000,
      },
    ];

    const mockTranscripts = [
      {
        call_id: 'call123',
        transcriptPath: '/output/transcripts/800_call123.txt',
      },
      {
        call_id: 'call456',
        transcriptPath: '/output/transcripts/715_call456.txt',
      },
    ];

    it('should process uploads successfully with transcripts', async () => {
      mockFs.readFileSync.mockImplementation((filepath) => {
        if (filepath.toString().includes('.txt')) {
          return Buffer.from('Test transcript content');
        }
        return Buffer.from('audio data');
      });

      const mockResults = [
        {
          success: true,
          call_id: 'call123',
          broker_id: '800',
          audio_url: 'https://storage.url/audio/800_call123.wav',
          database_record_id: 'db-id-1',
        },
        {
          success: true,
          call_id: 'call456',
          broker_id: '715',
          audio_url: 'https://storage.url/audio/715_call456.wav',
          database_record_id: 'db-id-2',
        },
      ];

      const mockUploadBatch = jest.fn().mockResolvedValue({
        results: mockResults,
        successful: 2,
        failed: 0,
        skipped: 0,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: mockAudioFiles,
        transcripts: mockTranscripts,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Audio upload completed');
      expect(data.totalFiles).toBe(2);
      expect(data.successful).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.results).toEqual(mockResults);
      
      // Verify transcripts were read and passed
      expect(mockUploadBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            call_id: 'call123',
            transcript: 'Test transcript content',
          }),
        ])
      );
    });

    it('should handle mixed success and failure', async () => {
      const mockResults = [
        {
          success: true,
          call_id: 'call123',
          broker_id: '800',
          audio_url: 'https://storage.url/audio/800_call123.wav',
        },
        {
          success: false,
          call_id: 'call456',
          broker_id: '715',
          error: 'Database update failed',
        },
      ];

      const mockUploadBatch = jest.fn().mockResolvedValue({
        results: mockResults,
        successful: 1,
        failed: 1,
        skipped: 0,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: mockAudioFiles,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.successful).toBe(1);
      expect(data.failed).toBe(1);
      expect(data.results[1].error).toBe('Database update failed');
    });

    it('should handle duplicate detection', async () => {
      const mockResults = [
        {
          success: true,
          call_id: 'call123',
          broker_id: '800',
          audio_url: 'https://storage.url/audio/800_call123.wav',
          skipped: true,
        },
      ];

      const mockUploadBatch = jest.fn().mockResolvedValue({
        results: mockResults,
        successful: 0,
        failed: 0,
        skipped: 1,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [mockAudioFiles[0]],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.skipped).toBe(1);
      expect(data.results[0].skipped).toBe(true);
    });

    it('should pass data for Stage 5', async () => {
      const mockResults = [
        {
          success: true,
          call_id: 'call123',
          broker_id: '800',
          audio_url: 'https://storage.url/audio/800_call123.wav',
          database_record_id: 'db-123',
        },
      ];

      const mockUploadBatch = jest.fn().mockResolvedValue({
        results: mockResults,
        successful: 1,
        failed: 0,
        skipped: 0,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [mockAudioFiles[0]],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.dataForStage5).toBeDefined();
      expect(data.dataForStage5).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            call_id: 'call123',
            audio_url: 'https://storage.url/audio/800_call123.wav',
            database_record_id: 'db-123',
          }),
        ])
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const mockUploadBatch = jest.fn().mockRejectedValue(
        new Error('Supabase connection failed')
      );

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [{
          filename: 'test.wav',
          call_id: 'test',
          broker_id: '800',
        }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Upload failed: Supabase connection failed');
    });

    it('should handle file read errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const mockUploadBatch = jest.fn();
      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [{
          filepath: '/invalid/path.wav',
          filename: 'test.wav',
          call_id: 'test',
          broker_id: '800',
        }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('File not found');
    });
  });

  describe('Progress Tracking', () => {
    it('should generate session ID for progress tracking', async () => {
      const mockUploadBatch = jest.fn().mockResolvedValue({
        results: [],
        successful: 0,
        failed: 0,
        skipped: 0,
      });

      mockSupabaseUploadService.mockImplementation(() => ({
        uploadBatch: mockUploadBatch,
        processAudioUpload: jest.fn(),
      } as any));

      const request = createRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        audioFiles: [{
          filename: 'test.wav',
          call_id: 'test',
          broker_id: '800',
        }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.sessionId).toBeDefined();
      expect(typeof data.sessionId).toBe('string');
    });
  });
});