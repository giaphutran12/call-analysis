"use client"

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Download, 
  AlertCircle, 
  CheckCircle, 
  FileAudio,
  Clock,
  Filter,
  HardDrive
} from 'lucide-react';
import { CallRecord } from '@/lib/types/pipeline';

interface DownloadStats {
  totalCalls: number;
  eligibleCalls: number;
  skippedNoRecording: number;
  skippedTooShort: number;
  skippedNoCallId: number;
}

interface DownloadSummary {
  attempted: number;
  successful: number;
  failed: number;
  successRate: number;
}

export function Stage2DownloadAudio({ calls = [] }: { calls?: CallRecord[] }) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DownloadStats | null>(null);
  const [summary, setSummary] = useState<DownloadSummary | null>(null);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [config, setConfig] = useState({
    clientId: '',
    clientSecret: '',
    baseUrl: 'https://integrate.versature.com',
    minDuration: 15,
    batchSize: 4,
    batchDelayMs: 20000,
  });

  const handleInputChange = (field: string, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleExecute = async () => {
    if (calls.length === 0) {
      setError('No calls available. Please run Stage 1 first to fetch call IDs.');
      return;
    }

    setIsLoading(true);
    setStatus('running');
    setError(null);
    setProgress(0);
    setStats(null);
    setSummary(null);
    setDownloads([]);
    setFailures([]);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90));
      }, 1000);

      const response = await fetch('/api/pipeline/stage2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calls,
          ...config
        }),
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute stage 2');
      }

      setStats(data.stats);
      setSummary(data.summary);
      setDownloads(data.downloads || []);
      setFailures(data.failures || []);
      setStatus('completed');
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileAudio className="h-5 w-5" />
              Stage 2: Download Audio Recordings
            </CardTitle>
            <CardDescription>
              Download audio files from Net2Phone for transcription
            </CardDescription>
          </div>
          <Badge variant={status === 'completed' ? 'default' : status === 'error' ? 'destructive' : 'secondary'}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Configuration */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                type="password"
                placeholder="Enter Net2Phone Client ID"
                value={config.clientId}
                onChange={(e) => handleInputChange('clientId', e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                placeholder="Enter Net2Phone Client Secret"
                value={config.clientSecret}
                onChange={(e) => handleInputChange('clientSecret', e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minDuration" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Min Duration (seconds)
              </Label>
              <Input
                id="minDuration"
                type="number"
                value={config.minDuration}
                onChange={(e) => handleInputChange('minDuration', parseInt(e.target.value))}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batchSize" className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                Batch Size
              </Label>
              <Input
                id="batchSize"
                type="number"
                value={config.batchSize}
                onChange={(e) => handleInputChange('batchSize', parseInt(e.target.value))}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batchDelayMs" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Batch Delay (ms)
              </Label>
              <Input
                id="batchDelayMs"
                type="number"
                value={config.batchDelayMs}
                onChange={(e) => handleInputChange('batchDelayMs', parseInt(e.target.value))}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Input Stats */}
        {calls.length > 0 && (
          <Alert>
            <Filter className="h-4 w-4" />
            <AlertDescription>
              {calls.length} calls available from Stage 1
            </AlertDescription>
          </Alert>
        )}

        {/* Progress */}
        {status === 'running' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Downloading audio files...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Calls</p>
              <p className="text-2xl font-bold">{stats.totalCalls}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Eligible</p>
              <p className="text-2xl font-bold text-green-600">{stats.eligibleCalls}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">No Recording</p>
              <p className="text-2xl font-bold text-orange-600">{stats.skippedNoRecording}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Too Short</p>
              <p className="text-2xl font-bold text-orange-600">{stats.skippedTooShort}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">No Call ID</p>
              <p className="text-2xl font-bold text-red-600">{stats.skippedNoCallId}</p>
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && status === 'completed' && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              Successfully downloaded {summary.successful} of {summary.attempted} audio files 
              ({summary.successRate}% success rate)
            </AlertDescription>
          </Alert>
        )}

        {/* Execute Button */}
        <Button 
          onClick={handleExecute} 
          disabled={isLoading || calls.length === 0 || !config.clientId || !config.clientSecret}
          className="w-full"
        >
          {isLoading ? 'Downloading...' : `Download Audio (${calls.length} calls)`}
        </Button>

        {/* Results Tabs */}
        {(downloads.length > 0 || failures.length > 0) && (
          <Tabs defaultValue="downloads" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="downloads">
                Downloads ({downloads.length})
              </TabsTrigger>
              <TabsTrigger value="failures">
                Failures ({failures.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="downloads">
              <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                <div className="space-y-2">
                  {downloads.map((download, index) => (
                    <div key={index} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{download.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            Call ID: {download.call_id} | Broker: {download.broker_id}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {formatFileSize(download.size)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="failures">
              <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                <div className="space-y-2">
                  {failures.map((failure, index) => (
                    <div key={index} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <div>
                        <p className="text-sm font-medium">Call ID: {failure.call_id}</p>
                        <p className="text-xs text-muted-foreground">
                          Broker: {failure.broker_id} | Error: {failure.error}
                        </p>
                      </div>
                      <Badge variant="destructive">Failed</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}