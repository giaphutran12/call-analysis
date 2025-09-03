#!/bin/bash

echo "================================"
echo "Running Stage 1 Tests"
echo "================================"
echo ""

echo "1. Testing Net2Phone Service..."
echo "-------------------------------"
npx jest lib/services/__tests__/net2phone.test.ts --passWithNoTests 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ Net2Phone Service tests passed"
else
  echo "❌ Net2Phone Service tests failed"
fi

echo ""
echo "2. Testing API Routes..."
echo "-------------------------------"
npx jest app/api/pipeline/stage1/__tests__/route.test.ts --passWithNoTests 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ API Route tests passed"
else
  echo "❌ API Route tests failed"
fi

echo ""
echo "3. Testing React Components..."
echo "-------------------------------"
npx jest components/pipeline/__tests__/stage1-get-calls.test.tsx --passWithNoTests 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ Component tests passed"
else
  echo "❌ Component tests failed"
fi

echo ""
echo "================================"
echo "Test Summary Complete"
echo "================================"