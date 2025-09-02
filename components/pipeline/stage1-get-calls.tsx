"use client"

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Download, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { CallRecord } from '@/lib/types/pipeline';

interface Stage1Props {
  onCallsFetched?: (calls: CallRecord[]) => void;
}

export function Stage1GetCalls({ onCallsFetched }: Stage1Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [config, setConfig] = useState({
    startDate: '',
    endDate: '',
    clientId: '',
    clientSecret: '',
    baseUrl: 'https://api.net2phone.com',
    tokenEndpoint: '/oauth/token',
    callsEndpoint: '/v1/calls',
    pageSize: 500,
    minDuration: 10,
  });

  const handleInputChange = (field: string, value: string | number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleExecute = async () => {
    setIsLoading(true);
    setStatus('running');
    setError(null);
    setProgress(0);

    try {
      const response = await fetch('/api/pipeline/stage1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute stage 1');
      }

      setResults(data);
      setStatus('completed');
      setProgress(100);
      
      // Pass calls to parent component
      if (onCallsFetched && data.calls) {
        onCallsFetched(data.calls);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadResults = () => {
    if (!results?.calls) return;
    
    const csv = convertToCSV(results.calls);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_ids_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const convertToCSV = (calls: CallRecord[]) => {
    const headers = Object.keys(calls[0] || {}).join(',');
    const rows = calls.map(call => Object.values(call).join(','));
    return [headers, ...rows].join('\n');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Stage 1: Get Call IDs
            </CardTitle>
            <CardDescription>
              Fetch call records from Net2Phone API for the specified date range
            </CardDescription>
          </div>
          <Badge variant={status === 'completed' ? 'default' : status === 'error' ? 'destructive' : 'secondary'}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="startDate"
                type="date"
                className="pl-10"
                value={config.startDate}
                onChange={(e) => handleInputChange('startDate', e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="endDate"
                type="date"
                className="pl-10"
                value={config.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pageSize">Page Size</Label>
            <Input
              id="pageSize"
              type="number"
              value={config.pageSize}
              onChange={(e) => handleInputChange('pageSize', parseInt(e.target.value))}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minDuration">Min Duration (seconds)</Label>
            <Input
              id="minDuration"
              type="number"
              value={config.minDuration}
              onChange={(e) => handleInputChange('minDuration', parseInt(e.target.value))}
              disabled={isLoading}
            />
          </div>
        </div>

        {status === 'running' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Processing...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && status === 'completed' && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              Successfully fetched {results.totalCalls} calls from {results.dateRange.startDate} to {results.dateRange.endDate}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button 
            onClick={handleExecute} 
            disabled={isLoading || !config.startDate || !config.endDate || !config.clientId || !config.clientSecret}
            className="flex-1"
          >
            {isLoading ? 'Processing...' : 'Execute Stage 1'}
          </Button>
          {results?.calls && (
            <Button onClick={downloadResults} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          )}
        </div>

        {results?.results && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Daily Results:</h4>
            <div className="space-y-1">
              {results.results.map((day: any, index: number) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{day.date}</span>
                  <div className="flex items-center gap-2">
                    <span>{day.count} calls</span>
                    <Badge variant={day.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                      {day.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}