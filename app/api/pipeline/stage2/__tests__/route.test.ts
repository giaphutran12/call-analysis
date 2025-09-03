import { POST } from '../route';
import { NextRequest } from 'next/server';
import { AudioDownloadService } from '@/lib/services/audio-download';

// Mock the AudioDownloadService
jest.mock('@/lib/services/audio-download');

describe('Stage 2 API Route', () => {
  const mockAudioDownloadService = AudioDownloadService as jest.MockedClass<typeof AudioDownloadService>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/pipeline/stage2', () => {
    it('should successfully download audio files', async () => {
      const mockCalls = [
        {
          call_id: '1',
          from_number: '+1234567890',
          to_number: '+0987654321',
          from_username: 'user1',
          from_name: 'Test User',
          start_time: '2025-01-01T10:00:00Z',
          duration: 120,
          recording_url: 'https://recording.url',
          broker_id: 'tes',
          date: '2025-01-01',
        },
        {
          call_id: '2',
          from_number: '+1112223333',
          to_number: '+4445556666',
          from_username: 'user2',
          from_name: 'Test User 2',
          start_time: '2025-01-01T11:00:00Z',
          duration: 90,
          recording_url: 'https://recording2.url',
          broker_id: 'tes',
          date: '2025-01-01',
        },
      ];

      const mockService = {
        filterCallsForDownload: jest.fn().mockReturnValue({
          eligible: mockCalls,
          skippedTooShort: 0,
          skippedNoRecording: 0,
          skippedNoCallId: 0,
        }),
        downloadBatch: jest.fn().mockResolvedValue({
          successful: [
            {
              filePath: '/output/audio/tes_1.wav',
              filename: 'tes_1.wav',
              size: 1024000,
              call_id: '1',
              broker_id: 'tes',
            },
            {
              filePath: '/output/audio/tes_2.wav',
              filename: 'tes_2.wav',
              size: 2048000,
              call_id: '2',
              broker_id: 'tes',
            },
          ],
          failed: [],
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: mockCalls,
          clientId: 'test_client',
          clientSecret: 'test_secret',
          batchSize: 2,
          batchDelay: 100,
          minDuration: 15,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Audio download completed');
      expect(data.stats.totalCalls).toBe(2);
      expect(data.stats.eligibleCalls).toBe(2);
      expect(data.summary.successful).toBe(2);
      expect(data.summary.failed).toBe(0);
      expect(data.downloads).toHaveLength(2);
    });

    it('should handle filtering of ineligible calls', async () => {
      const mockCalls = [
        {
          call_id: '1',
          duration: 5, // Too short
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User 1',
          start_time: '2025-01-01T10:00:00Z',
          recording_url: 'url',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '2',
          duration: 60,
          from_number: '+333',
          to_number: '+444',
          from_username: 'user2',
          from_name: 'User 2',
          start_time: '2025-01-01T11:00:00Z',
          recording_url: '', // No recording
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const mockService = {
        filterCallsForDownload: jest.fn().mockReturnValue({
          eligible: [],
          skippedTooShort: 1,
          skippedNoRecording: 1,
          skippedNoCallId: 0,
        }),
        downloadBatch: jest.fn().mockResolvedValue({
          successful: [],
          failed: [],
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: mockCalls,
          clientId: 'test_client',
          clientSecret: 'test_secret',
          minDuration: 15,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.eligibleCalls).toBe(0);
      expect(data.stats.skippedTooShort).toBe(1);
      expect(data.stats.skippedNoRecording).toBe(1);
      expect(data.downloads).toHaveLength(0);
    });

    it('should return error for missing credentials', async () => {
      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Client credentials are required');
    });

    it('should return error for missing calls', async () => {
      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          clientId: 'test_client',
          clientSecret: 'test_secret',
          calls: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('No calls provided');
    });

    it('should handle download failures', async () => {
      const mockCalls = [
        {
          call_id: '1',
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
        {
          call_id: '2',
          duration: 90,
          from_number: '+333',
          to_number: '+444',
          from_username: 'user2',
          from_name: 'User 2',
          start_time: '2025-01-01T11:00:00Z',
          recording_url: 'url2',
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const mockService = {
        filterCallsForDownload: jest.fn().mockReturnValue({
          eligible: mockCalls,
          skippedTooShort: 0,
          skippedNoRecording: 0,
          skippedNoCallId: 0,
        }),
        downloadBatch: jest.fn().mockResolvedValue({
          successful: [
            {
              filePath: '/output/audio/use_1.wav',
              filename: 'use_1.wav',
              size: 1024000,
              call_id: '1',
              broker_id: 'use',
            },
          ],
          failed: [
            {
              call_id: '2',
              error: 'Download failed: Network error',
            },
          ],
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: mockCalls,
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.successful).toBe(1);
      expect(data.summary.failed).toBe(1);
      expect(data.failures).toHaveLength(1);
      expect(data.failures[0].error).toContain('Network error');
    });

    it('should calculate success rate correctly', async () => {
      const mockService = {
        filterCallsForDownload: jest.fn().mockReturnValue({
          eligible: Array(10).fill({}).map((_, i) => ({
            call_id: `${i}`,
            duration: 60,
            broker_id: 'test',
          })),
          skippedTooShort: 0,
          skippedNoRecording: 0,
          skippedNoCallId: 0,
        }),
        downloadBatch: jest.fn().mockResolvedValue({
          successful: Array(7).fill({}).map((_, i) => ({
            filePath: `/output/audio/test_${i}.wav`,
            filename: `test_${i}.wav`,
            size: 1024000,
            call_id: `${i}`,
            broker_id: 'test',
          })),
          failed: Array(3).fill({}).map((_, i) => ({
            call_id: `${7 + i}`,
            error: 'Download failed',
          })),
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: Array(10).fill({}).map((_, i) => ({
            call_id: `${i}`,
            duration: 60,
            broker_id: 'test',
          })),
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.successRate).toBe(70); // 7 out of 10 = 70%
    });

    it('should handle batch configuration parameters', async () => {
      const mockService = {
        filterCallsForDownload: jest.fn().mockReturnValue({
          eligible: [{ call_id: '1' }],
          skippedTooShort: 0,
          skippedNoRecording: 0,
          skippedNoCallId: 0,
        }),
        downloadBatch: jest.fn().mockResolvedValue({
          successful: [],
          failed: [],
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: [{ call_id: '1' }],
          clientId: 'test_client',
          clientSecret: 'test_secret',
          batchSize: 5,
          batchDelay: 2000,
          minDuration: 30,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockService.downloadBatch).toHaveBeenCalledWith(
        [{ call_id: '1' }],
        expect.any(String),
        { batchSize: 5, batchDelay: 2000 }
      );
      expect(mockService.filterCallsForDownload).toHaveBeenCalledWith([{ call_id: '1' }], 30);
    });

    it('should handle API service errors gracefully', async () => {
      const mockService = {
        filterCallsForDownload: jest.fn().mockImplementation(() => {
          throw new Error('Service initialization failed');
        }),
      };

      mockAudioDownloadService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage2', {
        method: 'POST',
        body: JSON.stringify({
          calls: [{ call_id: '1' }],
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Service initialization failed');
    });
  });
});