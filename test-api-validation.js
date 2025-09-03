#!/usr/bin/env node

/**
 * Test script to verify API key validation
 * Run with: node test-api-validation.js
 */

const baseUrl = 'http://localhost:3000/api/pipeline';

console.log('🔍 Testing API Key Validation System\n');
console.log('=====================================\n');

// Test validation endpoint
async function testValidationEndpoint() {
  console.log('1️⃣  Testing validation status endpoint...');
  try {
    const response = await fetch(`${baseUrl}/validate`);
    const data = await response.json();
    
    console.log('\n📋 Validation Status:');
    console.log(`   Overall: ${data.success ? '✅ Ready' : '❌ Missing Keys'}`);
    console.log(`   Message: ${data.message}`);
    
    console.log('\n📊 Stage Status:');
    data.stages.forEach(stage => {
      const icon = stage.configured ? '✅' : '❌';
      console.log(`   Stage ${stage.stage} (${stage.name}): ${icon} ${stage.status}`);
      if (!stage.configured) {
        console.log(`     Required: ${stage.requiredVars.join(', ')}`);
      }
    });
    
    if (data.help) {
      console.log('\n💡 How to fix:');
      console.log(`   ${data.help.message}`);
      console.log('\n   Example .env.local:');
      Object.entries(data.help.example).forEach(([key, value]) => {
        console.log(`   ${key}=${value}`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to test validation endpoint:', error.message);
  }
}

// Test Stage 1 with missing credentials
async function testStage1MissingCreds() {
  console.log('\n2️⃣  Testing Stage 1 with missing credentials...');
  try {
    const response = await fetch(`${baseUrl}/stage1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: '2024-01-01',
        endDate: '2024-01-02'
        // Deliberately not providing clientId and clientSecret
      })
    });
    
    const data = await response.json();
    
    if (response.status === 400 && data.error === 'API Configuration Error') {
      console.log('   ✅ Correctly rejected with detailed error:');
      console.log(`      ${data.message}`);
      console.log(`      Required: ${data.required.join(', ')}`);
      console.log(`      Help: ${data.help}`);
    } else {
      console.log('   ❌ Unexpected response:', data);
    }
  } catch (error) {
    console.error('   ❌ Failed to test Stage 1:', error.message);
  }
}

// Test Stage 2 with missing credentials
async function testStage2MissingCreds() {
  console.log('\n3️⃣  Testing Stage 2 with missing credentials...');
  try {
    const response = await fetch(`${baseUrl}/stage2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calls: [{ call_id: 'test' }]
        // Deliberately not providing credentials
      })
    });
    
    const data = await response.json();
    
    if (response.status === 400 && data.error === 'API Configuration Error') {
      console.log('   ✅ Correctly rejected with detailed error:');
      console.log(`      ${data.message}`);
      console.log(`      Stage: ${data.stage}`);
    } else {
      console.log('   ❌ Unexpected response:', data);
    }
  } catch (error) {
    console.error('   ❌ Failed to test Stage 2:', error.message);
  }
}

// Test Stage 3 with missing API key
async function testStage3MissingKey() {
  console.log('\n4️⃣  Testing Stage 3 with missing API key...');
  try {
    const response = await fetch(`${baseUrl}/stage3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioFiles: [{ filename: 'test.wav' }]
        // Deliberately not providing apiKey
      })
    });
    
    const data = await response.json();
    
    if (response.status === 400 && data.error === 'API Configuration Error') {
      console.log('   ✅ Correctly rejected with detailed error:');
      console.log(`      ${data.message}`);
      console.log(`      Documentation: ${data.documentation}`);
    } else {
      console.log('   ❌ Unexpected response:', data);
    }
  } catch (error) {
    console.error('   ❌ Failed to test Stage 3:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting tests...\n');
  console.log('Make sure the Next.js server is running on http://localhost:3000\n');
  
  await testValidationEndpoint();
  await testStage1MissingCreds();
  await testStage2MissingCreds();
  await testStage3MissingKey();
  
  console.log('\n=====================================');
  console.log('✅ All validation tests completed!\n');
  
  console.log('📝 Summary:');
  console.log('   - Validation endpoint provides clear status');
  console.log('   - Missing credentials return detailed errors');
  console.log('   - Each stage identifies required variables');
  console.log('   - Help messages guide configuration\n');
}

// Run the tests
runTests().catch(console.error);