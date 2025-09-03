"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw,
  Key,
  FileText,
  ExternalLink
} from 'lucide-react';

interface StageValidation {
  stage: number;
  name: string;
  service: string;
  configured: boolean;
  requiredVars: string[];
  status: string;
}

interface ValidationResponse {
  success: boolean;
  message: string;
  stages: StageValidation[];
  summary: {
    totalStages: number;
    configuredStages: number;
    missingStages: number;
    readyToRun: boolean;
  };
  help?: {
    message: string;
    example: Record<string, string>;
    documentation: Record<string, string>;
  };
}

export function ApiValidationStatus() {
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/pipeline/validate');
      if (!response.ok) throw new Error('Failed to check validation');
      const data = await response.json();
      setValidation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkValidation();
  }, []);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Checking API configuration...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="link" onClick={checkValidation} className="ml-2 p-0">
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!validation) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Configuration Status
            </CardTitle>
            <CardDescription>{validation.message}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkValidation}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{validation.summary.totalStages}</div>
            <div className="text-sm text-muted-foreground">Total Stages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {validation.summary.configuredStages}
            </div>
            <div className="text-sm text-muted-foreground">Configured</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {validation.summary.missingStages}
            </div>
            <div className="text-sm text-muted-foreground">Missing</div>
          </div>
        </div>

        {/* Stage Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Pipeline Stages</h3>
          {validation.stages.map((stage) => (
            <div key={stage.stage} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {stage.configured ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">Stage {stage.stage}</span>
                </div>
                <div>
                  <span className="text-sm">{stage.name}</span>
                  <Badge variant="outline" className="ml-2">
                    {stage.service}
                  </Badge>
                </div>
              </div>
              <Badge variant={stage.configured ? "success" : "destructive"}>
                {stage.status.replace('_', ' ')}
              </Badge>
            </div>
          ))}
        </div>

        {/* Help Section */}
        {validation.help && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Required</AlertTitle>
            <AlertDescription className="space-y-3 mt-2">
              <p>{validation.help.message}</p>
              
              <div className="bg-muted p-3 rounded-md font-mono text-xs">
                <div className="mb-2 text-muted-foreground"># .env.local</div>
                {Object.entries(validation.help.example).map(([key, value]) => (
                  <div key={key}>
                    {key}={value}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {Object.entries(validation.help.documentation).map(([service, url]) => (
                  <Button key={service} variant="outline" size="sm" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 mr-2" />
                      {service} Docs
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </a>
                  </Button>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Success Message */}
        {validation.success && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Ready to Run</AlertTitle>
            <AlertDescription className="text-green-700">
              All API keys are configured correctly. You can run the complete pipeline.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}