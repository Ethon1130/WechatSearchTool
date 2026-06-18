import { NextRequest, NextResponse } from 'next/server';
import { parseWeChatArticle } from '@/lib/parser';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || !url.includes('mp.weixin.qq.com')) {
      return NextResponse.json(
        { error: '请输入有效的公众号文章链接' },
        { status: 400 }
      );
    }

    const article = await parseWeChatArticle(url);

    return NextResponse.json(article);
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: '解析失败', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
