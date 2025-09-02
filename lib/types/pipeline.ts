export interface CallRecord {
  call_id: string;
  from_number: string;
  to_number: string;
  from_username: string;
  from_name: string;
  start_time: string;
  duration: number;
  recording_url: string;
  broker_id: string;
  date: string;
}

export interface RecordingInfo {
  status: 'Available' | 'Processing' | 'Failed' | 'NotFound';
  url?: string;
  call_id: string;
  duration?: number;
  file_size?: number;
}

export interface DownloadProgress {
  call_id: string;
  broker_id: string;
  filename: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  size?: number;
  error?: string;
  filePath?: string;
}

export interface DownloadResult {
  filePath: string;
  filename: string;
  size: number;
  call_id: string;
  broker_id: string;
}

export interface Net2PhoneConfig {
  base_url: string;
  token_endpoint: string;
  calls_endpoint: string;
  page_size: number;
  min_duration: number;
}

export interface PipelineConfig {
  execution: {
    start_date: string;
    end_date: string;
    test_limit: number | null;
    batch_size: number;
    concurrent_workers: number;
  };
  api_config: {
    net2phone: Net2PhoneConfig;
  };
  directories: {
    base_dir: string;
    logs_dir: string;
    output_dir: string;
  };
}

export interface StageProgress {
  stage: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  total: number;
  message?: string;
  error?: string;
}

export interface CallLogResponse {
  result: any[];
  count: number;
  next?: string;
}