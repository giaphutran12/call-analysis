import { SupabaseUploadService } from '../supabase-upload';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('SupabaseUploadService', () => {
  let service: SupabaseUploadService;
  let mockSupabaseClient: any;
  let mockStorageClient: any;
  let mockDatabaseClient: any;

  const testConfig = {
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
    bucketName: 'audio-files',
  };

  beforeEach(() => {
    // Mock storage operations
    mockStorageClient = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
      list: jest.fn(),
    };

    // Mock database operations
    mockDatabaseClient = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    };

    // Mock Supabase client
    mockSupabaseClient = {
      storage: {
        from: jest.fn(() => mockStorageClient),
      },
      from: jest.fn((table: string) => {
        if (table === 'profiles') return mockDatabaseClient;
        if (table === 'call_analysis') return mockDatabaseClient;
        return mockDatabaseClient;
      }),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    service = new SupabaseUploadService(testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(createClient).toHaveBeenCalledWith(
        testConfig.url,
        testConfig.anonKey
      );
    });
  });

  describe('uploadAudioFile', () => {
    const testFile = {
      filepath: '/test/audio/800_call123.wav',
      filename: '800_call123.wav',
      call_id: 'call123',
      broker_id: '800',
      metadata: {
        date: '2024-01-15',
        duration: 120,
        from_number: '+1234567890',
        to_number: '+0987654321',
      },
    };

    it('should upload file with correct path structure', async () => {
      const mockFileBuffer = Buffer.from('test audio data');
      const expectedPath = 'audio/2024/1/15/broker_800/800_call123.wav';
      const publicUrl = `${testConfig.url}/storage/v1/object/public/audio-files/${expectedPath}`;

      mockStorageClient.upload.mockResolvedValue({
        data: { path: expectedPath },
        error: null,
      });

      mockStorageClient.getPublicUrl.mockReturnValue({
        data: { publicUrl },
      });

      const result = await service.uploadAudioFile(testFile, mockFileBuffer);

      expect(mockStorageClient.upload).toHaveBeenCalledWith(
        expectedPath,
        mockFileBuffer,
        expect.objectContaining({
          contentType: 'audio/wav',
          upsert: false,
        })
      );

      expect(result).toEqual({
        success: true,
        fileUrl: publicUrl,
        path: expectedPath,
      });
    });

    it('should handle upload errors gracefully', async () => {
      const mockFileBuffer = Buffer.from('test audio data');

      mockStorageClient.upload.mockResolvedValue({
        data: null,
        error: { message: 'Storage quota exceeded' },
      });

      const result = await service.uploadAudioFile(testFile, mockFileBuffer);

      expect(result).toEqual({
        success: false,
        error: 'Storage quota exceeded',
      });
    });

    it('should skip duplicate uploads', async () => {
      const mockFileBuffer = Buffer.from('test audio data');
      const expectedPath = 'audio/2024/1/15/broker_800/800_call123.wav';

      // Mock that file already exists
      mockStorageClient.list.mockResolvedValue({
        data: [{ name: '800_call123.wav' }],
        error: null,
      });

      const publicUrl = `${testConfig.url}/storage/v1/object/public/audio-files/${expectedPath}`;
      mockStorageClient.getPublicUrl.mockReturnValue({
        data: { publicUrl },
      });

      const result = await service.uploadAudioFile(testFile, mockFileBuffer);

      expect(mockStorageClient.upload).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        fileUrl: publicUrl,
        path: expectedPath,
        skipped: true,
      });
    });
  });

  describe('lookupBrokerProfile', () => {
    it('should find existing broker profile', async () => {
      const mockProfile = {
        id: 'uuid-123',
        broker_id: '800',
        full_name: 'Broker-800',
        role: 'broker',
      };

      mockDatabaseClient.maybeSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const result = await service.lookupBrokerProfile('800');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockDatabaseClient.select).toHaveBeenCalledWith('*');
      expect(mockDatabaseClient.eq).toHaveBeenCalledWith('broker_id', '800');
      expect(result).toEqual(mockProfile);
    });

    it('should create new broker profile if not exists', async () => {
      const newProfileId = 'new-uuid-456';

      // First lookup returns null
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Insert returns new profile
      mockDatabaseClient.single.mockResolvedValueOnce({
        data: {
          id: newProfileId,
          broker_id: '800',
          full_name: 'Broker-800',
          role: 'broker',
        },
        error: null,
      });

      const result = await service.lookupBrokerProfile('800');

      expect(mockDatabaseClient.insert).toHaveBeenCalledWith({
        broker_id: '800',
        full_name: 'Broker-800',
        role: 'broker',
      });

      expect(result).toEqual(expect.objectContaining({
        id: newProfileId,
        broker_id: '800',
      }));
    });

    it('should handle database errors', async () => {
      mockDatabaseClient.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      await expect(service.lookupBrokerProfile('800')).rejects.toThrow(
        'Failed to lookup broker profile: Database connection failed'
      );
    });
  });

  describe('createOrUpdateCallAnalysis', () => {
    const testCallData = {
      call_id: 'call123',
      broker_profile_id: 'uuid-123',
      audio_url: 'https://storage.url/audio.wav',
      metadata: {
        call_date: '2024-01-15',
        duration: 120,
        from_name: 'John Doe',
        to_number: '+1234567890',
      },
      transcript: 'Test transcript text',
    };

    it('should update existing call analysis record', async () => {
      // First check if exists - returns existing record
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: 'existing-id', call_id: 'call123' },
        error: null,
      });

      // Update operation
      mockDatabaseClient.single.mockResolvedValueOnce({
        data: { id: 'existing-id', ...testCallData },
        error: null,
      });

      const result = await service.createOrUpdateCallAnalysis(testCallData);

      expect(mockDatabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          audio_url: testCallData.audio_url,
          duration: testCallData.metadata.duration,
          from_name: testCallData.metadata.from_name,
          to_number: testCallData.metadata.to_number,
          call_date: testCallData.metadata.call_date,
          diarized_transcript: testCallData.transcript,
          updated_at: expect.any(String),
        })
      );

      expect(result).toEqual(expect.objectContaining({
        id: 'existing-id',
        call_id: 'call123',
      }));
    });

    it('should create new call analysis record if not exists', async () => {
      // First check returns null
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Insert operation
      mockDatabaseClient.single.mockResolvedValueOnce({
        data: { id: 'new-id', ...testCallData },
        error: null,
      });

      const result = await service.createOrUpdateCallAnalysis(testCallData);

      expect(mockDatabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          call_id: testCallData.call_id,
          profile__broker: testCallData.broker_profile_id,
          audio_url: testCallData.audio_url,
          duration: testCallData.metadata.duration,
          from_name: testCallData.metadata.from_name,
          to_number: testCallData.metadata.to_number,
          call_date: testCallData.metadata.call_date,
          diarized_transcript: testCallData.transcript,
          created_at: expect.any(String),
          updated_at: expect.any(String),
        })
      );

      expect(result).toEqual(expect.objectContaining({
        id: 'new-id',
        call_id: 'call123',
      }));
    });

    it('should handle database errors during update', async () => {
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: 'existing-id' },
        error: null,
      });

      mockDatabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(
        service.createOrUpdateCallAnalysis(testCallData)
      ).rejects.toThrow('Failed to update call analysis: Update failed');
    });
  });

  describe('processAudioUpload', () => {
    const testFileData = {
      filepath: '/test/audio/800_call123.wav',
      filename: '800_call123.wav',
      call_id: 'call123',
      broker_id: '800',
      metadata: {
        date: '2024-01-15',
        duration: 120,
        from_name: 'John Doe',
        to_number: '+1234567890',
      },
      transcript: 'Test transcript',
    };

    it('should complete full upload flow successfully', async () => {
      const mockFileBuffer = Buffer.from('test audio');
      const audioUrl = 'https://storage.url/audio.wav';
      const profileId = 'profile-uuid';

      // Mock storage upload
      mockStorageClient.upload.mockResolvedValue({
        data: { path: 'test/path.wav' },
        error: null,
      });

      mockStorageClient.getPublicUrl.mockReturnValue({
        data: { publicUrl: audioUrl },
      });

      // Mock profile lookup
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: profileId, broker_id: '800' },
        error: null,
      });

      // Mock call analysis check (not exists)
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock call analysis insert
      mockDatabaseClient.single.mockResolvedValueOnce({
        data: { id: 'call-analysis-id', call_id: 'call123' },
        error: null,
      });

      const result = await service.processAudioUpload(
        testFileData,
        mockFileBuffer
      );

      expect(result).toEqual({
        success: true,
        call_id: 'call123',
        broker_id: '800',
        audio_url: audioUrl,
        database_record_id: 'call-analysis-id',
      });
    });

    it('should handle storage failure gracefully', async () => {
      const mockFileBuffer = Buffer.from('test audio');

      mockStorageClient.upload.mockResolvedValue({
        data: null,
        error: { message: 'Storage error' },
      });

      const result = await service.processAudioUpload(
        testFileData,
        mockFileBuffer
      );

      expect(result).toEqual({
        success: false,
        call_id: 'call123',
        broker_id: '800',
        error: 'Storage upload failed: Storage error',
      });
    });

    it('should continue despite database failure after successful upload', async () => {
      const mockFileBuffer = Buffer.from('test audio');
      const audioUrl = 'https://storage.url/audio.wav';

      // Mock successful storage upload
      mockStorageClient.upload.mockResolvedValue({
        data: { path: 'test/path.wav' },
        error: null,
      });

      mockStorageClient.getPublicUrl.mockReturnValue({
        data: { publicUrl: audioUrl },
      });

      // Mock profile lookup failure
      mockDatabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await service.processAudioUpload(
        testFileData,
        mockFileBuffer
      );

      expect(result).toEqual({
        success: false,
        call_id: 'call123',
        broker_id: '800',
        audio_url: audioUrl,
        error: 'Database update failed: Failed to lookup broker profile: Database error',
      });
    });
  });
});