import type { ArticleSummary } from './types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function summarizeWithDeepSeek(
  content: string,
  title: string
): Promise<ArticleSummary> {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    throw new Error('API_KEY environment variable is not set');
  }

  const systemPrompt = `你是一个专业的公司调研助手，帮助用户从公众号文章中提取有价值的信息。

请根据提供的公众号文章内容，从以下5个维度进行总结：

1. **核心观点**: 文章主要想表达什么？
2. **产品/公司信息**: 提到了哪些产品、项目或公司？
3. **业务方向**: 文章体现了什么业务发展方向？
4. **增长策略**: 有哪些增长或运营策略值得学习？
5. **面试启发**: 对面试这家公司的候选人有什么建议？

请用简洁专业的语言总结，每个维度用中文回复，控制在100字以内。`;

  const userPrompt = `文章标题：${title}

文章内容：
${content}`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const aiContent = data.choices?.[0]?.message?.content || '';

  // Parse the structured response
  const summary = parseSummaryResponse(aiContent);

  return summary;
}

function parseSummaryResponse(content: string): ArticleSummary {
  const result: ArticleSummary = {
    coreInsights: '',
    productInfo: '',
    businessDirection: '',
    growthStrategy: '',
    interviewInsights: '',
  };

  const lines = content.split('\n');

  let currentField: keyof ArticleSummary | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine.includes('核心观点')) {
      flushCurrent(result, currentField, currentContent);
      currentField = 'coreInsights';
      currentContent = [extractAfterKeyword(trimmedLine, '核心观点')];
    } else if (trimmedLine.includes('产品')) {
      flushCurrent(result, currentField, currentContent);
      currentField = 'productInfo';
      currentContent = [extractAfterKeyword(trimmedLine, '产品')];
    } else if (trimmedLine.includes('业务方向')) {
      flushCurrent(result, currentField, currentContent);
      currentField = 'businessDirection';
      currentContent = [extractAfterKeyword(trimmedLine, '业务方向')];
    } else if (trimmedLine.includes('增长策略')) {
      flushCurrent(result, currentField, currentContent);
      currentField = 'growthStrategy';
      currentContent = [extractAfterKeyword(trimmedLine, '增长策略')];
    } else if (trimmedLine.includes('面试启发')) {
      flushCurrent(result, currentField, currentContent);
      currentField = 'interviewInsights';
      currentContent = [extractAfterKeyword(trimmedLine, '面试启发')];
    } else if (currentField && trimmedLine) {
      currentContent.push(trimmedLine);
    }
  }

  flushCurrent(result, currentField, currentContent);

  if (!result.coreInsights && content) {
    result.coreInsights = content.substring(0, 500);
  }

  return result;
}

function extractAfterKeyword(line: string, keyword: string): string {
  return line
    .replace(/^[\d\.\*\-\s\:\：]+/, '')
    .replace(new RegExp(keyword, 'i'), '')
    .trim();
}

function flushCurrent(
  result: ArticleSummary,
  field: keyof ArticleSummary | null,
  content: string[]
): void {
  if (field && content.length > 0) {
    result[field] = content.join('\n').trim();
  }
}
