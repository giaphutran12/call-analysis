import { NextRequest, NextResponse } from 'next/server';
import { Net2PhoneService } from '@/lib/services/net2phone';
import { CallRecord } from '@/lib/types/pipeline';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, clientId, clientSecret, baseUrl, tokenEndpoint, callsEndpoint, pageSize = 500, minDuration = 10 } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Net2Phone credentials are required' },
        { status: 400 }
      );
    }

    const service = new Net2PhoneService({
      clientId,
      clientSecret,
      baseUrl: baseUrl || 'https://api.net2phone.com',
      tokenEndpoint: tokenEndpoint || '/oauth/token',
      callsEndpoint: callsEndpoint || '/v1/calls',
    });

    const dates = getDateRange(new Date(startDate), new Date(endDate));
    const allCalls: CallRecord[] = [];
    const results = [];

    for (const date of dates) {
      try {
        const callData = await service.getCallLogs(date, pageSize, minDuration);
        const calls = service.extractRelevantData(callData.result || []);
        const dedupedCalls = service.deduplicateCalls(calls);
        
        allCalls.push(...dedupedCalls);
        results.push({
          date: date.toISOString().split('T')[0],
          count: dedupedCalls.length,
          status: 'success'
        });

        // Rate limiting delay
        if (dates.indexOf(date) < dates.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        results.push({
          date: date.toISOString().split('T')[0],
          count: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalCalls: allCalls.length,
      dateRange: { startDate, endDate },
      results,
      calls: allCalls
    });

  } catch (error) {
    console.error('Error in Stage 1 API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

function getDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}