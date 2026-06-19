import { NextRequest, NextResponse } from 'next/server';
import { answerResearchFollowUp } from '@/lib/deepseek';
import type { ResearchFollowUpRequest } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { question, artifact } = (await request.json()) as Partial<ResearchFollowUpRequest>;

    if (!question?.trim()) {
      return NextResponse.json({ error: '请先输入追问内容。' }, { status: 400 });
    }

    if (!artifact || !Array.isArray(artifact.sources) || artifact.sources.length === 0) {
      return NextResponse.json({ error: '请先粘贴链接并完成一次研究。' }, { status: 400 });
    }

    const answer = await answerResearchFollowUp(question.trim(), artifact);
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Research follow-up error:', error);
    return NextResponse.json(
      {
        error: '追问生成失败。',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
