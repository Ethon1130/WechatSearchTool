'use client';

import { useState } from 'react';
import type { WeChatArticle, ArticleSummary, ExportData } from '@/lib/types';

type ProcessingStep = 'idle' | 'parsing' | 'summarizing';

export default function Home() {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<ProcessingStep>('idle');
  const [article, setArticle] = useState<WeChatArticle | null>(null);
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [error, setError] = useState('');
  const [contentExpanded, setContentExpanded] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('请输入公众号文章链接');
      return;
    }

    setError('');
    setArticle(null);
    setSummary(null);
    setStep('parsing');

    try {
      // Step 1: Parse the article
      const parseResponse = await fetch('/api/parse-wechat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || '解析失败');
      }

      const articleData = await parseResponse.json();
      setArticle(articleData);

      // Step 2: Summarize with AI
      setStep('summarizing');
      const summarizeResponse = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: articleData.contentText,
          title: articleData.title,
        }),
      });

      if (!summarizeResponse.ok) {
        const errorData = await summarizeResponse.json();
        throw new Error(errorData.error || 'AI 总结失败');
      }

      const summaryData = await summarizeResponse.json();
      setSummary(summaryData);
      setStep('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      setStep('idle');
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = () => {
    if (!article || !summary) return;

    const exportData: ExportData = {
      article,
      summary,
      exportedAt: new Date().toISOString(),
    };

    const content = JSON.stringify(exportData, null, 2);
    const filename = `${article.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_调研报告.json`;
    downloadFile(content, filename, 'application/json;charset=utf-8');
  };

  const exportAsMarkdown = () => {
    if (!article || !summary) return;

    const markdown = `# ${article.title}

## 文章信息
- **公众号**: ${article.accountName}
- **作者**: ${article.author || '未知'}
- **链接**: ${article.sourceUrl}
- **摘要**: ${article.digest || '无'}

## 核心观点
${summary.coreInsights || '无'}

## 产品/公司信息
${summary.productInfo || '无'}

## 业务方向
${summary.businessDirection || '无'}

## 增长策略
${summary.growthStrategy || '无'}

## 面试启发
${summary.interviewInsights || '无'}

---

*由 WeChat Research Agent 自动生成 | ${new Date().toLocaleString('zh-CN')}*
`;

    const filename = `${article.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_调研报告.md`;
    downloadFile(markdown, filename, 'text/markdown;charset=utf-8');
  };

  return (
    <div className="container">
      <header>
        <h1>WeChat Research Agent</h1>
        <p>公众号文章调研工具 - 快速提取、整理和分析公众号内容</p>
      </header>

      <div className="card">
        <div className="input-section">
          <input
            type="text"
            placeholder="粘贴公众号文章链接..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            onClick={handleAnalyze}
            disabled={step !== 'idle'}
          >
            {step === 'idle' ? '开始分析' : '分析中...'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {step !== 'idle' && (
          <div className="loading">
            <div className="spinner"></div>
            <span>
              {step === 'parsing' ? '正在解析文章...' : '正在调用 AI 总结...'}
            </span>
          </div>
        )}
      </div>

      {article && (
        <div className="result-section">
          <div className="card">
            <h2 className="section-title">{article.title}</h2>

            <div className="article-info">
              <div className="info-item">
                <div className="label">公众号</div>
                <div className="value">{article.accountName}</div>
              </div>
              <div className="info-item">
                <div className="label">作者</div>
                <div className="value">{article.author || '未知'}</div>
              </div>
              {article.digest && (
                <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                  <div className="label">摘要</div>
                  <div className="value">{article.digest}</div>
                </div>
              )}
            </div>

            {article.contentText && (
              <div className="content-preview">
                <div className="label">正文预览</div>
                <p style={{ marginTop: 8, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {article.contentText.substring(0, 1500)}
                  {article.contentText.length > 1500 && !contentExpanded && '...'}
                </p>
              </div>
            )}
            {article.contentText && article.contentText.length > 1500 && (
              <button
                className="toggle-content"
                onClick={() => setContentExpanded(!contentExpanded)}
              >
                {contentExpanded ? '收起' : '展开全部内容'}
              </button>
            )}
          </div>

          {summary && (
            <div className="card">
              <h2 className="section-title">AI 智能分析</h2>

              <div className="summary-grid">
                <div className="summary-card">
                  <h4>核心观点</h4>
                  <p>{summary.coreInsights || '暂无分析'}</p>
                </div>
                <div className="summary-card product">
                  <h4>产品/公司信息</h4>
                  <p>{summary.productInfo || '暂无分析'}</p>
                </div>
                <div className="summary-card business">
                  <h4>业务方向</h4>
                  <p>{summary.businessDirection || '暂无分析'}</p>
                </div>
                <div className="summary-card growth">
                  <h4>增长策略</h4>
                  <p>{summary.growthStrategy || '暂无分析'}</p>
                </div>
                <div className="summary-card interview" style={{ gridColumn: '1 / -1' }}>
                  <h4>面试启发</h4>
                  <p>{summary.interviewInsights || '暂无分析'}</p>
                </div>
              </div>

              <div className="export-section">
                <button className="export-btn" onClick={exportAsJSON}>
                  导出 JSON
                </button>
                <button className="export-btn" onClick={exportAsMarkdown}>
                  导出 Markdown
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
