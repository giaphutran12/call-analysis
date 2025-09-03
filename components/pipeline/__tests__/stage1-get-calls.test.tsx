import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stage1GetCalls } from '../stage1-get-calls';
import '@testing-library/jest-dom';

// Mock fetch
global.fetch = jest.fn();

describe('Stage1GetCalls Component', () => {
  const mockOnCallsFetched = jest.fn();
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all input fields', () => {
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client Secret/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Page Size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min Duration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Execute Stage 1/i })).toBeInTheDocument();
  });

  it('should update input values when typed', async () => {
    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    const clientIdInput = screen.getByLabelText(/Client ID/i);
    const clientSecretInput = screen.getByLabelText(/Client Secret/i);

    await user.type(clientIdInput, 'test_client_id');
    await user.type(clientSecretInput, 'test_secret');

    expect(clientIdInput).toHaveValue('test_client_id');
    expect(clientSecretInput).toHaveValue('test_secret');
  });

  it('should mask client secret input', () => {
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);
    
    const clientSecretInput = screen.getByLabelText(/Client Secret/i);
    expect(clientSecretInput).toHaveAttribute('type', 'password');
  });

  it('should successfully fetch calls and display results', async () => {
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
    const mockResponse = {
      success: true,
      totalCalls: 1,
      dailyResults: [
        {
          date: '2025-01-01',
          calls: mockCalls,
          status: 'success',
          callCount: 1,
        },
      ],
      calls: mockCalls,
      results: [
        {
          date: '2025-01-01',
          calls: mockCalls,
          status: 'success',
          callCount: 1,
        },
      ],
      dateRange: { startDate: '2025-01-01', endDate: '2025-01-01' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'test_client');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test_secret');

    // Click fetch button
    const fetchButton = screen.getByRole('button', { name: /Execute Stage 1/i });
    await user.click(fetchButton);

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByText(/Successfully fetched 1 calls/i)).toBeInTheDocument();
    });

    // Check if onCallsFetched was called with the correct data
    expect(mockOnCallsFetched).toHaveBeenCalledWith(mockCalls);
    
    // Check if results are displayed
    expect(screen.getByText('2025-01-01')).toBeInTheDocument();
    expect(screen.getByText(/1 calls/i)).toBeInTheDocument();
  });

  it('should display error message on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Authentication failed' }),
    } as Response);

    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'invalid');
    await user.type(screen.getByLabelText(/Client Secret/i), 'invalid');

    // Click fetch button
    await user.click(screen.getByRole('button', { name: /Execute Stage 1/i }));

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
    });

    expect(mockOnCallsFetched).not.toHaveBeenCalled();
  });

  it('should show loading state while fetching', async () => {
    // Create a promise that we can control
    let resolvePromise: any;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise as any);

    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    // Fill in fields and click fetch
    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');
    await user.click(screen.getByRole('button', { name: /Execute Stage 1/i }));

    // Check loading state
    expect(screen.getByText(/Processing.../i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Resolve the promise
    resolvePromise({
      ok: true,
      json: async () => ({ 
        success: true, 
        totalCalls: 0, 
        dailyResults: [],
        calls: [],
        results: [],
        dateRange: { startDate: '2025-01-01', endDate: '2025-01-01' }
      }),
    });

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText(/Processing.../i)).not.toBeInTheDocument();
    });
  });

  it('should enable CSV export when results are available', async () => {
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
    const mockResponse = {
      success: true,
      totalCalls: 1,
      dailyResults: [
        {
          date: '2025-01-01',
          calls: mockCalls,
          status: 'success',
          callCount: 1,
        },
      ],
      calls: mockCalls,
      results: [
        {
          date: '2025-01-01',
          calls: mockCalls,
          status: 'success',
          callCount: 1,
        },
      ],
      dateRange: { startDate: '2025-01-01', endDate: '2025-01-01' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    // Fetch calls
    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');
    await user.click(screen.getByRole('button', { name: /Execute Stage 1/i }));

    // Wait for export button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download CSV/i })).toBeInTheDocument();
    });

    // Mock URL.createObjectURL and document.createElement
    const mockCreateElement = jest.spyOn(document, 'createElement');
    const mockClick = jest.fn();
    mockCreateElement.mockReturnValue({ click: mockClick } as any);
    global.URL.createObjectURL = jest.fn();

    // Click export button
    await user.click(screen.getByRole('button', { name: /Download CSV/i }));

    // Verify CSV export was triggered
    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockClick).toHaveBeenCalled();
  });

  it('should validate date range', async () => {
    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    // Set end date before start date
    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-02');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid date range' }),
    } as Response);

    await user.click(screen.getByRole('button', { name: /Execute Stage 1/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid date range/i)).toBeInTheDocument();
    });
  });

  it('should show progress bar during fetch', async () => {
    let resolvePromise: any;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise as any);

    const user = userEvent.setup();
    render(<Stage1GetCalls onCallsFetched={mockOnCallsFetched} />);

    await user.type(screen.getByLabelText(/Start Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/End Date/i), '2025-01-01');
    await user.type(screen.getByLabelText(/Client ID/i), 'test');
    await user.type(screen.getByLabelText(/Client Secret/i), 'test');
    await user.click(screen.getByRole('button', { name: /Execute Stage 1/i }));

    // Check for progress indicator
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();

    resolvePromise({
      ok: true,
      json: async () => ({ success: true, totalCalls: 0, dailyResults: [] }),
    });

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });
});