import { NextRequest, NextResponse } from 'next/server';
import { parseBatch } from '@/lib/batch';

const MAX_URLS = 10;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { urls?: string[] };
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((url): url is string => typeof url === 'string')
      : [];

    if (urls.length === 0) {
      return NextResponse.json({ error: '请至少提供一个 URL。' }, { status: 400 });
    }

    if (urls.length > MAX_URLS) {
      return NextResponse.json(
        { error: `单次最多解析 ${MAX_URLS} 个 URL,当前 ${urls.length} 个。` },
        { status: 400 }
      );
    }

    const result = await parseBatch(urls);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Batch error:', error);
    return NextResponse.json(
      { error: '批量解析失败。', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
