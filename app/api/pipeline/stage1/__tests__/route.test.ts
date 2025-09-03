import { POST } from '../route';
import { NextRequest } from 'next/server';
import { Net2PhoneService } from '@/lib/services/net2phone';

// Mock the Net2PhoneService
jest.mock('@/lib/services/net2phone');

describe('Stage 1 API Route', () => {
  const mockNet2PhoneService = Net2PhoneService as jest.MockedClass<typeof Net2PhoneService>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/pipeline/stage1', () => {
    it('should successfully fetch calls for date range', async () => {
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
      ];

      const mockService = {
        getCallLogs: jest.fn().mockResolvedValue({
          result: [mockCalls[0]],
          count: 1,
        }),
        extractRelevantData: jest.fn().mockReturnValue(mockCalls),
        deduplicateCalls: jest.fn().mockReturnValue(mockCalls),
      };

      mockNet2PhoneService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-01',
          clientId: 'test_client',
          clientSecret: 'test_secret',
          pageSize: 100,
          minDuration: 15,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.totalCalls).toBe(1);
      expect(data.dailyResults).toHaveLength(1);
      expect(data.dailyResults[0].date).toBe('2025-01-01');
      expect(data.dailyResults[0].calls).toEqual(mockCalls);
    });

    it('should handle multiple days in date range', async () => {
      const mockService = {
        getCallLogs: jest.fn()
          .mockResolvedValueOnce({ result: [], count: 0 })
          .mockResolvedValueOnce({ result: [], count: 0 }),
        extractRelevantData: jest.fn().mockReturnValue([]),
        deduplicateCalls: jest.fn().mockReturnValue([]),
      };

      mockNet2PhoneService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-02',
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockService.getCallLogs).toHaveBeenCalledTimes(2);
      expect(data.dailyResults).toHaveLength(2);
    });

    it('should return error for missing credentials', async () => {
      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-01',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Net2Phone credentials are required');
    });

    it('should return error for invalid date range', async () => {
      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-02',
          endDate: '2025-01-01',
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid date range');
    });

    it('should handle API errors gracefully', async () => {
      const mockService = {
        getCallLogs: jest.fn().mockRejectedValue(new Error('API Error')),
        extractRelevantData: jest.fn(),
        deduplicateCalls: jest.fn(),
      };

      mockNet2PhoneService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-01',
          clientId: 'test_client',
          clientSecret: 'test_secret',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      // When individual date fails, it's recorded but doesn't fail the entire request
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.dailyResults[0].status).toBe('error');
      expect(data.dailyResults[0].error).toContain('API Error');
    });

    it('should handle pagination correctly', async () => {
      const mockService = {
        getCallLogs: jest.fn()
          .mockResolvedValueOnce({
            result: Array(100).fill({}).map((_, i) => ({ call_id: `${i}` })),
            count: 150,
            next: 'page2',
          })
          .mockResolvedValueOnce({
            result: Array(50).fill({}).map((_, i) => ({ call_id: `${100 + i}` })),
            count: 150,
          }),
        extractRelevantData: jest.fn().mockImplementation(data => 
          data.map(d => ({ ...d, duration: 60 })) // Add duration field
        ),
        deduplicateCalls: jest.fn().mockImplementation(data => data),
      };

      mockNet2PhoneService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-01',
          clientId: 'test_client',
          clientSecret: 'test_secret',
          pageSize: 100,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockService.getCallLogs).toHaveBeenCalledTimes(2);
      expect(data.totalCalls).toBe(150);
    });

    it('should apply minimum duration filter', async () => {
      const mockCalls = [
        {
          call_id: '1',
          duration: 10, // Below minimum
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User 1',
          start_time: '2025-01-01T10:00:00Z',
          recording_url: '',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '2',
          duration: 30, // Above minimum
          from_number: '+333',
          to_number: '+444',
          from_username: 'user2',
          from_name: 'User 2',
          start_time: '2025-01-01T11:00:00Z',
          recording_url: '',
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const mockService = {
        getCallLogs: jest.fn().mockResolvedValue({
          result: mockCalls,
          count: 2,
        }),
        extractRelevantData: jest.fn().mockReturnValue(mockCalls),
        deduplicateCalls: jest.fn().mockReturnValue(mockCalls),
      };

      mockNet2PhoneService.mockImplementation(() => mockService as any);

      const request = new NextRequest('http://localhost:3000/api/pipeline/stage1', {
        method: 'POST',
        body: JSON.stringify({
          startDate: '2025-01-01',
          endDate: '2025-01-01',
          clientId: 'test_client',
          clientSecret: 'test_secret',
          minDuration: 15,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Only the call with duration >= 15 should be included
      expect(data.totalCalls).toBe(1);
      expect(data.dailyResults[0].calls[0].call_id).toBe('2');
    });
  });
});