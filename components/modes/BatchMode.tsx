'use client';

import { useState } from 'react';
import { SourceViewer } from '@/components/SourceViewer';
import { buildMergedReport, mergedReportToJSON, mergedReportToMarkdown } from '@/lib/report';
import type { BatchItem, BatchParseResult, SourceSummary } from '@/lib/types';

interface BatchModeProps {
  notify: (message: string, type?: 'error' | 'info') => void;
  initialUrls?: string[];
}

type Phase = 'idle' | 'parsing' | 'summarizing' | 'merging' | 'done';

export function BatchMode({ notify, initialUrls = [] }: BatchModeProps) {
  const [urlText, setUrlText] = useState(() => initialUrls.join('\n'));
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<BatchItem[]>([]);
  const [errors, setErrors] = useState<BatchParseResult['errors']>([]);
  const [overview, setOverview] = useState('');
  const [reportTitle, setReportTitle] = useState('');

  const urls = parseUrlList(urlText);

  const handleParse = async () => {
    if (urls.length === 0) {
      notify('请至少粘贴一个 URL,每行一个。', 'error');
      return;
    }
    if (urls.length > 10) {
      notify('单次最多 10 个 URL,请精简后重试。', 'error');
      return;
    }
    notify('');
    setItems([]);
    setErrors([]);
    setOverview('');
    setProgress({ done: 0, total: urls.length });
    setPhase('parsing');

    try {
      const response = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '批量解析失败。');
      }
      const result: BatchParseResult = await response.json();
      setProgress({ done: result.sources.length, total: urls.length });
      setItems(result.sources.map((source) => ({ source })));
      setErrors(result.errors);
      notify(`已成功解析 ${result.sources.length} 篇,失败 ${result.errors.length} 篇。`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : '未知错误。', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const handleBatchSummarize = async () => {
    if (items.length === 0) {
      notify('请先批量解析。', 'error');
      return;
    }
    notify('');
    setPhase('summarizing');
    try {
      const sources = items.map((item) => item.source);
      const response = await fetch('/api/batch-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '摘要失败。');
      }
      const { summaries } = (await response.json()) as { summaries: SourceSummary[] };
      const updated: BatchItem[] = items.map((item, index) => ({
        source: item.source,
        summary: summaries[index],
      }));
      setItems(updated);
      notify('所有文章已生成摘要。', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : '摘要失败。', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const handleGenerateOverview = async () => {
    if (items.length === 0) {
      notify('请先批量解析。', 'error');
      return;
    }
    notify('');
    setPhase('merging');
    try {
      const title = reportTitle.trim() || `${items[0].source.sourceName || '公众号'}研究合并报告`;
      const response = await fetch('/api/merge-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, title }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '合并失败。');
      }
      const { overview: overviewText } = (await response.json()) as { overview: string };
      setOverview(overviewText);
      notify('合并总览已生成。', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : '合并失败。', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const handleExportMergedMarkdown = () => {
    if (items.length === 0) return;
    const title = reportTitle.trim() || '';
    const report = buildMergedReport(items, overview || undefined, title || undefined);
    const markdown = mergedReportToMarkdown(report);
    downloadFile(markdown, `${safeFilename(report.title)}.md`, 'text/markdown;charset=utf-8');
  };

  const handleExportMergedJSON = () => {
    if (items.length === 0) return;
    const title = reportTitle.trim() || '';
    const report = buildMergedReport(items, overview || undefined, title || undefined);
    const json = mergedReportToJSON(report);
    downloadFile(json, `${safeFilename(report.title)}.json`, 'application/json;charset=utf-8');
  };

  const handleSummarizeOne = async (index: number) => {
    const item = items[index];
    if (!item) return;
    notify('');
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '摘要失败。');
      }
      const summary: SourceSummary = await response.json();
      const updated = [...items];
      updated[index] = { source: item.source, summary };
      setItems(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : '摘要失败。', 'error');
    }
  };

  const handleExportOneJSON = (item: BatchItem) => {
    const payload = {
      source: item.source,
      ...(item.summary ? { summary: item.summary } : {}),
      exportedAt: new Date().toISOString(),
    };
    downloadFile(
      JSON.stringify(payload, null, 2),
      `${safeFilename(item.source.title || 'source')}_extraction.json`,
      'application/json;charset=utf-8'
    );
  };

  const handleExportOneMarkdown = (item: BatchItem) => {
    const links = item.source.links.map((l) => `- [${l.text}](${l.href})`).join('\n');
    const images = item.source.images.map((i) => `- ${i}`).join('\n');
    const summarySection = item.summary
      ? `\n## 摘要\n\n- **Key Points**\n${item.summary.keyPoints || '无'}\n\n- **Entities**\n${item.summary.entities || '无'}\n\n- **Business Signals**\n${item.summary.businessSignals || '无'}\n\n- **Useful Facts**\n${item.summary.usefulFacts || '无'}\n\n- **Follow-up Ideas**\n${item.summary.followUpIdeas || '无'}\n`
      : '';
    const markdown = `# ${item.source.title || '未命名文章'}

- 来源:${item.source.sourceName || '未知'}
- 作者:${item.source.author || '未知'}
- 发布时间:${item.source.publishTime || '未知'}
- 链接:${item.source.sourceUrl}

## 摘要描述
${item.source.digest || '无'}

## 正文
${item.source.contentText || '无内容'}

## 图片
${images || '无'}

## 链接
${links || '无'}
${summarySection}
`;
    downloadFile(
      markdown,
      `${safeFilename(item.source.title || 'source')}_extraction.md`,
      'text/markdown;charset=utf-8'
    );
  };

  const isBusy = phase !== 'idle';
  const allSummarized = items.length > 0 && items.every((item) => item.summary);

  return (
    <div className="mode-panel">
      <div className="mode-intro">
        <h2>多链接批量分析</h2>
        <p>每行粘贴一个公众号文章或普通网页 URL,批量提取后生成 AI 摘要并合并成报告。单次最多 10 个,失败的链接会单独列出。</p>
      </div>

      <div className="panel">
        <label className="field-label">公众号文章 / 普通网页 URL 列表(每行一个)</label>
        <textarea
          className="batch-textarea"
          rows={6}
          placeholder={'https://mp.weixin.qq.com/s/...\nhttps://example.com/article'}
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          disabled={isBusy}
        />
        <div className="batch-meta">
          <span>已识别 {urls.length} / 10 个 URL</span>
          <button onClick={handleParse} disabled={isBusy || urls.length === 0}>
            {phase === 'parsing' ? '解析中...' : '批量解析'}
          </button>
        </div>
        {phase === 'parsing' && (
          <div className="loading">
            <div className="spinner" />
            <span>解析中... {progress.done}/{progress.total}</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="panel">
          <div className="report-header">
            <div>
              <h3>合并报告设置</h3>
              <p>报告标题留空将自动使用首个来源公众号名。</p>
            </div>
            <input
              type="text"
              placeholder="报告标题(可选)"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div className="batch-actions">
            <button onClick={handleBatchSummarize} disabled={isBusy}>
              {phase === 'summarizing' ? '生成摘要中...' : allSummarized ? '重新生成全部摘要' : '为全部文章生成摘要'}
            </button>
            <button onClick={handleGenerateOverview} disabled={isBusy}>
              {phase === 'merging' ? '生成总览中...' : overview ? '重新生成总览' : '生成跨篇总览'}
            </button>
            <button className="secondary" onClick={handleExportMergedMarkdown} disabled={isBusy}>
              导出合并报告 (MD)
            </button>
            <button className="secondary" onClick={handleExportMergedJSON} disabled={isBusy}>
              导出合并报告 (JSON)
            </button>
          </div>

          {overview && (
            <div className="overview-block">
              <span>跨篇总览</span>
              <p>{overview}</p>
            </div>
          )}

          {errors.length > 0 && (
            <details className="error-list">
              <summary>跳过 {errors.length} 个 URL(已折叠)</summary>
              <ul>
                {errors.map((err) => (
                  <li key={err.url}>
                    <code>{err.url}</code> — {err.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h3>逐篇结果</h3>
          <div className="batch-items">
            {items.map((item, index) => (
              <div key={item.source.sourceUrl} className="batch-item-card">
                <div className="batch-item-header">
                  <span className="batch-item-index">#{index + 1}</span>
                  <div className="actions">
                    {!item.summary && (
                      <button className="secondary" onClick={() => handleSummarizeOne(index)}>
                        生成摘要
                      </button>
                    )}
                    <button className="secondary" onClick={() => handleExportOneJSON(item)}>
                      JSON
                    </button>
                    <button className="secondary" onClick={() => handleExportOneMarkdown(item)}>
                      MD
                    </button>
                  </div>
                </div>
                <SourceViewer
                  source={item.source}
                  summary={item.summary ?? null}
                  showActions={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseUrlList(text: string): string[] {
  const lines = text.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
  return Array.from(new Set(lines));
}

function safeFilename(name: string): string {
  return (name || 'report').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 80);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
