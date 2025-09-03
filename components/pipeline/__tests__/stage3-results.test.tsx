import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stage3TranscribeAudio } from '../stage3-transcribe-audio';
import '@testing-library/jest-dom';
import { DownloadResult } from '@/lib/types/pipeline';

// Mock fetch
global.fetch = jest.fn();
global.EventSource = jest.fn();

describe('Stage3TranscribeAudio - Results Display', () => {
  const mockOnTranscriptionComplete = jest.fn();
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  const mockEventSource = global.EventSource as jest.Mock;

  const mockDownloadedFiles: DownloadResult[] = [
    {
      filename: '800_call123.wav',
      call_id: 'call123',
      broker_id: '800',
      size: 1024000,
      path: '/output/audio/800_call123.wav',
    },
    {
      filename: '715_call456.wav',
      call_id: 'call456',
      broker_id: '715',
      size: 2048000,
      path: '/output/audio/715_call456.wav',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock EventSource
    mockEventSource.mockReturnValue({
      onmessage: null,
      onerror: null,
      close: jest.fn(),
    });

    // Mock URL and document methods
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
    
    // Mock createElement for download testing
    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn(),
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Results Tabs', () => {
    it('should display results in tabbed interface', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        totalFiles: 2,
        transcribedFiles: 1,
        alreadyTranscribed: 1,
        successful: 1,
        failed: 1,
        results: [
          { file: '800_call123.wav', success: true },
          { file: '715_call456.wav', success: false, error: 'Transcription timeout' },
        ],
        transcripts: [
          {
            call_id: 'call123',
            broker_id: '800',
            filename: '800_call123.wav',
            transcriptPath: '/transcripts/800_call123.txt',
            rawTranscriptPath: '/transcripts/raw/800_call123.json',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      // Start transcription
      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      // Wait for results
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Transcripts/i })).toBeInTheDocument();
      });

      // Check tabs
      expect(screen.getByRole('tab', { name: /Transcripts/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Failures/i })).toBeInTheDocument();

      // Verify transcript count badge
      expect(screen.getByText('1', { selector: '.ml-2' })).toBeInTheDocument();

      // Switch to failures tab
      const failuresTab = screen.getByRole('tab', { name: /Failures/i });
      await user.click(failuresTab);

      // Check failure details
      expect(screen.getByText('715_call456.wav')).toBeInTheDocument();
      expect(screen.getByText('Transcription timeout')).toBeInTheDocument();
    });

    it('should show empty state when no results', async () => {
      const mockResponse = {
        sessionId: 'session-empty',
        totalFiles: 0,
        transcribedFiles: 0,
        successful: 0,
        failed: 0,
        results: [],
        transcripts: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={[]}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      
      // This should show error for no files, but let's test empty results case
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // Manually trigger with empty files
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={[]}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  describe('Download Functionality', () => {
    it('should download individual transcript', async () => {
      const mockResponse = {
        sessionId: 'session-download',
        totalFiles: 1,
        transcribedFiles: 1,
        successful: 1,
        failed: 0,
        results: [{ file: '800_call123.wav', success: true }],
        transcripts: [
          {
            call_id: 'call123',
            broker_id: '800',
            filename: '800_call123.wav',
            transcriptPath: '/transcripts/800_call123.txt',
            rawTranscriptPath: '/transcripts/raw/800_call123.json',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      // Click download button
      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await user.click(downloadButton);

      // Verify download was triggered
      const mockAnchor = document.createElement('a') as any;
      expect(mockAnchor.download).toBe('800_call123.txt');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should export all transcripts as CSV', async () => {
      const mockResponse = {
        sessionId: 'session-csv',
        totalFiles: 2,
        transcribedFiles: 2,
        successful: 2,
        failed: 0,
        results: [
          { file: '800_call123.wav', success: true },
          { file: '715_call456.wav', success: true },
        ],
        transcripts: [
          {
            call_id: 'call123',
            broker_id: '800',
            filename: '800_call123.wav',
            transcriptPath: '/transcripts/800_call123.txt',
            rawTranscriptPath: '/transcripts/raw/800_call123.json',
          },
          {
            call_id: 'call456',
            broker_id: '715',
            filename: '715_call456.wav',
            transcriptPath: '/transcripts/715_call456.txt',
            rawTranscriptPath: '/transcripts/raw/715_call456.json',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
      });

      // Click export button
      const exportButton = screen.getByRole('button', { name: /Export CSV/i });
      await user.click(exportButton);

      // Verify CSV export
      const mockAnchor = document.createElement('a') as any;
      expect(mockAnchor.download).toContain('transcripts_');
      expect(mockAnchor.download).toContain('.csv');
      expect(mockAnchor.click).toHaveBeenCalled();
      
      // Verify Blob was created with CSV content
      const blobCall = (global.URL.createObjectURL as jest.Mock).mock.calls[0];
      expect(blobCall[0]).toBeInstanceOf(Blob);
    });
  });

  describe('Statistics Display', () => {
    it('should display comprehensive statistics', async () => {
      const mockResponse = {
        sessionId: 'session-stats',
        totalFiles: 5,
        transcribedFiles: 3,
        alreadyTranscribed: 1,
        successful: 2,
        failed: 1,
        results: [
          { file: '800_call123.wav', success: true },
          { file: '715_call456.wav', success: true },
          { file: '502_call789.wav', success: false, error: 'API error' },
        ],
        transcripts: [
          {
            call_id: 'call123',
            broker_id: '800',
            filename: '800_call123.wav',
            transcriptPath: '/transcripts/800_call123.txt',
            rawTranscriptPath: '/transcripts/raw/800_call123.json',
          },
          {
            call_id: 'call456',
            broker_id: '715',
            filename: '715_call456.wav',
            transcriptPath: '/transcripts/715_call456.txt',
            rawTranscriptPath: '/transcripts/raw/715_call456.json',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(screen.getByText('Statistics')).toBeInTheDocument();
      });

      // Check statistics display
      expect(screen.getByText('Total Files:')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();

      expect(screen.getByText('Transcribed:')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getByText('Already Done:')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();

      expect(screen.getByText('Successful:')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();

      expect(screen.getByText('Failed:')).toBeInTheDocument();
      expect(screen.getAllByText('1')[0]).toBeInTheDocument();
    });

    it('should calculate and display success rate', async () => {
      const mockResponse = {
        sessionId: 'session-rate',
        totalFiles: 10,
        transcribedFiles: 10,
        successful: 8,
        failed: 2,
        results: [],
        transcripts: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(screen.getByText('Success Rate:')).toBeInTheDocument();
      });

      // 8 out of 10 = 80% success rate
      expect(screen.getByText('80%')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should handle EventSource errors', async () => {
      const mockResponse = {
        sessionId: 'session-sse-error',
        totalFiles: 1,
        transcribedFiles: 1,
        successful: 1,
        failed: 0,
        results: [],
        transcripts: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const mockEventSourceInstance = {
        onmessage: null,
        onerror: null,
        close: jest.fn(),
      };
      mockEventSource.mockReturnValue(mockEventSourceInstance);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      await user.type(screen.getByLabelText('AssemblyAI API Key'), 'test_key');
      await user.click(screen.getByRole('button', { name: /Start Transcription/i }));

      await waitFor(() => {
        expect(mockEventSourceInstance.onerror).toBeDefined();
      });

      // Trigger error handler
      mockEventSourceInstance.onerror();

      expect(mockEventSourceInstance.close).toHaveBeenCalled();
    });
  });
});