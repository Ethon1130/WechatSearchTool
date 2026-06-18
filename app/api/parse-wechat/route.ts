import { NextRequest, NextResponse } from 'next/server';
import { parseSource } from '@/lib/parser';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a webpage or WeChat article URL.' },
        { status: 400 }
      );
    }

    const source = await parseSource(url);

    return NextResponse.json(source);
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Extraction failed.', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
