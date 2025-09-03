import { CallRecord, CallLogResponse } from '@/lib/types/pipeline';

export class Net2PhoneService {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private tokenEndpoint: string;
  private callsEndpoint: string;
  private accessToken: string | null = null;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    tokenEndpoint: string;
    callsEndpoint: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl;
    this.tokenEndpoint = config.tokenEndpoint;
    this.callsEndpoint = config.callsEndpoint;
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if available
    if (this.accessToken) {
      return this.accessToken;
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await fetch(this.baseUrl + this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      return data.access_token;
    } catch (error) {
      throw new Error(`Failed to get access token: ${error}`);
    }
  }

  async getCallLogs(date: string | Date, page: number = 1, pageSize: number = 100, minDuration: number = 15): Promise<CallLogResponse> {
    if (!this.accessToken) {
      this.accessToken = await this.getAccessToken();
    }

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const endDate = new Date(dateObj);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const params = new URLSearchParams({
      start_date: dateObj.toISOString(),
      end_date: endDate.toISOString(),
      page_size: pageSize.toString(),
      min_duration: minDuration.toString(),
    });

    if (page > 1) {
      params.append('page', page.toString());
    }

    const response = await fetch(`${this.baseUrl}${this.callsEndpoint}?${params}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.integrate.v1.10.0+json',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch call logs: ${response.statusText}`);
    }

    return response.json();
  }

  extractRelevantData(calls: any[]): CallRecord[] {
    return calls.map(entry => {
      const from = entry.from || {};
      const to = entry.to || {};
      const recording = entry.recording?.url || '';

      // Get broker_id from from_name (first 3 letters, lowercase)
      let brokerId = '';
      const fromName = from.name || from.username || '';
      if (fromName) {
        brokerId = fromName.toLowerCase().substring(0, 3);
      }

      return {
        call_id: entry.call_id || '',
        from_number: from.number || '',
        to_number: to.number || '',
        from_username: from.username || '',
        from_name: fromName,
        start_time: entry.start_time || '',
        duration: entry.duration || 0,
        recording_url: recording,
        broker_id: brokerId,
        date: entry.start_time ? entry.start_time.split('T')[0] : ''
      };
    });
  }

  deduplicateCalls(calls: CallRecord[]): CallRecord[] {
    const callMap = new Map<string, CallRecord>();

    for (const call of calls) {
      const key = call.call_id;
      const hasNameAndRecording = call.from_name?.trim() && call.recording_url?.trim();

      if (!callMap.has(key)) {
        callMap.set(key, call);
      } else if (hasNameAndRecording) {
        callMap.set(key, call);
      }
    }

    return Array.from(callMap.values());
  }
}