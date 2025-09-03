# Testing Guide for Stage 1: Get Call IDs

## Overview
This guide explains how to run and understand the unit tests for Stage 1 of the Call Center Analytics Pipeline.

## Test Structure

### 1. Unit Tests - Net2Phone Service
**Location**: `lib/services/__tests__/net2phone.test.ts`

Tests the core service layer that interacts with Net2Phone API:
- Authentication (OAuth2 token retrieval)
- Call log fetching with pagination
- Data extraction and transformation
- Call deduplication
- Token caching mechanism
- Error handling

### 2. Integration Tests - API Route
**Location**: `app/api/pipeline/stage1/__tests__/route.test.ts`

Tests the Next.js API endpoint:
- Date range processing
- Credential validation
- Multiple day handling
- Pagination logic
- Minimum duration filtering
- Error responses
- Success responses with proper data structure

### 3. Component Tests - UI
**Location**: `components/pipeline/__tests__/stage1-get-calls.test.tsx`

Tests the React component:
- Form rendering and input handling
- Password masking for secrets
- Loading states
- Error display
- Success state with results
- CSV export functionality
- Date range validation
- Progress indicators

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Only Stage 1 Tests
```bash
npm run test:stage1
```

### Run with Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test Types
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Component tests only
npm run test:components
```

## Test Coverage Areas

### ✅ What's Tested

#### Authentication & Security
- OAuth2 token generation
- Token caching to reduce API calls
- Credential validation
- Password field masking

#### Data Processing
- Call data extraction from API responses
- Data transformation to match our schema
- Duplicate removal by call_id
- Date parsing and formatting
- Broker ID generation from names

#### Error Handling
- Network failures
- Authentication errors
- Invalid date ranges
- Missing required fields
- API rate limiting

#### User Interface
- Form validation
- Loading states
- Progress indicators
- Error messages
- Success feedback
- CSV export

#### Business Logic
- Minimum call duration filtering (15 seconds default)
- Date range iteration
- Pagination handling
- Batch processing

### 📊 Expected Test Output

When you run `npm test`, you should see:
```
 PASS  lib/services/__tests__/net2phone.test.ts
  Net2PhoneService
    getAccessToken
      ✓ should successfully get access token
      ✓ should throw error when authentication fails
      ✓ should cache access token for subsequent calls
    getCallLogs
      ✓ should fetch call logs for given date
      ✓ should handle pagination with page parameter
      ✓ should throw error when API call fails
    extractRelevantData
      ✓ should extract and transform raw call data
      ✓ should handle missing fields gracefully
      ✓ should generate broker_id from from_name
    deduplicateCalls
      ✓ should remove duplicate calls based on call_id
      ✓ should handle empty array

 PASS  app/api/pipeline/stage1/__tests__/route.test.ts
  Stage 1 API Route
    POST /api/pipeline/stage1
      ✓ should successfully fetch calls for date range
      ✓ should handle multiple days in date range
      ✓ should return error for missing credentials
      ✓ should return error for invalid date range
      ✓ should handle API errors gracefully
      ✓ should handle pagination correctly
      ✓ should apply minimum duration filter

 PASS  components/pipeline/__tests__/stage1-get-calls.test.tsx
  Stage1GetCalls Component
    ✓ should render all input fields
    ✓ should update input values when typed
    ✓ should mask client secret input
    ✓ should successfully fetch calls and display results
    ✓ should display error message on fetch failure
    ✓ should show loading state while fetching
    ✓ should enable CSV export when results are available
    ✓ should validate date range
    ✓ should show progress bar during fetch

Test Suites: 3 passed, 3 total
Tests:       26 passed, 26 total
```

## Mock Data for Testing

### Sample Test Credentials
```javascript
{
  clientId: 'test_client_id',
  clientSecret: 'test_secret_key'
}
```

### Sample Call Record
```javascript
{
  call_id: '12345',
  from_number: '+1234567890',
  to_number: '+0987654321',
  from_username: 'user1',
  from_name: 'Test User',
  start_time: '2025-01-01T10:00:00Z',
  duration: 120,
  recording_url: 'https://recording.url/audio.wav',
  broker_id: 'tes',
  date: '2025-01-01'
}
```

## Debugging Failed Tests

### Common Issues and Solutions

1. **Authentication Tests Failing**
   - Check if mock credentials are properly set in `jest.setup.js`
   - Verify fetch mock is returning expected response structure

2. **Component Tests Failing**
   - Ensure `@testing-library/jest-dom` is imported
   - Check if async operations are properly awaited
   - Verify mock fetch responses match expected format

3. **Integration Tests Failing**
   - Check if Next.js request/response mocks are properly configured
   - Verify service mocks return expected data structure

### Running Single Test File
```bash
# Run specific test file
npx jest lib/services/__tests__/net2phone.test.ts

# Run with verbose output
npx jest --verbose

# Run with debugging
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

## Continuous Integration

### GitHub Actions Workflow (Future Implementation)
```yaml
name: Test Stage 1
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:stage1
      - run: npm run test:coverage
```

## Test Maintenance

### When to Update Tests

1. **API Changes**: Update mocks when Net2Phone API changes
2. **Schema Changes**: Update test data when CallRecord interface changes
3. **New Features**: Add tests for new functionality
4. **Bug Fixes**: Add regression tests for fixed bugs

### Best Practices

1. **Keep Tests Isolated**: Each test should be independent
2. **Use Meaningful Names**: Test names should describe what they test
3. **Mock External Services**: Never make real API calls in tests
4. **Test Edge Cases**: Include tests for error conditions
5. **Maintain Test Data**: Keep test data realistic and up-to-date

## Next Steps

After Stage 1 tests pass, you can:
1. Run the actual pipeline with real credentials
2. Monitor test coverage reports
3. Add integration tests with other stages
4. Set up CI/CD pipeline
5. Add performance tests for large datasets

---
*Last Updated: January 2, 2025*