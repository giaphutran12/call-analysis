import { z } from 'zod';

// Define the environment variable schema
const envSchema = z.object({
  // Stage 1 - Net2Phone API credentials
  NET2PHONE_CLIENT_ID: z.string({
    required_error: 'NET2PHONE_CLIENT_ID is required for Stage 1 (Get Call IDs)',
    invalid_type_error: 'NET2PHONE_CLIENT_ID must be a string',
  }).min(1, 'NET2PHONE_CLIENT_ID cannot be empty'),
  
  NET2PHONE_CLIENT_SECRET: z.string({
    required_error: 'NET2PHONE_CLIENT_SECRET is required for Stage 1 (Get Call IDs)',
    invalid_type_error: 'NET2PHONE_CLIENT_SECRET must be a string',
  }).min(1, 'NET2PHONE_CLIENT_SECRET cannot be empty'),
  
  // Stage 3 - AssemblyAI API key
  ASSEMBLYAI_API_KEY: z.string({
    required_error: 'ASSEMBLYAI_API_KEY is required for Stage 3 (Transcribe Audio)',
    invalid_type_error: 'ASSEMBLYAI_API_KEY must be a string',
  }).min(1, 'ASSEMBLYAI_API_KEY cannot be empty'),
  
  // Optional: Stage 4 & 5 - If you have other APIs
  // OPENAI_API_KEY: z.string().optional(),
  // DATABASE_URL: z.string().optional(),
});

// Partial schemas for specific stages
export const stage1EnvSchema = z.object({
  NET2PHONE_CLIENT_ID: envSchema.shape.NET2PHONE_CLIENT_ID,
  NET2PHONE_CLIENT_SECRET: envSchema.shape.NET2PHONE_CLIENT_SECRET,
});

export const stage2EnvSchema = stage1EnvSchema; // Stage 2 uses same credentials as Stage 1

export const stage3EnvSchema = z.object({
  ASSEMBLYAI_API_KEY: envSchema.shape.ASSEMBLYAI_API_KEY,
});

// Types
export type EnvConfig = z.infer<typeof envSchema>;
export type Stage1EnvConfig = z.infer<typeof stage1EnvSchema>;
export type Stage3EnvConfig = z.infer<typeof stage3EnvSchema>;

// Validation functions
export function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => ({
        variable: err.path.join('.'),
        message: err.message,
      }));
      
      console.error('❌ Environment validation failed:');
      console.error('Missing or invalid environment variables:');
      missingVars.forEach(({ variable, message }) => {
        console.error(`  - ${variable}: ${message}`);
      });
      
      throw new Error(
        `Environment validation failed. Missing variables: ${missingVars.map(v => v.variable).join(', ')}`
      );
    }
    throw error;
  }
}

export function validateStage1Env(): Stage1EnvConfig {
  try {
    return stage1EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Stage 1 configuration error: ${errors.join(', ')}`);
    }
    throw error;
  }
}

export function validateStage3Env(): Stage3EnvConfig {
  try {
    return stage3EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Stage 3 configuration error: ${errors.join(', ')}`);
    }
    throw error;
  }
}

// Safe getters with detailed error messages
export function getNet2PhoneCredentials() {
  const clientId = process.env.NET2PHONE_CLIENT_ID;
  const clientSecret = process.env.NET2PHONE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push('NET2PHONE_CLIENT_ID');
    if (!clientSecret) missing.push('NET2PHONE_CLIENT_SECRET');
    
    throw new Error(
      `Missing Net2Phone API credentials: ${missing.join(', ')}. ` +
      `Please set these environment variables in your .env.local file.`
    );
  }
  
  return { clientId, clientSecret };
}

export function getAssemblyAIKey() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'Missing AssemblyAI API key: ASSEMBLYAI_API_KEY. ' +
      'Please set this environment variable in your .env.local file. ' +
      'You can get an API key from https://www.assemblyai.com/'
    );
  }
  
  return apiKey;
}

// Check which APIs are configured
export function getConfiguredAPIs() {
  return {
    net2phone: !!(process.env.NET2PHONE_CLIENT_ID && process.env.NET2PHONE_CLIENT_SECRET),
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
  };
}

// Validation with custom error formatting for API responses
export function validateEnvForAPI(stage: 'stage1' | 'stage2' | 'stage3') {
  try {
    switch (stage) {
      case 'stage1':
      case 'stage2':
        return { success: true, data: validateStage1Env() };
      case 'stage3':
        return { success: true, data: validateStage3Env() };
      default:
        return { success: false, error: 'Invalid stage specified' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Environment validation failed',
      details: error instanceof z.ZodError ? error.format() : undefined,
    };
  }
}