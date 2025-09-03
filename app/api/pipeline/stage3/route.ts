import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAIService } from '@/lib/services/assemblyai';
import { TranscriptionFile, TranscriptionProgress } from '@/lib/types/pipeline';
import path from 'path';
import fs from 'fs';
import { getAssemblyAIKey } from '@/lib/config/env-validation';

// Store progress for SSE
const progressMap = new Map<string, TranscriptionProgress[]>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, audioFiles, concurrentLimit = 3 } = body;

    // Use provided API key or fall back to environment variable
    let finalApiKey = apiKey;
    
    if (!apiKey) {
      try {
        finalApiKey = getAssemblyAIKey();
      } catch (error) {
        return NextResponse.json(
          { 
            error: 'API Configuration Error',
            message: error instanceof Error ? error.message : 'Missing AssemblyAI API key',
            required: ['ASSEMBLYAI_API_KEY'],
            help: 'Please provide API key in the request body or set ASSEMBLYAI_API_KEY environment variable',
            stage: 'Stage 3 - Transcribe Audio',
            documentation: 'https://www.assemblyai.com/docs'
          },
          { status: 400 }
        );
      }
    }

    if (!audioFiles || audioFiles.length === 0) {
      return NextResponse.json(
        { error: 'No audio files provided for transcription' },
        { status: 400 }
      );
    }

    // Validate all filenames to prevent path traversal and enforce safe patterns
    for (const file of audioFiles) {
      const filename = String(file?.filename ?? '');
      
      // Check for valid filename pattern (alphanumeric, underscore, hyphen, dot, must end with .wav)
      if (!filename || !/^[A-Za-z0-9._-]+\.wav$/i.test(filename)) {
        return NextResponse.json(
          { 
            error: 'Invalid filename format',
            detail: `Filename must contain only letters, numbers, dots, underscores, hyphens and end with .wav: ${filename}`
          },
          { status: 400 }
        );
      }
      
      // Check for path traversal attempts
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json(
          { 
            error: 'Invalid filename - path traversal detected',
            detail: `Filename cannot contain path separators or ".."": ${filename}`
          },
          { status: 400 }
        );
      }
    }

    const sessionId = Date.now().toString();
    progressMap.set(sessionId, []);

    // Initialize AssemblyAI service
    const assemblyAI = new AssemblyAIService(finalApiKey);

    // Setup directories
    const baseDir = process.cwd();
    const audioDir = path.join(baseDir, 'output', 'audio');
    const transcriptsDir = path.join(baseDir, 'output', 'transcripts');
    const rawTranscriptsDir = path.join(transcriptsDir, 'raw');

    // Create directories if they don't exist
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    if (!fs.existsSync(rawTranscriptsDir)) {
      fs.mkdirSync(rawTranscriptsDir, { recursive: true });
    }

    // Prepare transcription files with sanitized filenames
    const filesToTranscribe: TranscriptionFile[] = audioFiles.map((file: any) => {
      // Use path.basename to ensure we only get the filename, no directory parts
      const safeFilename = path.basename(String(file.filename));
      const parts = safeFilename.replace(/\.wav$/i, '').split('_');
      const brokerId = parts[0];
      const callId = parts.slice(1).join('_');
      
      return {
        filepath: path.join(audioDir, safeFilename),
        filename: safeFilename,
        broker_id: brokerId,
        call_id: callId,
        transcriptFile: path.join(transcriptsDir, `${brokerId}_${callId}.txt`),
        rawTranscriptFile: path.join(rawTranscriptsDir, `${brokerId}_${callId}.json`),
      };
    });

    // Filter out already transcribed files
    const pendingFiles = filesToTranscribe.filter(file => !fs.existsSync(file.transcriptFile));

    if (pendingFiles.length === 0) {
      return NextResponse.json({
        sessionId,
        message: 'All files already transcribed',
        totalFiles: audioFiles.length,
        transcribedFiles: audioFiles.length,
        pendingFiles: 0,
        results: [],
      });
    }

    // Process transcriptions with progress tracking
    const results = await assemblyAI.transcribeBatch(
      pendingFiles,
      concurrentLimit,
      (completed, total, current) => {
        const progress: TranscriptionProgress = {
          call_id: current.split('_').slice(1).join('_'),
          broker_id: current.split('_')[0],
          filename: current,
          status: completed === total ? 'completed' : 'transcribing',
          progress: (completed / total) * 100,
        };
        
        const sessionProgress = progressMap.get(sessionId) || [];
        sessionProgress.push(progress);
        progressMap.set(sessionId, sessionProgress);
      }
    );

    // Calculate statistics
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Clean up progress after completion
    setTimeout(() => progressMap.delete(sessionId), 60000);

    return NextResponse.json({
      sessionId,
      message: 'Transcription completed',
      totalFiles: audioFiles.length,
      transcribedFiles: pendingFiles.length,
      alreadyTranscribed: audioFiles.length - pendingFiles.length,
      successful,
      failed,
      results,
      transcripts: pendingFiles.map(file => ({
        call_id: file.call_id,
        broker_id: file.broker_id,
        filename: file.filename,
        transcriptPath: file.transcriptFile,
        rawTranscriptPath: file.rawTranscriptFile,
      })),
    });

  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// SSE endpoint for progress updates
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSentCount = 0;
      
      const interval = setInterval(() => {
        const progress = progressMap.get(sessionId) || [];
        
        if (progress.length > lastSentCount) {
          const newProgress = progress.slice(lastSentCount);
          lastSentCount = progress.length;
          
          const data = encoder.encode(`data: ${JSON.stringify(newProgress)}\n\n`);
          controller.enqueue(data);
        }
        
        // Check if session is complete
        if (!progressMap.has(sessionId)) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Clean up on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}