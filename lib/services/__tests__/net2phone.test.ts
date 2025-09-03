import { Net2PhoneService } from '../net2phone';
import { CallRecord } from '@/lib/types/pipeline';

// Mock fetch globally
global.fetch = jest.fn();

describe('Net2PhoneService', () => {
  let service: Net2PhoneService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    service = new Net2PhoneService({
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      baseUrl: 'https://api.net2phone.com',
      tokenEndpoint: '/oauth2/token',
      callsEndpoint: '/v2/calls'
    });
    jest.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('should successfully get access token', async () => {
      const mockToken = 'mock_access_token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: mockToken }),
      } as Response);

      const token = await service.getAccessToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.net2phone.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.stringContaining('grant_type=client_credentials'),
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
        'Failed to get access token: Unauthorized'
      );
    });

    it('should cache access token for subsequent calls', async () => {
      const mockToken = 'cached_token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: mockToken }),
      } as Response);

      // First call
      const token1 = await service.getAccessToken();
      // Second call should use cache
      const token2 = await service.getAccessToken();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(token1).toBe(mockToken);
      expect(token2).toBe(mockToken);
    });
  });

  describe('getCallLogs', () => {
    const mockToken = 'test_token';
    const mockCallData = {
      result: [
        {
          call_id: '12345',
          from_number: '+1234567890',
          to_number: '+0987654321',
          from_username: 'user1',
          from_name: 'Test User',
          start_time: '2025-01-01T10:00:00Z',
          duration: 120,
          recording_url: 'https://recording.url',
        },
      ],
      count: 1,
    };

    beforeEach(() => {
      // Mock getAccessToken
      jest.spyOn(service, 'getAccessToken').mockResolvedValue(mockToken);
    });

    it('should fetch call logs for given date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCallData,
      } as Response);

      const result = await service.getCallLogs('2025-01-01');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.net2phone.com/v2/calls?'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
      expect(result).toEqual(mockCallData);
    });

    it('should handle pagination with page parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCallData,
      } as Response);

      await service.getCallLogs('2025-01-01', 2, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page_size=50'),
        expect.any(Object)
      );
    });

    it('should throw error when API call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      } as Response);

      await expect(service.getCallLogs('2025-01-01')).rejects.toThrow(
        'Failed to fetch call logs: Bad Request'
      );
    });
  });

  describe('extractRelevantData', () => {
    it('should extract and transform raw call data', () => {
      const rawData = [
        {
          call_id: '123',
          from: { number: '+1234567890', username: 'user1' },
          to: { number: '+0987654321' },
          start_time: '2025-01-01T10:00:00Z',
          duration: 180,
          recording: { url: 'https://recording.url' },
          extra_field: 'ignored',
        },
      ];

      const result = service.extractRelevantData(rawData);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        call_id: '123',
        from_number: '+1234567890',
        to_number: '+0987654321',
        from_username: 'user1',
        from_name: 'user1',
        start_time: '2025-01-01T10:00:00Z',
        duration: 180,
        recording_url: 'https://recording.url',
        broker_id: 'use',
        date: '2025-01-01',
      });
    });

    it('should handle missing fields gracefully', () => {
      const rawData = [
        {
          call_id: '456',
          from: { number: '+1111111111' },
          to: { number: '+2222222222' },
          start_time: '2025-01-02T15:30:00Z',
          duration: 90,
        },
      ];

      const result = service.extractRelevantData(rawData);

      expect(result[0]).toEqual({
        call_id: '456',
        from_number: '+1111111111',
        to_number: '+2222222222',
        from_username: '',
        from_name: '',
        start_time: '2025-01-02T15:30:00Z',
        duration: 90,
        recording_url: '',
        broker_id: '',
        date: '2025-01-02',
      });
    });

    it('should generate broker_id from from_name', () => {
      const rawData = [
        {
          call_id: '789',
          from: { 
            number: '+3333333333',
            name: 'John Doe Smith'
          },
          to: { number: '+4444444444' },
          start_time: '2025-01-03T09:15:00Z',
          duration: 240,
        },
      ];

      const result = service.extractRelevantData(rawData);

      expect(result[0].from_name).toBe('John Doe Smith');
      expect(result[0].broker_id).toBe('joh'); // First 3 letters
    });
  });

  describe('deduplicateCalls', () => {
    it('should remove duplicate calls based on call_id', () => {
      const calls: CallRecord[] = [
        {
          call_id: '1',
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User One',
          start_time: '2025-01-01T10:00:00Z',
          duration: 100,
          recording_url: 'url1',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '1', // Duplicate
          from_number: '+111',
          to_number: '+222',
          from_username: 'user1',
          from_name: 'User One',
          start_time: '2025-01-01T10:00:00Z',
          duration: 100,
          recording_url: 'url1',
          broker_id: 'use',
          date: '2025-01-01',
        },
        {
          call_id: '2',
          from_number: '+333',
          to_number: '+444',
          from_username: 'user2',
          from_name: 'User Two',
          start_time: '2025-01-01T11:00:00Z',
          duration: 200,
          recording_url: 'url2',
          broker_id: 'use',
          date: '2025-01-01',
        },
      ];

      const result = service.deduplicateCalls(calls);

      expect(result).toHaveLength(2);
      expect(result.map(c => c.call_id)).toEqual(['1', '2']);
    });

    it('should handle empty array', () => {
      const result = service.deduplicateCalls([]);
      expect(result).toEqual([]);
    });
  });
});