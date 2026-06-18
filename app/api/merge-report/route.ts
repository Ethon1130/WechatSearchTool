import { NextRequest, NextResponse } from 'next/server';
import { mergeReport } from '@/lib/deepseek';
import type { BatchItem } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { items, title } = (await request.json()) as { items?: BatchItem[]; title?: string };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing report items.' },
        { status: 400 }
      );
    }

    if (items.some((item) => !item?.source?.contentText)) {
      return NextResponse.json(
        { error: 'Every report item must include extracted content.' },
        { status: 400 }
      );
    }

    const overview = await mergeReport(items, title?.trim() || '');

    return NextResponse.json({ overview });
  } catch (error) {
    console.error('Merge report error:', error);
    return NextResponse.json(
      { error: 'Merge report failed.', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
