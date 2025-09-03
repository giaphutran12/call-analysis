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

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})