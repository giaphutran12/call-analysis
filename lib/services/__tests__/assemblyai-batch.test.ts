import { AssemblyAIService } from '../assemblyai';
import { TranscriptionFile } from '@/lib/types/pipeline';
import fs from 'fs';
import path from 'path';

// Mock fs module
jest.mock('fs');

// Mock fetch globally
global.fetch = jest.fn();

describe('AssemblyAIService - Batch Processing', () => {
  let service: AssemblyAIService;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const testApiKey = 'test_assemblyai_api_key';

  const mockCompletedTranscription = {
    id: 'test-transcript-id',
    status: 'completed' as const,
    text: 'Test transcription text',
    audio_duration: 30.5,
    confidence: 0.95,
    language_code: 'en_us',
    created: '2025-01-03T10:00:00.000Z',
    utterances: [
      {
        start: 0,
        end: 2000,
        text: 'Test utterance',
        speaker: 'A',
        confidence: 0.95,
        words: []
      }
    ],
    words: null,
    error: null,
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

  describe('transcribeFile', () => {
    const testFile: TranscriptionFile = {
      filepath: '/audio/800_test123.wav',
      filename: '800_test123.wav',
      broker_id: '800',
      call_id: 'test123',
      transcriptFile: '/transcripts/800_test123.txt',
      rawTranscriptFile: '/transcripts/raw/800_test123.json',
    };

    it('should complete full transcription workflow', async () => {
      // Mock the entire workflow
      jest.spyOn(service, 'uploadAudio').mockResolvedValue('https://cdn.assemblyai.com/upload/test');
      jest.spyOn(service, 'createTranscription').mockResolvedValue('transcript-id');
      jest.spyOn(service, 'waitForTranscription').mockResolvedValue(mockCompletedTranscription);

      const result = await service.transcribeFile(testFile);

      expect(service.uploadAudio).toHaveBeenCalledWith(testFile.filepath);
      expect(service.createTranscription).toHaveBeenCalledWith(
        'https://cdn.assemblyai.com/upload/test',
        expect.objectContaining({
          speech_model: 'best',
          speaker_labels: true,
          language_code: 'en_us',
        })
      );
      expect(service.waitForTranscription).toHaveBeenCalledWith('transcript-id');
      
      // Verify files were written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testFile.transcriptFile,
        expect.stringContaining('[0:00] Speaker A: Test utterance'),
        'utf-8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testFile.rawTranscriptFile,
        expect.stringContaining('"id": "test-transcript-id"'),
        'utf-8'
      );
      
      expect(result).toEqual(mockCompletedTranscription);
    });

    it('should handle transcription errors', async () => {
      const errorTranscription = {
        ...mockCompletedTranscription,
        status: 'error' as const,
        error: 'Audio quality too poor',
        text: null,
        utterances: null,
      };

      jest.spyOn(service, 'uploadAudio').mockResolvedValue('https://cdn.assemblyai.com/upload/test');
      jest.spyOn(service, 'createTranscription').mockResolvedValue('transcript-id');
      jest.spyOn(service, 'waitForTranscription').mockResolvedValue(errorTranscription);
      jest.spyOn(service, 'formatTranscript').mockReturnValue('Error: Audio quality too poor');

      const result = await service.transcribeFile(testFile);

      // Files should still be written even with error
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2); // Both formatted and raw files
      expect(result.status).toBe('error');
    });

    it('should wrap and throw upload errors', async () => {
      jest.spyOn(service, 'uploadAudio').mockRejectedValue(new Error('Network error'));

      await expect(service.transcribeFile(testFile)).rejects.toThrow(
        'Transcription failed: Network error'
      );
    });
  });

  describe('getAudioFilesForTranscription', () => {
    const audioDir = '/output/audio';
    const transcriptsDir = '/output/transcripts';

    it('should get list of audio files needing transcription', async () => {
      mockFs.readdirSync.mockReturnValue([
        '800_call123.wav',
        '715_call456.wav',
        '502_call789.wav',
        'invalid.txt', // Should be ignored
      ] as any);

      // Mock that first file already has transcript
      mockFs.existsSync.mockImplementation((path) => {
        if (path.toString().includes('800_call123.txt')) return true;
        return false;
      });

      const files = await service.getAudioFilesForTranscription(audioDir, transcriptsDir);

      expect(files).toHaveLength(2); // Only 2 WAV files without transcripts
      expect(files[0]).toEqual(expect.objectContaining({
        filename: '715_call456.wav',
        broker_id: '715',
        call_id: 'call456',
        filepath: path.join(audioDir, '715_call456.wav'),
        transcriptFile: path.join(transcriptsDir, '715_call456.txt'),
      }));
      expect(files[1]).toEqual(expect.objectContaining({
        filename: '502_call789.wav',
        broker_id: '502',
        call_id: 'call789',
      }));
    });

    it('should create directories if they do not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      await service.getAudioFilesForTranscription(audioDir, transcriptsDir);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(transcriptsDir, { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.join(transcriptsDir, 'raw'),
        { recursive: true }
      );
    });

    it('should handle complex call IDs with underscores', async () => {
      mockFs.readdirSync.mockReturnValue(['800_complex_call_id_123.wav'] as any);
      mockFs.existsSync.mockImplementation((path) => {
        if (path.toString().includes('transcripts')) return false;
        return true;
      });

      const files = await service.getAudioFilesForTranscription(audioDir, transcriptsDir);

      expect(files[0]).toEqual(expect.objectContaining({
        broker_id: '800',
        call_id: 'complex_call_id_123',
      }));
    });
  });

  describe('transcribeBatch', () => {
    const testFiles: TranscriptionFile[] = [
      {
        filepath: '/audio/800_call1.wav',
        filename: '800_call1.wav',
        broker_id: '800',
        call_id: 'call1',
        transcriptFile: '/transcripts/800_call1.txt',
        rawTranscriptFile: '/transcripts/raw/800_call1.json',
      },
      {
        filepath: '/audio/715_call2.wav',
        filename: '715_call2.wav',
        broker_id: '715',
        call_id: 'call2',
        transcriptFile: '/transcripts/715_call2.txt',
        rawTranscriptFile: '/transcripts/raw/715_call2.json',
      },
      {
        filepath: '/audio/502_call3.wav',
        filename: '502_call3.wav',
        broker_id: '502',
        call_id: 'call3',
        transcriptFile: '/transcripts/502_call3.txt',
        rawTranscriptFile: '/transcripts/raw/502_call3.json',
      },
    ];

    it('should process files with concurrency limit', async () => {
      jest.spyOn(service, 'transcribeFile').mockResolvedValue(mockCompletedTranscription);

      const progressUpdates: Array<{ completed: number; total: number; current: string }> = [];
      const onProgress = (completed: number, total: number, current: string) => {
        progressUpdates.push({ completed, total, current });
      };

      const results = await service.transcribeBatch(testFiles, 2, onProgress);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify progress callbacks
      expect(progressUpdates).toHaveLength(3);
      expect(progressUpdates[0]).toEqual({
        completed: 1,
        total: 3,
        current: '800_call1.wav',
      });
      expect(progressUpdates[2]).toEqual({
        completed: 3,
        total: 3,
        current: '502_call3.wav',
      });

      // Verify concurrency - should be called 3 times total
      expect(service.transcribeFile).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure', async () => {
      jest.spyOn(service, 'transcribeFile')
        .mockResolvedValueOnce(mockCompletedTranscription)
        .mockRejectedValueOnce(new Error('Transcription failed'))
        .mockResolvedValueOnce(mockCompletedTranscription);

      const results = await service.transcribeBatch(testFiles, 3);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Transcription failed');
      expect(results[2].success).toBe(true);
    });

    it('should process in batches according to concurrency limit', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      jest.spyOn(service, 'transcribeFile').mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentCalls--;
        return mockCompletedTranscription;
      });

      await service.transcribeBatch(testFiles, 2);

      // With concurrency limit of 2, max concurrent should never exceed 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(service.transcribeFile).toHaveBeenCalledTimes(3);
    });

    it('should handle empty file array', async () => {
      const results = await service.transcribeBatch([], 3);
      expect(results).toEqual([]);
    });

    it('should handle single file', async () => {
      jest.spyOn(service, 'transcribeFile').mockResolvedValue(mockCompletedTranscription);

      const results = await service.transcribeBatch([testFiles[0]], 3);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });
});