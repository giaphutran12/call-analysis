import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stage3TranscribeAudio } from '../stage3-transcribe-audio';
import '@testing-library/jest-dom';
import { DownloadResult } from '@/lib/types/pipeline';

// Mock fetch and EventSource
global.fetch = jest.fn();
global.EventSource = jest.fn();

describe('Stage3TranscribeAudio Component', () => {
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

  let mockEventSourceInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock EventSource instance
    mockEventSourceInstance = {
      onmessage: null,
      onerror: null,
      close: jest.fn(),
      addEventListener: jest.fn(),
    };
    mockEventSource.mockReturnValue(mockEventSourceInstance);

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  describe('Rendering', () => {
    it('should render all UI elements', () => {
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      expect(screen.getByText('Stage 3: Transcribe Audio')).toBeInTheDocument();
      expect(screen.getByText(/Transcribe audio recordings using AssemblyAI/i)).toBeInTheDocument();
      expect(screen.getByLabelText('AssemblyAI API Key')).toBeInTheDocument();
      expect(screen.getByLabelText('Concurrent Transcriptions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start Transcription/i })).toBeInTheDocument();
    });

    it('should display available files count', () => {
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      expect(screen.getByText(/Available Files:/i)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should show no files message when downloadedFiles is empty', () => {
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={[]}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      expect(screen.getByText(/Available Files:/i)).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Input Handling', () => {
    it('should update API key input', async () => {
      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_api_key_123');

      expect(apiKeyInput).toHaveValue('test_api_key_123');
    });

    it('should mask API key input', () => {
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      expect(apiKeyInput).toHaveAttribute('type', 'password');
    });

    it('should update concurrent limit', async () => {
      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const concurrentInput = screen.getByLabelText('Concurrent Transcriptions');
      await user.clear(concurrentInput);
      await user.type(concurrentInput, '5');

      expect(concurrentInput).toHaveValue(5);
    });
  });

  describe('Transcription Processing', () => {
    it('should show error when API key is missing', async () => {
      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      expect(screen.getByText('Please enter your AssemblyAI API key')).toBeInTheDocument();
    });

    it('should show error when no files available', async () => {
      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={[]}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_key');

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      expect(screen.getByText('No audio files available for transcription')).toBeInTheDocument();
    });

    it('should successfully start transcription', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        message: 'Transcription completed',
        totalFiles: 2,
        transcribedFiles: 2,
        alreadyTranscribed: 0,
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

      // Enter API key
      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_api_key');

      // Start transcription
      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText(/Successfully transcribed 2 files/i)).toBeInTheDocument();
      });

      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith('/api/pipeline/stage3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'test_api_key',
          audioFiles: [
            { filename: '800_call123.wav', call_id: 'call123', broker_id: '800', size: 1024000 },
            { filename: '715_call456.wav', call_id: 'call456', broker_id: '715', size: 2048000 },
          ],
          concurrentLimit: 3,
        }),
      });

      // Verify callback
      expect(mockOnTranscriptionComplete).toHaveBeenCalledWith(mockResponse.transcripts);

      // Verify statistics display
      expect(screen.getByText('Total Files:')).toBeInTheDocument();
      expect(screen.getByText('2', { selector: '.text-2xl' })).toBeInTheDocument();
    });

    it('should handle transcription errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid API key' }),
      } as Response);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'invalid_key');

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });

      expect(mockOnTranscriptionComplete).not.toHaveBeenCalled();
    });

    it('should show loading state during transcription', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(promise as any);

      const user = userEvent.setup();
      render(
        <Stage3TranscribeAudio 
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_key');

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      // Check loading state
      expect(screen.getByText(/Processing.../i)).toBeInTheDocument();
      expect(startButton).toBeDisabled();

      // Resolve the promise
      resolvePromise({
        ok: true,
        json: async () => ({
          sessionId: 'session-123',
          totalFiles: 2,
          transcribedFiles: 2,
          successful: 2,
          failed: 0,
          results: [],
          transcripts: [],
        }),
      });

      await waitFor(() => {
        expect(screen.queryByText(/Processing.../i)).not.toBeInTheDocument();
      });
    });
  });

  describe('SSE Progress Updates', () => {
    it('should connect to SSE for progress updates', async () => {
      const mockResponse = {
        sessionId: 'session-456',
        totalFiles: 2,
        transcribedFiles: 2,
        successful: 2,
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
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_key');

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(mockEventSource).toHaveBeenCalledWith(
          '/api/pipeline/stage3?sessionId=session-456'
        );
      });
    });

    it('should update progress from SSE messages', async () => {
      const mockResponse = {
        sessionId: 'session-789',
        totalFiles: 2,
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
          downloadedFiles={mockDownloadedFiles}
          onTranscriptionComplete={mockOnTranscriptionComplete}
        />
      );

      const apiKeyInput = screen.getByLabelText('AssemblyAI API Key');
      await user.type(apiKeyInput, 'test_key');

      const startButton = screen.getByRole('button', { name: /Start Transcription/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(mockEventSourceInstance.onmessage).toBeDefined();
      });

      // Simulate SSE progress message
      mockEventSourceInstance.onmessage({
        data: JSON.stringify([
          {
            filename: '800_call123.wav',
            progress: 50,
            status: 'transcribing',
          },
        ]),
      });

      expect(screen.getByText('800_call123.wav')).toBeInTheDocument();
    });
  });
});