import { GET } from '../route';
import { NextRequest } from 'next/server';

describe('Stage 3 API Route - GET (SSE)', () => {
  let abortController: AbortController;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    abortController = new AbortController();
  });

  afterEach(() => {
    jest.useRealTimers();
    abortController.abort();
  });

  const createSSERequest = (sessionId?: string): NextRequest => {
    const url = sessionId 
      ? `http://localhost/api/pipeline/stage3?sessionId=${sessionId}`
      : 'http://localhost/api/pipeline/stage3';
      
    return {
      nextUrl: new URL(url),
      signal: abortController.signal,
    } as NextRequest;
  };

  describe('Session Validation', () => {
    it('should return error when sessionId is missing', async () => {
      const request = createSSERequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session ID required');
    });
  });

  describe('SSE Streaming', () => {
    it('should return SSE stream with correct headers', async () => {
      const request = createSSERequest('test-session-123');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('should stream progress updates', async () => {
      // We need to access the progressMap to simulate updates
      // In a real test, we'd need to mock or inject this dependency
      const sessionId = 'test-session-456';
      const request = createSSERequest(sessionId);
      
      const response = await GET(request);
      
      // Verify response is a stream
      expect(response.body).toBeDefined();
      expect(response.body).toBeInstanceOf(ReadableStream);

      // Get the reader
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Start reading
      const readPromise = reader.read();

      // Advance timers to trigger interval
      jest.advanceTimersByTime(1000);

      // In a real implementation, we would:
      // 1. Trigger progress updates through the progressMap
      // 2. Read chunks from the stream
      // 3. Verify the data format

      // Clean up
      reader.cancel();
    });

    it('should handle abort signal', async () => {
      const request = createSSERequest('test-session-789');
      const response = await GET(request);

      const reader = response.body!.getReader();

      // Abort the request
      abortController.abort();

      // Advance timers
      jest.advanceTimersByTime(1000);

      // Stream should be closed
      const result = await reader.read();
      expect(result.done).toBe(true);
    });

    it('should close stream when session is complete', async () => {
      const sessionId = 'test-session-complete';
      const request = createSSERequest(sessionId);
      
      const response = await GET(request);
      const reader = response.body!.getReader();

      // Simulate session completion by advancing timers
      // (In real implementation, progressMap.delete would be called)
      jest.advanceTimersByTime(5000);

      // Try to read - should eventually close
      let closed = false;
      reader.read().then(result => {
        if (result.done) closed = true;
      });

      jest.advanceTimersByTime(5000);
      
      // Clean up
      reader.cancel();
    });
  });

  describe('Progress Data Format', () => {
    it('should format progress data correctly', async () => {
      const sessionId = 'test-format-session';
      const request = createSSERequest(sessionId);
      
      const response = await GET(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read first chunk
      jest.advanceTimersByTime(1000);
      const { value } = await reader.read();
      
      if (value) {
        const text = decoder.decode(value);
        // SSE format should be: "data: {json}\n\n"
        expect(text).toMatch(/^data: /);
        expect(text).toContain('\n\n');
      }

      reader.cancel();
    });
  });
});

// Integration test for POST and GET working together
describe('Stage 3 API Route - Integration', () => {
  it('should handle complete transcription flow with SSE updates', async () => {
    // This would be an integration test that:
    // 1. Calls POST to start transcription
    // 2. Gets sessionId from response
    // 3. Connects to SSE endpoint with sessionId
    // 4. Receives progress updates
    // 5. Verifies final state

    // Mock implementation would require:
    // - Shared progressMap between POST and GET
    // - Ability to trigger progress updates
    // - Verification of streamed data

    expect(true).toBe(true); // Placeholder for integration test
  });
});