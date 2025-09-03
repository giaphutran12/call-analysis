import { NextResponse } from 'next/server';
import { getConfiguredAPIs, validateEnvForAPI } from '@/lib/config/env-validation';

export async function GET() {
  const configured = getConfiguredAPIs();
  
  const stage1Validation = validateEnvForAPI('stage1');
  const stage2Validation = validateEnvForAPI('stage2'); // Uses same as stage1
  const stage3Validation = validateEnvForAPI('stage3');
  
  const stages = [
    {
      stage: 1,
      name: 'Get Call IDs',
      service: 'Net2Phone',
      configured: configured.net2phone,
      validation: stage1Validation,
      requiredVars: ['NET2PHONE_CLIENT_ID', 'NET2PHONE_CLIENT_SECRET'],
      status: stage1Validation.success ? 'ready' : 'missing_credentials'
    },
    {
      stage: 2,
      name: 'Download Audio',
      service: 'Net2Phone',
      configured: configured.net2phone,
      validation: stage2Validation,
      requiredVars: ['NET2PHONE_CLIENT_ID', 'NET2PHONE_CLIENT_SECRET'],
      status: stage2Validation.success ? 'ready' : 'missing_credentials'
    },
    {
      stage: 3,
      name: 'Transcribe Audio',
      service: 'AssemblyAI',
      configured: configured.assemblyai,
      validation: stage3Validation,
      requiredVars: ['ASSEMBLYAI_API_KEY'],
      status: stage3Validation.success ? 'ready' : 'missing_credentials'
    }
  ];
  
  const allConfigured = stages.every(s => s.configured);
  const missingStages = stages.filter(s => !s.configured);
  
  return NextResponse.json({
    success: allConfigured,
    message: allConfigured 
      ? 'All API keys are configured correctly' 
      : `Missing API keys for ${missingStages.length} stage(s)`,
    stages,
    summary: {
      totalStages: stages.length,
      configuredStages: stages.filter(s => s.configured).length,
      missingStages: missingStages.length,
      readyToRun: allConfigured
    },
    help: !allConfigured ? {
      message: 'To configure missing API keys, add them to your .env.local file:',
      example: {
        NET2PHONE_CLIENT_ID: 'your_client_id_here',
        NET2PHONE_CLIENT_SECRET: 'your_client_secret_here',
        ASSEMBLYAI_API_KEY: 'your_api_key_here'
      },
      documentation: {
        net2phone: 'https://www.net2phone.com/platform/developers',
        assemblyai: 'https://www.assemblyai.com/docs'
      }
    } : undefined
  });
}