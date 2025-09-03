"use client"

import { useState } from 'react';
import { Stage1GetCalls } from '@/components/pipeline/stage1-get-calls';
import { Stage2DownloadAudio } from '@/components/pipeline/stage2-download-audio';
import { Stage3TranscribeAudio } from '@/components/pipeline/stage3-transcribe-audio';
import { CallRecord, DownloadResult } from '@/lib/types/pipeline';

export default function Home() {
  const [stage1Calls, setStage1Calls] = useState<CallRecord[]>([]);
  const [stage2Downloads, setStage2Downloads] = useState<DownloadResult[]>([]);
  const [stage3Transcripts, setStage3Transcripts] = useState<any[]>([]);

  return (
    <main className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Call Center Analytics Pipeline</h1>
          <p className="text-muted-foreground mt-2">
            Automated pipeline for processing mortgage broker calls
          </p>
        </div>
        
        <Stage1GetCalls onCallsFetched={setStage1Calls} />
        <Stage2DownloadAudio 
          calls={stage1Calls} 
          onDownloadComplete={setStage2Downloads}
        />
        <Stage3TranscribeAudio 
          downloadedFiles={stage2Downloads}
          onTranscriptionComplete={setStage3Transcripts}
        />
      </div>
    </main>
  );
}
