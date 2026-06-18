import { NextRequest, NextResponse } from 'next/server';
import { summarizeWithDeepSeek } from '@/lib/deepseek';

export async function POST(request: NextRequest) {
  try {
    const { content, title } = await request.json();

    if (!content || !title) {
      return NextResponse.json(
        { error: '缺少必要参数：content 和 title' },
        { status: 400 }
      );
    }

    const summary = await summarizeWithDeepSeek(content, title);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: 'AI 总结失败', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
