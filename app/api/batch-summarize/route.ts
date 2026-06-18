import { NextRequest, NextResponse } from 'next/server';
import { summarizeSources } from '@/lib/deepseek';
import type { ExtractedSource } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sources } = (await request.json()) as { sources?: ExtractedSource[] };

    if (!Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json(
        { error: 'Missing extracted source content.' },
        { status: 400 }
      );
    }

    if (sources.some((source) => !source?.contentText)) {
      return NextResponse.json(
        { error: 'Every source must include extracted content.' },
        { status: 400 }
      );
    }

    const summaries = await summarizeSources(sources);

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Batch summarize error:', error);
    return NextResponse.json(
      { error: 'Batch summary failed.', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
