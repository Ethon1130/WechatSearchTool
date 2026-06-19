import type { BatchItem, ExtractedSource, ResearchArtifact, SourceSummary } from './types';

const DEFAULT_DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const SUMMARY_INTERVAL_MS = 500;

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekApiKey {
  value: string;
  source: 'DEEPSEEK_API_KEY';
}

function getApiKey(): DeepSeekApiKey {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DeepSeek API key. Set DEEPSEEK_API_KEY in .env.local or your user environment variables.');
  }

  return {
    value: apiKey,
    source: 'DEEPSEEK_API_KEY',
  };
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return '****';
  return `****${apiKey.slice(-4)}`;
}

async function getDeepSeekErrorMessage(response: Response, apiKey: DeepSeekApiKey): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  return `DeepSeek API error using ${apiKey.source} (${maskApiKey(apiKey.value)}): ${response.status} - ${JSON.stringify(errorData)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summarizeSource(source: ExtractedSource): Promise<SourceSummary> {
  const apiKey = getApiKey();
  const apiUrl = process.env.DEEPSEEK_API_URL || DEFAULT_DEEPSEEK_API_URL;
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;

  const messages: DeepSeekMessage[] = buildSummaryMessages(source);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.value}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(await getDeepSeekErrorMessage(response, apiKey));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  return normalizeSummary(JSON.parse(content));
}

export async function summarizeSources(sources: ExtractedSource[]): Promise<SourceSummary[]> {
  const summaries: SourceSummary[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    const summary = await summarizeSource(sources[i]);
    summaries.push(summary);
    if (i < sources.length - 1) {
      await sleep(SUMMARY_INTERVAL_MS);
    }
  }
  return summaries;
}

export async function mergeReport(items: BatchItem[], reportTitle: string): Promise<string> {
  if (items.length === 0) return '';

  const apiKey = getApiKey();
  const apiUrl = process.env.DEEPSEEK_API_URL || DEFAULT_DEEPSEEK_API_URL;
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;

  const compact = items.map((item, index) => ({
    index: index + 1,
    title: item.source.title,
    sourceName: item.source.sourceName,
    author: item.source.author,
    publishTime: item.source.publishTime,
    sourceUrl: item.source.sourceUrl,
    summary: item.summary,
    excerpt: item.source.contentText.slice(0, 1500),
  }));

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content:
        '你是一个跨篇内容整合助手。基于用户提供的多篇文章摘要,产出 executive overview,严格基于所给内容,不要编造事实。返回 JSON only,内容用中文。',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          requiredSchema: {
            overview:
              '一段不超过 600 字的跨篇 executive overview,提炼共性主题、关键观点、不同文章之间的差异或互补。',
          },
          reportTitle,
          articles: compact,
        },
        null,
        2
      ),
    },
  ];

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.value}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(await getDeepSeekErrorMessage(response, apiKey));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as { overview?: string };
  return parsed.overview || '';
}

export async function answerResearchFollowUp(
  question: string,
  artifact: ResearchArtifact
): Promise<string> {
  const apiKey = getApiKey();
  const apiUrl = process.env.DEEPSEEK_API_URL || DEFAULT_DEEPSEEK_API_URL;
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
  const compact = artifact.sources.map((source, index) => ({
    index: index + 1,
    title: source.title,
    sourceName: source.sourceName,
    author: source.author,
    publishTime: source.publishTime,
    sourceUrl: source.sourceUrl,
    summary: artifact.summaries[index],
    excerpt: source.contentText.slice(0, 2200),
  }));

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content:
        '你是研究助理。只能根据用户已经提取的文章内容、摘要和总览回答问题。不要编造事实；如果材料不足，直接说明不足。用中文回答，尽量给出可复用的研究结论。',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          question,
          overview: artifact.overview || '',
          articles: compact,
          failedUrls: artifact.errors,
        },
        null,
        2
      ),
    },
  ];

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.value}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 1600,
    }),
  });

  if (!response.ok) {
    throw new Error(await getDeepSeekErrorMessage(response, apiKey));
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '没有生成可用回答。';
}

function buildSummaryMessages(source: ExtractedSource): DeepSeekMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an information organization assistant. Summarize only from the provided extracted source. Do not invent facts. Return valid JSON only. The JSON values should be written in Chinese.',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          requiredSchema: {
            keyPoints: '3 to 5 key points',
            entities: 'companies, products, people, organizations, and other named entities',
            businessSignals: 'business, industry, operation, growth, or competitor signals',
            usefulFacts: 'facts that can be reused in later research',
            followUpIdeas: 'questions or topics worth tracking next',
          },
          source: {
            title: source.title,
            sourceName: source.sourceName,
            sourceType: source.sourceType,
            author: source.author,
            publishTime: source.publishTime,
            digest: source.digest,
            sourceUrl: source.sourceUrl,
            contentText: source.contentText.slice(0, 12000),
          },
        },
        null,
        2
      ),
    },
  ];
}

function normalizeSummary(value: Partial<SourceSummary>): SourceSummary {
  return {
    keyPoints: value.keyPoints || '',
    entities: value.entities || '',
    businessSignals: value.businessSignals || '',
    usefulFacts: value.usefulFacts || '',
    followUpIdeas: value.followUpIdeas || '',
  };
}
