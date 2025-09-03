import '@testing-library/jest-dom'

// Mock environment variables for testing
process.env.NET2PHONE_CLIENT_ID = 'test_client_id'
process.env.NET2PHONE_CLIENT_SECRET = 'test_client_secret'

// Mock fetch globally
global.fetch = jest.fn()

// Mock Next.js server components
jest.mock('next/server', () => ({
  NextRequest: class {
    constructor(url, init) {
      this.url = url
      this.method = init?.method || 'GET'
      this.headers = new Map()
      this.body = init?.body
    }
    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body)
      }
      return this.body
    }
  },
  NextResponse: {
    json: (data, init) => ({
      json: async () => data,
      status: init?.status || 200,
      ok: init?.status ? init.status < 400 : true,
    }),
  },
}))

// Mock URL methods for file download tests
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

// Add TextEncoder/TextDecoder for Node.js environment
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Add ReadableStream if not available
if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = class ReadableStream {
    constructor(source) {
      this.source = source
      this.controller = {
        enqueue: jest.fn(),
        close: jest.fn(),
      }
      if (source && source.start) {
        source.start(this.controller)
      }
    }
    getReader() {
      return {
        read: jest.fn().mockResolvedValue({ done: false, value: new Uint8Array() }),
        cancel: jest.fn(),
      }
    }
  }
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})