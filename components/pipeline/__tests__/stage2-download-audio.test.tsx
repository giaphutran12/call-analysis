import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stage2DownloadAudio } from '../stage2-download-audio';
import { CallRecord } from '@/lib/types/pipeline';
import '@testing-library/jest-dom';

// Mock fetch
global.fetch = jest.fn();

describe('Stage2DownloadAudio Component', () => {
  const mockOnDownloadComplete = jest.fn();
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  const mockCalls: CallRecord[] = [
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all configuration fields', () => {
    render(<Stage2DownloadAudio calls={mockCalls} onDownloadComplete={mockOnDownloadComplete} />);

    expect(screen.getByLabelText(/Client ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client Secret/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Batch Size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Batch Delay/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min Duration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Download/i })).toBeInTheDocument();
  });

  it('should show call count', () => {
    render(<Stage2DownloadAudio calls={mockCalls} onDownloadComplete={mockOnDownloadComplete} />);
    
    expect(screen.getByText(/Total Calls: 2/i)).toBeInTheDocument();
  });

  it('should handle successful download', async () => {
    const mockResponse = {
      message: 'Audio download completed',
      stats: {
        totalCalls: 2,
        eligibleCalls: 2,
        skippedTooShort: 0,
        skippedNoRecording: 0,
        skippedNoCallId: 0,
      },
      summary: {
        attempted: 2,
        successful: 2,
        failed: 0,
        successRate: 100,
      },
      downloads: [
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
      failures: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} onDownloadComplete={mockOnDownloadComplete} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');

    // Start download
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText(/Successfully downloaded 2 files/i)).toBeInTheDocument();
    });

    // Check if callback was called
    expect(mockOnDownloadComplete).toHaveBeenCalledWith(mockResponse.downloads);
    
    // Check statistics display
    expect(screen.getByText(/2/)).toBeInTheDocument(); // Total eligible
    expect(screen.getByText(/100%/i)).toBeInTheDocument(); // Success rate
  });

  it('should display filtering statistics', async () => {
    const mockResponse = {
      message: 'Audio download completed',
      stats: {
        totalCalls: 5,
        eligibleCalls: 2,
        skippedTooShort: 2,
        skippedNoRecording: 1,
        skippedNoCallId: 0,
      },
      summary: {
        attempted: 2,
        successful: 2,
        failed: 0,
        successRate: 100,
      },
      downloads: [],
      failures: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={Array(5).fill(mockCalls[0])} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await waitFor(() => {
      expect(screen.getByText(/Total Calls/i)).toBeInTheDocument();
    });

    // Check skip reasons are displayed
    expect(screen.getByText(/Too Short.*2/i)).toBeInTheDocument();
    expect(screen.getByText(/No Recording.*1/i)).toBeInTheDocument();
  });

  it('should handle download failures', async () => {
    const mockResponse = {
      message: 'Audio download completed',
      stats: {
        totalCalls: 2,
        eligibleCalls: 2,
        skippedTooShort: 0,
        skippedNoRecording: 0,
        skippedNoCallId: 0,
      },
      summary: {
        attempted: 2,
        successful: 1,
        failed: 1,
        successRate: 50,
      },
      downloads: [
        {
          filePath: '/output/audio/tes_1.wav',
          filename: 'tes_1.wav',
          size: 1024000,
          call_id: '1',
          broker_id: 'tes',
        },
      ],
      failures: [
        {
          call_id: '2',
          error: 'Network error during download',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await waitFor(() => {
      expect(screen.getByText(/50%/i)).toBeInTheDocument(); // Success rate
    });

    // Switch to failures tab
    await user.click(screen.getByRole('tab', { name: /Failures/i }));
    
    // Check failure is displayed
    expect(screen.getByText(/Network error/i)).toBeInTheDocument();
  });

  it('should validate required fields', async () => {
    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    // Try to start without credentials
    const downloadButton = screen.getByRole('button', { name: /Start Download/i });
    expect(downloadButton).toBeDisabled();

    // Fill in one field
    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    expect(downloadButton).toBeDisabled();

    // Fill in both fields
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');
    expect(downloadButton).toBeEnabled();
  });

  it('should handle configuration changes', async () => {
    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    const batchSizeInput = screen.getByLabelText(/Batch Size/i);
    const batchDelayInput = screen.getByLabelText(/Batch Delay/i);
    const minDurationInput = screen.getByLabelText(/Min Duration/i);

    // Clear and update values
    await user.clear(batchSizeInput);
    await user.type(batchSizeInput, '10');
    expect(batchSizeInput).toHaveValue(10);

    await user.clear(batchDelayInput);
    await user.type(batchDelayInput, '5000');
    expect(batchDelayInput).toHaveValue(5000);

    await user.clear(minDurationInput);
    await user.type(minDurationInput, '30');
    expect(minDurationInput).toHaveValue(30);
  });

  it('should show loading state during download', async () => {
    let resolvePromise: any;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise as any);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    // Check loading state
    expect(screen.getByText(/Downloading.../i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Resolve the promise
    resolvePromise({
      ok: true,
      json: async () => ({
        message: 'Completed',
        stats: { totalCalls: 2, eligibleCalls: 2 },
        summary: { successful: 2, failed: 0, successRate: 100 },
        downloads: [],
        failures: [],
      }),
    });

    await waitFor(() => {
      expect(screen.queryByText(/Downloading.../i)).not.toBeInTheDocument();
    });
  });

  it('should display error messages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Authentication failed' }),
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'invalid');
    await user.type(screen.getByLabelText(/Client Secret/i), 'invalid');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await waitFor(() => {
      expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
    });
  });

  it('should format file sizes correctly', async () => {
    const mockResponse = {
      message: 'Audio download completed',
      stats: { totalCalls: 1, eligibleCalls: 1 },
      summary: { successful: 1, failed: 0, successRate: 100 },
      downloads: [
        {
          filePath: '/output/audio/test.wav',
          filename: 'test.wav',
          size: 1536000, // Should display as 1.5 MB
          call_id: '1',
          broker_id: 'tes',
        },
      ],
      failures: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={[mockCalls[0]]} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await waitFor(() => {
      expect(screen.getByText(/test.wav/i)).toBeInTheDocument();
    });

    // Check if file size is formatted
    expect(screen.getByText(/1\.5.*MB/i)).toBeInTheDocument();
  });

  it('should handle empty calls array', () => {
    render(<Stage2DownloadAudio calls={[]} />);
    
    expect(screen.getByText(/Total Calls: 0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Download/i })).toBeDisabled();
  });

  it('should switch between tabs', async () => {
    const mockResponse = {
      message: 'Audio download completed',
      stats: { totalCalls: 2, eligibleCalls: 2 },
      summary: { successful: 1, failed: 1, successRate: 50 },
      downloads: [
        {
          filePath: '/output/audio/test.wav',
          filename: 'test.wav',
          size: 1024000,
          call_id: '1',
          broker_id: 'tes',
        },
      ],
      failures: [
        {
          call_id: '2',
          error: 'Failed to download',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage2DownloadAudio calls={mockCalls} />);

    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');
    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Downloads/i })).toBeInTheDocument();
    });

    // Check downloads tab content
    expect(screen.getByText(/test.wav/i)).toBeInTheDocument();

    // Switch to failures tab
    await user.click(screen.getByRole('tab', { name: /Failures/i }));
    expect(screen.getByText(/Failed to download/i)).toBeInTheDocument();

    // Switch back to downloads tab
    await user.click(screen.getByRole('tab', { name: /Downloads/i }));
    expect(screen.getByText(/test.wav/i)).toBeInTheDocument();
  });
});