import { NextRequest, NextResponse } from 'next/server';
import { summarizeSource } from '@/lib/deepseek';
import type { ExtractedSource } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { source } = (await request.json()) as { source?: ExtractedSource };

    if (!source?.contentText) {
      return NextResponse.json(
        { error: 'Missing extracted source content.' },
        { status: 400 }
      );
    }

    const summary = await summarizeSource(source);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: 'Summary failed.', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
