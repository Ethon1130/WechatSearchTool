import { NextRequest, NextResponse } from 'next/server';
import { discoverWechatArticles } from '@/lib/discover';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { accountName?: string; limit?: number };
    const accountName = (body.accountName || '').trim();

    if (!accountName) {
      return NextResponse.json({ error: '请输入公众号名称或公众号主页链接。' }, { status: 400 });
    }

    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.min(Math.max(1, Math.floor(body.limit)), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const result = await discoverWechatArticles(accountName, limit);

    return NextResponse.json({
      accountName,
      requestedLimit: limit,
      candidates: result.candidates,
      engine: result.engine,
      discoveryType: result.discoveryType,
      overview: result.overview,
      ...(result.hint ? { hint: result.hint } : {}),
    });
  } catch (error) {
    console.error('Discover error:', error);
    return NextResponse.json(
      { error: '公开文章发现失败。', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
