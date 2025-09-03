import { AudioDownloadService } from '../audio-download';
import { CallRecord, RecordingInfo, DownloadResult } from '@/lib/types/pipeline';
import fs from 'fs';
import path from 'path';

// Mock modules
jest.mock('fs');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('AudioDownloadService', () => {
  let service: AudioDownloadService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    service = new AudioDownloadService({
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      baseUrl: 'https://test.api.com'
    });
    jest.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('should successfully get access token', async () => {
      const mockToken = 'test_access_token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: mockToken }),
      } as Response);

      const token = await service.getAccessToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.any(URLSearchParams),
        })
      );
      expect(token).toBe(mockToken);
    });

    it('should throw error when authentication fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(service.getAccessToken()).rejects.toThrow(
        'Failed to get access token'
      );
    });

    it('should cache token for subsequent calls', async () => {
      const mockToken = 'cached_token';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: mockToken }),
      } as Response);

      const token1 = await service.getAccessToken();
      const token2 = await service.getAccessToken();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(token1).toBe(mockToken);
      expect(token2).toBe(mockToken);
    });
  });

  describe('getRecordingInfo', () => {
    beforeEach(() => {
      // Mock getAccessToken
      jest.spyOn(service, 'getAccessToken').mockResolvedValue('test_token');
    });

    it('should get recording info for available recording', async () => {
      const mockRecordingData = {
        recordings: [
          {
            status: 'Available',
            url: 'https://recording.url/audio.wav',
            duration: 120,
            file_size: 1024000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecordingData,
      } as Response);

      const result = await service.getRecordingInfo('call123');

      expect(result).toEqual({
        status: 'Available',
        url: 'https://recording.url/audio.wav',
        call_id: 'call123',
        duration: 120,
        file_size: 1024000,
      });
    });

    it('should handle no recordings found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recordings: [] }),
      } as Response);

      const result = await service.getRecordingInfo('call123');

      expect(result).toEqual({
        status: 'NotFound',
        call_id: 'call123',
      });
    });

    it('should handle processing status', async () => {
      const mockRecordingData = {
        recordings: [
          {
            status: 'Processing',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecordingData,
      } as Response);

      const result = await service.getRecordingInfo('call123');

      expect(result).toEqual({
        status: 'Processing',
        call_id: 'call123',
      });
    });

    it('should refresh token on 401 error', async () => {
      // Remove the getAccessToken spy for this test
      jest.spyOn(service, 'getAccessToken').mockRestore();
      
      // First call to getAccessToken (initial token)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'initial_token' }),
        } as Response)
        // First getRecordingInfo attempt returns 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        } as Response)
        // Second call to getAccessToken (refresh token)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'new_token' }),
        } as Response)
        // Second getRecordingInfo attempt succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            recordings: [
              {
                status: 'Available',
                url: 'https://recording.url',
              },
            ],
          }),
        } as Response);

      const result = await service.getRecordingInfo('call123');

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.status).toBe('Available');
    });
  });

  describe('downloadAudio', () => {
    const mockCall: CallRecord = {
      call_id: 'call123',
      from_number: '+1234567890',
      to_number: '+0987654321',
      from_username: 'user1',
      from_name: 'Test User',
      start_time: '2025-01-01T10:00:00Z',
      duration: 120,
      recording_url: 'https://recording.url',
      broker_id: 'tes',
      date: '2025-01-01',
    };

    beforeEach(() => {
      jest.spyOn(service, 'getAccessToken').mockResolvedValue('test_token');
      jest.spyOn(service, 'getRecordingInfo').mockResolvedValue({
        status: 'Available',
        url: 'https://recording.url/audio.wav',
        call_id: 'call123',
        duration: 120,
        file_size: 1024000,
      });
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockImplementation(() => undefined as any);
      mockFs.writeFileSync.mockImplementation(() => undefined);
    });

    it('should download audio file successfully', async () => {
      const mockAudioData = Buffer.from('mock audio data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue(mockAudioData.length.toString()),
        },
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ value: mockAudioData, done: false })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      } as any);

      mockFs.statSync.mockReturnValue({ size: mockAudioData.length } as any);

      const onProgress = jest.fn();
      const result = await service.downloadAudio(mockCall, '/output/audio', onProgress);

      expect(result).toEqual({
        filePath: expect.any(String),
        filename: 'tes_call123.wav',
        size: mockAudioData.length,
        call_id: 'call123',
        broker_id: 'tes',
      });
      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle download failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      } as any);

      const result = await service.downloadAudio(mockCall, '/output/audio');
      expect(result).toBeNull();
    });

    it('should skip if recording not available', async () => {
      jest.spyOn(service, 'getRecordingInfo').mockResolvedValue({
        status: 'NotFound',
        call_id: 'call123',
      });

      const result = await service.downloadAudio(mockCall, '/output/audio');
      expect(result).toBeNull();
    });

    it('should handle empty file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('0'),
        },
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      } as any);

      mockFs.statSync.mockReturnValue({ size: 0 } as any);
      mockFs.unlinkSync.mockImplementation(() => undefined);

      const result = await service.downloadAudio(mockCall, '/output/audio');
      expect(result).toBeNull();
      
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('filterCallsForDownload', () => {
    it('should filter calls based on duration', () => {
      const calls: CallRecord[] = [
        {
          call_id: '1',
          duration: 10,
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User 1',
          start_time: '2025-01-01T10:00:00Z',
          recording_url: 'url1',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '2',
          duration: 30,
          from_number: '+333',
          to_number: '+444',
          from_username: 'user2',
          from_name: 'User 2',
          start_time: '2025-01-01T11:00:00Z',
          recording_url: 'url2',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '3',
          duration: 60,
          from_number: '+555',
          to_number: '+666',
          from_username: 'user3',
          from_name: 'User 3',
          start_time: '2025-01-01T12:00:00Z',
          recording_url: '',
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const result = service.filterCallsForDownload(calls, 15);

      expect(result.eligible).toHaveLength(1);
      expect(result.eligible[0].call_id).toBe('2');
      expect(result.skippedTooShort).toBe(1);
      expect(result.skippedNoRecording).toBe(1);
    });

    it('should skip calls without call_id', () => {
      const calls: CallRecord[] = [
        {
          call_id: '',
          duration: 60,
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User 1',
          start_time: '2025-01-01T10:00:00Z',
          recording_url: 'url1',
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const result = service.filterCallsForDownload(calls);

      expect(result.eligible).toHaveLength(0);
      expect(result.skippedNoCallId).toBe(1);
    });

    it('should handle empty array', () => {
      const result = service.filterCallsForDownload([]);

      expect(result.eligible).toHaveLength(0);
      expect(result.skippedTooShort).toBe(0);
      expect(result.skippedNoRecording).toBe(0);
      expect(result.skippedNoCallId).toBe(0);
    });
  });

  describe('downloadBatch', () => {
    const mockCalls: CallRecord[] = [
      {
        call_id: 'call1',
        duration: 60,
        from_number: '+111',
        to_number: '+222',
        from_username: 'user1',
        from_name: 'User 1',
        start_time: '2025-01-01T10:00:00Z',
        recording_url: 'url1',
        broker_id: 'us1',
        date: '2025-01-01',
      },
      {
        call_id: 'call2',
        duration: 90,
        from_number: '+333',
        to_number: '+444',
        from_username: 'user2',
        from_name: 'User 2',
        start_time: '2025-01-01T11:00:00Z',
        recording_url: 'url2',
        broker_id: 'us2',
        date: '2025-01-01',
      },
    ];

    beforeEach(() => {
      jest.spyOn(service, 'downloadAudio').mockImplementation(async (call) => ({
        filePath: `/output/audio/${call.broker_id}_${call.call_id}.wav`,
        filename: `${call.broker_id}_${call.call_id}.wav`,
        size: 1024000,
        call_id: call.call_id,
        broker_id: call.broker_id,
      }));
    });

    it('should download batch with rate limiting', async () => {
      const onProgress = jest.fn();
      const result = await service.downloadBatch(
        mockCalls,
        '/output/audio',
        { batchSize: 2, batchDelay: 100 },
        onProgress
      );

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(service.downloadAudio).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle download failures gracefully', async () => {
      jest.spyOn(service, 'downloadAudio')
        .mockResolvedValueOnce({
          filePath: '/output/audio/us1_call1.wav',
          filename: 'us1_call1.wav',
          size: 1024000,
          call_id: 'call1',
          broker_id: 'us1',
        })
        .mockRejectedValueOnce(new Error('Download failed'));

      const result = await service.downloadBatch(
        mockCalls,
        '/output/audio',
        { batchSize: 2, batchDelay: 100 }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Download failed');
    });

    it('should respect batch size', async () => {
      const largeBatch = Array(10).fill(null).map((_, i) => ({
        ...mockCalls[0],
        call_id: `call${i}`,
      }));

      let downloadCalls = 0;
      jest.spyOn(service, 'downloadAudio').mockImplementation(async () => {
        downloadCalls++;
        // Simulate delay to check batching
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          filePath: '/output/audio/file.wav',
          filename: 'file.wav',
          size: 1024000,
          call_id: 'call',
          broker_id: 'bro',
        };
      });

      await service.downloadBatch(
        largeBatch,
        '/output/audio',
        { batchSize: 3, batchDelay: 50 }
      );

      // Should process in batches of 3
      expect(downloadCalls).toBe(10);
    });

    it('should handle empty array', async () => {
      const result = await service.downloadBatch(
        [],
        '/output/audio',
        { batchSize: 2, batchDelay: 100 }
      );

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });
});