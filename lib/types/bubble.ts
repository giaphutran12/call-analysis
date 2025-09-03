// Types for Stage 4: Upload Audio to Bubble

export interface BubbleUploadConfig {
  apiToken: string;
  audioUrl: string;
  timeout?: number;
}

export interface AudioFileToUpload {
  filepath: string;
  filename: string;
  call_id: string;
  broker_id: string;
  size?: number;
  metadata?: CallMetadata;
}

export interface CallMetadata {
  from_number?: string;
  to_number?: string;
  from_name?: string;
  start_time?: string;
  duration?: number;
  date?: string;
}

export interface BubbleUploadResult {
  call_id: string;
  broker_id: string;
  filename: string;
  fileUrl: string;
  success: boolean;
  error?: string;
  uploadedAt?: string;
}

export interface UploadProgress {
  call_id: string;
  broker_id: string;
  filename: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  fileUrl?: string;
  error?: string;
}

export interface UploadBatchResult {
  totalFiles: number;
  successful: number;
  failed: number;
  skipped: number;
  results: BubbleUploadResult[];
  uploadMappings: Array<{
    broker_id: string;
    call_id: string;
    file_url: string;
  }>;
}

export interface BubbleResponse {
  url?: string;
  file_url?: string;
  location?: string;
  audio_url?: string;
  id?: string;
  status?: string;
  error?: string;
}