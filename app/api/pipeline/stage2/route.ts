import { NextRequest, NextResponse } from 'next/server';
import { AudioDownloadService } from '@/lib/services/audio-download';
import { CallRecord } from '@/lib/types/pipeline';
import path from 'path';
import fs from 'fs';
import { getNet2PhoneCredentials } from '@/lib/config/env-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      calls, 
      clientId, 
      clientSecret,
      baseUrl: requestedBaseUrl,
      outputDir,
      minDuration = 15,
      batchSize = 4,
      batchDelay = 20000
    } = body;

    // Use provided credentials or fall back to environment variables
    let finalClientId = clientId;
    let finalClientSecret = clientSecret;

    if (!clientId || !clientSecret) {
      try {
        const envCreds = getNet2PhoneCredentials();
        finalClientId = finalClientId || envCreds.clientId;
        finalClientSecret = finalClientSecret || envCreds.clientSecret;
      } catch (error) {
        return NextResponse.json(
          { 
            error: 'API Configuration Error',
            message: error instanceof Error ? error.message : 'Missing Net2Phone credentials',
            required: ['NET2PHONE_CLIENT_ID', 'NET2PHONE_CLIENT_SECRET'],
            help: 'Please provide credentials in the request body or set environment variables',
            stage: 'Stage 2 - Download Audio'
          },
          { status: 400 }
        );
      }
    }

    if (!calls || !Array.isArray(calls)) {
      return NextResponse.json(
        { error: 'Calls array is required' },
        { status: 400 }
      );
    }

    if (calls.length === 0) {
      return NextResponse.json(
        { error: 'No calls provided' },
        { status: 400 }
      );
    }

    // Create output directory with security constraints
    const baseOutputDir = path.resolve(process.cwd(), 'output', 'audio');
    let audioOutputDir = baseOutputDir;
    
    // If outputDir is provided, validate it's within safe boundaries
    if (outputDir) {
      const requestedOutputDir = path.resolve(String(outputDir));
      
      // Ensure the requested directory is within our base output directory
      if (!requestedOutputDir.startsWith(baseOutputDir)) {
        return NextResponse.json(
          { 
            error: 'Invalid output directory',
            detail: 'Output directory must be within the output/audio folder'
          },
          { status: 400 }
        );
      }
      
      audioOutputDir = requestedOutputDir;
    }
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(audioOutputDir)) {
      fs.mkdirSync(audioOutputDir, { recursive: true });
    }

    // Validate and sanitize baseUrl to prevent SSRF attacks
    const defaultBaseUrl = process.env.NET2PHONE_BASE_URL || 'https://integrate.versature.com';
    let safeBaseUrl = defaultBaseUrl;
    
    if (requestedBaseUrl) {
      try {
        const requestedUrl = new URL(String(requestedBaseUrl));
        
        // Define allowed hosts (whitelist approach)
        const allowedHosts = new Set([
          'integrate.versature.com',
          'api.net2phone.com',
          'api.versature.com',
          // Only allow localhost in development
          ...(process.env.NODE_ENV === 'development' ? ['localhost', '127.0.0.1'] : [])
        ]);
        
        // Check if the host is in the allowed list
        if (!allowedHosts.has(requestedUrl.hostname)) {
          return NextResponse.json(
            { 
              error: 'Invalid base URL',
              detail: 'The provided base URL is not in the allowed list of hosts'
            },
            { status: 400 }
          );
        }
        
        // Ensure HTTPS in production (allow HTTP only for localhost in dev)
        if (process.env.NODE_ENV === 'production' && requestedUrl.protocol !== 'https:') {
          return NextResponse.json(
            { 
              error: 'Invalid base URL',
              detail: 'HTTPS is required for production environments'
            },
            { status: 400 }
          );
        }
        
        // Block potential SSRF targets
        const blockedPorts = [22, 3306, 5432, 6379, 27017, 9200]; // SSH, MySQL, PostgreSQL, Redis, MongoDB, Elasticsearch
        if (blockedPorts.includes(parseInt(requestedUrl.port))) {
          return NextResponse.json(
            { 
              error: 'Invalid base URL',
              detail: 'Access to this port is not allowed'
            },
            { status: 400 }
          );
        }
        
        // If all checks pass, use the requested URL (without trailing slash)
        safeBaseUrl = requestedUrl.toString().replace(/\/$/, '');
        
      } catch (error) {
        // If URL parsing fails, reject the request
        return NextResponse.json(
          { 
            error: 'Invalid base URL',
            detail: 'The provided base URL is malformed'
          },
          { status: 400 }
        );
      }
    }

    const service = new AudioDownloadService({
      clientId: finalClientId,
      clientSecret: finalClientSecret,
      baseUrl: safeBaseUrl
    });

    // Filter calls that are eligible for download
    const filterResult = service.filterCallsForDownload(calls, minDuration);

    const stats = {
      totalCalls: calls.length,
      eligibleCalls: filterResult.eligible.length,
      skippedNoRecording: filterResult.skippedNoRecording,
      skippedTooShort: filterResult.skippedTooShort,
      skippedNoCallId: filterResult.skippedNoCallId,
    };

    // Download the eligible calls
    const downloadResults = await service.downloadBatch(
      filterResult.eligible,
      audioOutputDir,
      {
        batchSize,
        batchDelay,
      }
    );

    return NextResponse.json({
      message: 'Audio download completed',
      stats,
      summary: {
        attempted: filterResult.eligible.length,
        successful: downloadResults.successful.length,
        failed: downloadResults.failed.length,
        successRate: filterResult.eligible.length > 0 
          ? Math.round((downloadResults.successful.length / filterResult.eligible.length) * 100) 
          : 0
      },
      downloads: downloadResults.successful,
      failures: downloadResults.failed
    });

  } catch (error) {
    console.error('Error in Stage 2 API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Stream endpoint for progress updates
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"status": "ready"}\n\n'));
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}