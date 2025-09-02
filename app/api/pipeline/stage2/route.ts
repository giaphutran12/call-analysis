import { NextRequest, NextResponse } from 'next/server';
import { AudioDownloadService } from '@/lib/services/audio-download';
import { CallRecord } from '@/lib/types/pipeline';
import path from 'path';
import fs from 'fs';

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
      batchDelayMs = 20000
    } = body;

    if (!calls || !Array.isArray(calls) || calls.length === 0) {
      return NextResponse.json(
        { error: 'Calls array is required' },
        { status: 400 }
      );
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Net2Phone credentials are required' },
        { status: 400 }
      );
    }

    // Create output directory if it doesn't exist
    const audioOutputDir = outputDir || path.join(process.cwd(), 'output', 'audio');
    if (!fs.existsSync(audioOutputDir)) {
      fs.mkdirSync(audioOutputDir, { recursive: true });
    }

    const service = new AudioDownloadService({
      clientId,
      clientSecret,
      baseUrl
    });

    // Filter calls that are eligible for download
    const eligibleCalls = service.filterCallsForDownload(calls, minDuration);

    const stats = {
      totalCalls: calls.length,
      eligibleCalls: eligibleCalls.length,
      skippedNoRecording: 0,
      skippedTooShort: 0,
      skippedNoCallId: 0,
    };

    // Calculate skip reasons
    calls.forEach(call => {
      if (!call.call_id) stats.skippedNoCallId++;
      else if (call.duration < minDuration) stats.skippedTooShort++;
      else if (!call.recording_url || !call.recording_url.trim()) stats.skippedNoRecording++;
    });

    // Download the eligible calls
    const downloadResults = await service.downloadBatch(
      eligibleCalls,
      audioOutputDir,
      {
        batchSize,
        delayMs: batchDelayMs,
      }
    );

    // Process results
    const successful: any[] = [];
    const failed: any[] = [];

    downloadResults.forEach((result, callId) => {
      const call = eligibleCalls.find(c => c.call_id === callId);
      if (result) {
        successful.push({
          ...call,
          ...result
        });
      } else {
        failed.push({
          call_id: callId,
          broker_id: call?.broker_id,
          error: 'Download failed'
        });
      }
    });

    return NextResponse.json({
      success: true,
      stats,
      summary: {
        attempted: eligibleCalls.length,
        successful: successful.length,
        failed: failed.length,
        successRate: eligibleCalls.length > 0 
          ? Math.round((successful.length / eligibleCalls.length) * 100) 
          : 0
      },
      downloads: successful,
      failures: failed
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