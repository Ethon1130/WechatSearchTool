import { NextRequest, NextResponse } from 'next/server';
import { discoverWechatArticles, type EngineName } from '@/lib/discover';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;
const VALID_ENGINES: EngineName[] = ['duckduckgo', 'bing', 'sogou'];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountName?: string;
      limit?: number;
      engines?: string[];
      biz?: string;
    };
    const accountName = (body.accountName || '').trim();

    if (!accountName) {
      return NextResponse.json({ error: '请输入公众号名称或公众号主页链接。' }, { status: 400 });
    }

    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.min(Math.max(1, Math.floor(body.limit)), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const engines: EngineName[] = Array.isArray(body.engines)
      ? body.engines.filter((engine): engine is EngineName =>
          typeof engine === 'string' && VALID_ENGINES.includes(engine as EngineName)
        )
      : ['duckduckgo', 'bing'];

    const biz = typeof body.biz === 'string' && body.biz.trim().length > 0
      ? body.biz.trim()
      : undefined;

    const result = await discoverWechatArticles(accountName, limit, {
      engines: engines.length > 0 ? engines : ['duckduckgo', 'bing'],
      biz,
    });

    return NextResponse.json({
      accountName,
      requestedLimit: limit,
      candidates: result.candidates,
      engine: result.engine,
      discoveryType: result.discoveryType,
      overview: result.overview,
      ...(result.accountProfile ? { accountProfile: result.accountProfile } : {}),
      ...(result.engineSelection ? { engineSelection: result.engineSelection } : {}),
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
