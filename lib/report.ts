import type { BatchItem, MergedReport, SourceSummary } from './types';

export function buildMergedReport(items: BatchItem[], overview?: string, title?: string): MergedReport {
  const generatedAt = new Date().toISOString();
  const autoTitle = title || guessReportTitle(items);
  return {
    title: autoTitle,
    generatedAt,
    items,
    ...(overview ? { overview } : {}),
  };
}

export function mergedReportToMarkdown(report: MergedReport): string {
  const { title, generatedAt, items, overview } = report;
  const sources = dedupeSourceNames(items);
  const sections = items
    .map((item, index) => renderItemSection(item, index + 1))
    .join('\n\n---\n\n');

  return [
    `# ${title || '公众号研究合并报告'}`,
    '',
    `- 生成时间:${formatDate(generatedAt)}`,
    `- 文章数:${items.length}`,
    sources.length > 0 ? `- 来源公众号:${sources.join('、')}` : '- 来源公众号:未知',
    '',
    overview ? `## 总览(Overview)\n\n${overview}` : '',
    '',
    sections,
    '',
    `---`,
    `*本报告基于 ${items.length} 篇公开可访问的公众号文章。*`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function mergedReportToJSON(report: MergedReport): string {
  const exportData = {
    title: report.title,
    generatedAt: report.generatedAt,
    overview: report.overview,
    items: report.items.map((item) => ({
      source: item.source,
      ...(item.summary ? { summary: item.summary } : {}),
    })),
  } satisfies MergedReport;
  return JSON.stringify(exportData, null, 2);
}

function dedupeSourceNames(items: BatchItem[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const name = item.source.sourceName?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function guessReportTitle(items: BatchItem[]): string {
  if (items.length === 0) return '公众号研究合并报告';
  const first = items[0].source.sourceName?.trim();
  if (first && items.every((item) => item.source.sourceName?.trim() === first)) {
    return `${first} · 公众号研究合并报告`;
  }
  return '公众号研究合并报告';
}

function renderItemSection(item: BatchItem, index: number): string {
  const { source, summary } = item;
  const summaryMarkdown = summary ? renderSummary(summary) : '> 未生成摘要';

  return [
    `## 文章 ${index}:${source.title || '无标题'}`,
    '',
    `- 来源:${source.sourceName || '未知'}`,
    `- 作者:${source.author || '未知'}`,
    `- 发布时间:${source.publishTime || '未知'}`,
    `- 类型:${source.sourceType === 'wechat' ? '公众号文章' : '普通网页'}`,
    `- 链接:${source.sourceUrl}`,
    '',
    `### 摘要`,
    summaryMarkdown,
    '',
    `### 原文内容`,
    source.contentText || '> 无内容',
  ].join('\n');
}

function renderSummary(summary: SourceSummary): string {
  return [
    `- **Key Points**\n${summary.keyPoints || '无'}`,
    `- **Entities**\n${summary.entities || '无'}`,
    `- **Business Signals**\n${summary.businessSignals || '无'}`,
    `- **Useful Facts**\n${summary.usefulFacts || '无'}`,
    `- **Follow-up Ideas**\n${summary.followUpIdeas || '无'}`,
  ].join('\n\n');
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch {
    return value;
  }
}
