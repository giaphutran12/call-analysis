'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileAudio, CheckCircle2, XCircle, FileText, Download } from 'lucide-react';
import { DownloadResult } from '@/lib/types/pipeline';

interface Stage3Props {
  downloadedFiles?: DownloadResult[];
  onTranscriptionComplete?: (transcripts: any[]) => void;
}

interface TranscriptionResult {
  file: string;
  success: boolean;
  error?: string;
}

interface TranscriptInfo {
  call_id: string;
  broker_id: string;
  filename: string;
  transcriptPath: string;
  rawTranscriptPath: string;
}

export function Stage3TranscribeAudio({ downloadedFiles = [], onTranscriptionComplete }: Stage3Props) {
  const [apiKey, setApiKey] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [results, setResults] = useState<TranscriptionResult[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [concurrentLimit, setConcurrentLimit] = useState(3);
  const [stats, setStats] = useState({
    total: 0,
    transcribed: 0,
    alreadyTranscribed: 0,
    successful: 0,
    failed: 0,
  });

  // Filter audio files from downloaded files
  const audioFiles = downloadedFiles.map(file => ({
    filename: file.filename,
    call_id: file.call_id,
    broker_id: file.broker_id,
    size: file.size,
  }));

  const startTranscription = async () => {
    if (!apiKey) {
      setError('Please enter your AssemblyAI API key');
      return;
    }

    if (audioFiles.length === 0) {
      setError('No audio files available for transcription');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setResults([]);
    setTranscripts([]);
    setCurrentFile('');

    try {
      // Start transcription
      const response = await fetch('/api/pipeline/stage3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          audioFiles,
          concurrentLimit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Transcription failed');
      }

      // Set results and stats
      setResults(data.results || []);
      setTranscripts(data.transcripts || []);
      setStats({
        total: data.totalFiles,
        transcribed: data.transcribedFiles,
        alreadyTranscribed: data.alreadyTranscribed,
        successful: data.successful,
        failed: data.failed,
      });

      setProgress(100);

      // Pass transcripts to next stage
      if (onTranscriptionComplete && data.transcripts) {
        onTranscriptionComplete(data.transcripts);
      }

      // Start SSE for progress updates
      if (data.sessionId) {
        const eventSource = new EventSource(`/api/pipeline/stage3?sessionId=${data.sessionId}`);
        
        eventSource.onmessage = (event) => {
          const progressData = JSON.parse(event.data);
          if (progressData.length > 0) {
            const latest = progressData[progressData.length - 1];
            setCurrentFile(latest.filename);
            setProgress(latest.progress);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
        };

        // Close after completion
        setTimeout(() => eventSource.close(), 5000);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTranscript = (transcript: TranscriptInfo) => {
    // In a real implementation, this would download the actual transcript file
    const content = `Transcript for Call ID: ${transcript.call_id}\nBroker: ${transcript.broker_id}\nFile: ${transcript.filename}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.broker_id}_${transcript.call_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllTranscripts = () => {
    const csv = [
      ['Call ID', 'Broker ID', 'Filename', 'Status', 'Transcript Path'].join(','),
      ...transcripts.map(t => 
        [t.call_id, t.broker_id, t.filename, 'Completed', t.transcriptPath].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcripts_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Stage 3: Transcribe Audio
        </CardTitle>
        <CardDescription>
          Transcribe audio recordings using AssemblyAI with speaker diarization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assemblyai-key">AssemblyAI API Key</Label>
            <Input
              id="assemblyai-key"
              type="password"
              placeholder="Enter your AssemblyAI API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="concurrent-limit">Concurrent Transcriptions</Label>
              <Input
                id="concurrent-limit"
                type="number"
                min="1"
                max="10"
                value={concurrentLimit}
                onChange={(e) => setConcurrentLimit(parseInt(e.target.value) || 3)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label>Available Audio Files</Label>
              <div className="flex items-center gap-2">
                <FileAudio className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{audioFiles.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Transcribing: {currentFile}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Statistics */}
        {(stats.total > 0 || results.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Files</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Transcribed</p>
              <p className="text-2xl font-bold text-blue-600">{stats.transcribed}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Already Done</p>
              <p className="text-2xl font-bold text-gray-600">{stats.alreadyTranscribed}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Successful</p>
              <p className="text-2xl font-bold text-green-600">{stats.successful}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results Tabs */}
        {results.length > 0 && (
          <Tabs defaultValue="transcripts" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="transcripts">
                Transcripts ({transcripts.length})
              </TabsTrigger>
              <TabsTrigger value="failures">
                Failures ({results.filter(r => !r.success).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcripts">
              <ScrollArea className="h-[300px] w-full rounded-md border">
                <div className="p-4 space-y-2">
                  {transcripts.map((transcript, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="font-medium">{transcript.filename}</p>
                          <p className="text-sm text-muted-foreground">
                            Call: {transcript.call_id} | Broker: {transcript.broker_id}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadTranscript(transcript)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="failures">
              <ScrollArea className="h-[300px] w-full rounded-md border">
                <div className="p-4 space-y-2">
                  {results
                    .filter(r => !r.success)
                    .map((result, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                      >
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium">{result.file}</p>
                          <p className="text-sm text-red-600">{result.error || 'Unknown error'}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={startTranscription}
            disabled={isProcessing || audioFiles.length === 0}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Start Transcription
              </>
            )}
          </Button>
          {transcripts.length > 0 && (
            <Button
              variant="outline"
              onClick={exportAllTranscripts}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}