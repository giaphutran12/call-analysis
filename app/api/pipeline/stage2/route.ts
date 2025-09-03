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
      baseUrl,
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

    // Create output directory if it doesn't exist
    const audioOutputDir = outputDir || path.join(process.cwd(), 'output', 'audio');
    if (!fs.existsSync(audioOutputDir)) {
      fs.mkdirSync(audioOutputDir, { recursive: true });
    }

    const service = new AudioDownloadService({
      clientId: finalClientId,
      clientSecret: finalClientSecret,
      baseUrl
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