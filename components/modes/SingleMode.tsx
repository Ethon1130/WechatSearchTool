'use client';

import { useState } from 'react';
import { SourceViewer } from '@/components/SourceViewer';
import type { ExtractedSource, SourceSummary } from '@/lib/types';

type ProcessingStep = 'idle' | 'extracting' | 'summarizing';

interface SingleModeProps {
  notify: (message: string, type?: 'error' | 'info') => void;
}

export function SingleMode({ notify }: SingleModeProps) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<ProcessingStep>('idle');
  const [source, setSource] = useState<ExtractedSource | null>(null);
  const [summary, setSummary] = useState<SourceSummary | null>(null);

  const handleExtract = async () => {
    if (!url.trim()) {
      notify('请粘贴公众号文章 URL 或网页 URL。', 'error');
      return;
    }
    notify('');
    setSource(null);
    setSummary(null);
    setStep('extracting');

    try {
      const response = await fetch('/api/parse-wechat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '解析失败。');
      }
      const sourceData: ExtractedSource = await response.json();
      setSource(sourceData);
      notify('已成功提取,可以选择生成摘要或导出。', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : '未知错误。', 'error');
    } finally {
      setStep('idle');
    }
  };

  const handleSummarize = async () => {
    if (!source) return;
    notify('');
    setStep('summarizing');
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '摘要失败。');
      }
      const summaryData: SourceSummary = await response.json();
      setSummary(summaryData);
    } catch (err) {
      notify(err instanceof Error ? err.message : '未知错误。', 'error');
    } finally {
      setStep('idle');
    }
  };

  const exportAsJSON = () => {
    if (!source) return;
    const payload = {
      source,
      ...(summary ? { summary } : {}),
      exportedAt: new Date().toISOString(),
    };
    downloadFile(
      JSON.stringify(payload, null, 2),
      buildFilename(source.title, 'extraction.json'),
      'application/json;charset=utf-8'
    );
  };

  const exportAsMarkdown = () => {
    if (!source) return;
    const markdown = buildSingleMarkdown(source, summary);
    downloadFile(markdown, buildFilename(source.title, 'extraction.md'), 'text/markdown;charset=utf-8');
  };

  return (
    <div className="mode-panel">
      <div className="mode-intro">
        <h2>单链接内容分析</h2>
        <p>粘贴一篇公众号文章 URL 或普通网页 URL,提取标题、来源、作者、正文、图片与链接,并可选择生成 AI 摘要。</p>
      </div>

      <div className="panel">
        <div className="input-row">
          <input
            type="url"
            placeholder="https://mp.weixin.qq.com/s/... 或 https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
          />
          <button onClick={handleExtract} disabled={step !== 'idle'}>
            {step === 'extracting' ? '提取中...' : '提取'}
          </button>
        </div>
        {step !== 'idle' && (
          <div className="loading">
            <div className="spinner" />
            <span>{step === 'extracting' ? '正在抓取并解析页面...' : '正在生成摘要...'}</span>
          </div>
        )}
      </div>

      {source && (
        <div className="panel">
          <SourceViewer
            source={source}
            summary={summary}
            onGenerateSummary={handleSummarize}
            onExportJSON={exportAsJSON}
            onExportMarkdown={exportAsMarkdown}
            summarizing={step === 'summarizing'}
          />
        </div>
      )}
    </div>
  );
}

function buildFilename(title: string, suffix: string): string {
  const safe = (title || 'extracted-source').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  return `${safe}_${suffix}`;
}

function buildSingleMarkdown(source: ExtractedSource, summary: SourceSummary | null): string {
  const links = source.links.map((l) => `- [${l.text}](${l.href})`).join('\n');
  const images = source.images.map((i) => `- ${i}`).join('\n');
  const summaryMarkdown = summary
    ? `
## 摘要

### Key Points
${summary.keyPoints || '无'}

### Entities
${summary.entities || '无'}

### Business Signals
${summary.businessSignals || '无'}

### Useful Facts
${summary.usefulFacts || '无'}

### Follow-up Ideas
${summary.followUpIdeas || '无'}
`
    : '';

  return `# ${source.title || '未命名文章'}

## 基本信息
- 来源:${source.sourceName || '未知'}
- 类型:${source.sourceType === 'wechat' ? '公众号文章' : '普通网页'}
- 作者:${source.author || '未知'}
- 发布时间:${source.publishTime || '未知'}
- 链接:${source.sourceUrl}
- 提取时间:${new Date(source.extractedAt).toLocaleString('zh-CN')}

## 摘要描述
${source.digest || '无'}

## 正文
${source.contentText || '无内容'}

## 图片
${images || '无'}

## 链接
${links || '无'}
${summaryMarkdown}
`;
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
