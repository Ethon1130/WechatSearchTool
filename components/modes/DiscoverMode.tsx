'use client';

import { useState } from 'react';
import type { DiscoveredArticle, DiscoverResult } from '@/lib/types';

interface DiscoverModeProps {
  notify: (message: string, type?: 'error' | 'info') => void;
  onHandOff: (urls: string[]) => void;
}

type Phase = 'idle' | 'discovering';

const DISCOVER_LIMITS = [5, 10, 15, 20, 30];
const MAX_ANALYZE_URLS = 10;

export function DiscoverMode({ notify, onHandOff }: DiscoverModeProps) {
  const [accountName, setAccountName] = useState('');
  const [articleLimit, setArticleLimit] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [candidates, setCandidates] = useState<DiscoveredArticle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraUrls, setExtraUrls] = useState('');
  const [engine, setEngine] = useState('');
  const [hint, setHint] = useState<string | undefined>();
  const [overview, setOverview] = useState<DiscoverResult['overview']>();
  const [discoveryType, setDiscoveryType] = useState<DiscoverResult['discoveryType']>();

  const handleDiscover = async () => {
    const query = accountName.trim();
    if (!query) {
      notify('请输入公众号名称或公众号主页链接。', 'error');
      return;
    }

    notify('');
    setPhase('discovering');
    setCandidates([]);
    setSelected(new Set());
    setOverview(undefined);
    setHint(undefined);

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName: query, limit: articleLimit }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '公开文章发现失败。');
      }

      const data: DiscoverResult = await response.json();
      const defaultSelected = data.candidates.slice(0, MAX_ANALYZE_URLS).map((candidate) => candidate.url);
      setCandidates(data.candidates);
      setEngine(data.engine);
      setHint(data.hint);
      setOverview(data.overview);
      setDiscoveryType(data.discoveryType);
      setSelected(new Set(defaultSelected));

      if (data.candidates.length === 0) {
        notify(data.hint || '未找到公开候选文章，可手动粘贴 URL。', 'info');
      } else {
        notify(`发现 ${data.candidates.length} 篇公开文章，已默认勾选前 ${defaultSelected.length} 篇。`, 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '公开文章发现失败。', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const handleToggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleSelectFirst = (count: number) => {
    setSelected(new Set(candidates.slice(0, count).map((candidate) => candidate.url)));
  };

  const handleSelectAll = () => {
    setSelected(new Set(candidates.map((candidate) => candidate.url)));
  };

  const handleSelectNone = () => {
    setSelected(new Set());
  };

  const handleAnalyze = () => {
    const manualUrls = extraUrls
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);

    const urls = Array.from(new Set([...Array.from(selected), ...manualUrls]));

    if (urls.length === 0) {
      notify('请至少勾选一篇文章或手动追加一个 URL。', 'error');
      return;
    }
    if (urls.length > MAX_ANALYZE_URLS) {
      notify(`单次最多分析 ${MAX_ANALYZE_URLS} 个 URL，当前共有 ${urls.length} 个，请先精简。`, 'error');
      return;
    }

    onHandOff(urls);
  };

  const manualCount = extraUrls
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  const isBusy = phase !== 'idle';
  const sourceLabel =
    discoveryType === 'homepage-url'
      ? '公众号主页链接'
      : discoveryType === 'article-url'
        ? '公众号文章链接'
        : '公开搜索';

  return (
    <div className="mode-panel">
      <div className="mode-intro">
        <h2>公众号账号发现模式</h2>
        <p>
          输入公众号名称、公众号主页链接，或任意一篇公众号文章链接。系统只发现公开文章标题与链接，先给出大概内容方向，再由你勾选要进入正文解析的文章。
        </p>
      </div>

      <div className="disclaimer">
        <strong>公开线索 + 用户确认</strong>
        <p>
          当前目标：<em>{accountName || '你输入的公众号名称、主页链接或文章链接'}</em>。工具只处理公开可访问的文章线索，
          <strong>只有你勾选的链接才会被抓取和分析</strong>。如果候选不全，也可以在下方手动追加 URL。
        </p>
      </div>

      <div className="panel">
        <div className="discover-controls">
          <div className="discover-query">
            <label className="field-label">公众号名称 / 主页链接 / 任意文章链接</label>
            <input
              type="text"
              placeholder="如：程序员鱼皮，或 https://mp.weixin.qq.com/s/..."
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
              disabled={isBusy}
            />
          </div>
          <div className="discover-limit">
            <label className="field-label">先发现多少篇</label>
            <select
              value={articleLimit}
              onChange={(e) => setArticleLimit(Number(e.target.value))}
              disabled={isBusy}
            >
              {DISCOVER_LIMITS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit} 篇标题
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleDiscover} disabled={isBusy}>
            {phase === 'discovering' ? '发现中...' : '发现公开文章'}
          </button>
        </div>
        {engine && (
          <p className="engine-hint">
            来源：{sourceLabel} / {engine}
            {hint ? ` · ${hint}` : ''}
          </p>
        )}
      </div>

      {overview && candidates.length > 0 && (
        <div className="panel direction-panel">
          <div>
            <span className="section-kicker">标题方向概览</span>
            <p>{overview.titleDirection}</p>
          </div>
          {overview.keywords.length > 0 && (
            <div className="keyword-row">
              {overview.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          )}
          {overview.sampleTitles.length > 0 && (
            <ol className="title-sample-list">
              {overview.sampleTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="panel">
          <div className="candidates-header">
            <div>
              <h3>候选文章 {candidates.length} 篇</h3>
              <p>默认勾选前 {Math.min(candidates.length, MAX_ANALYZE_URLS)} 篇；批量正文分析单次最多 {MAX_ANALYZE_URLS} 篇。</p>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => handleSelectFirst(5)}>
                选前 5
              </button>
              <button className="secondary" onClick={() => handleSelectFirst(10)}>
                选前 10
              </button>
              <button className="secondary" onClick={handleSelectAll}>
                全选
              </button>
              <button className="secondary" onClick={handleSelectNone}>
                清空
              </button>
            </div>
          </div>
          <ul className="candidate-list">
            {candidates.map((candidate, index) => (
              <li key={candidate.url} className="candidate-item">
                <label className="candidate-label">
                  <input
                    type="checkbox"
                    checked={selected.has(candidate.url)}
                    onChange={() => handleToggle(candidate.url)}
                  />
                  <div className="candidate-content">
                    <a className="candidate-title" href={candidate.url} target="_blank" rel="noopener noreferrer">
                      <span className="candidate-rank">#{index + 1}</span>
                      {candidate.title}
                    </a>
                    {candidate.snippet && <p className="candidate-snippet">{candidate.snippet}</p>}
                    <code className="candidate-url">{candidate.url}</code>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(candidates.length > 0 || engine) && (
        <div className="panel">
          <label className="field-label">手动追加文章 URL（每行一个，可选）</label>
          <textarea
            className="batch-textarea"
            rows={3}
            placeholder={'https://mp.weixin.qq.com/s/...'}
            value={extraUrls}
            onChange={(e) => setExtraUrls(e.target.value)}
            disabled={isBusy}
          />
          <p className="hint-text">
            已选 {selected.size} 篇候选 + {manualCount} 个手动 URL。进入下一步后会抓取正文，并可生成逐篇摘要和跨篇总览。
          </p>
          <button onClick={handleAnalyze} disabled={isBusy}>
            分析所选文章
          </button>
        </div>
      )}

      {candidates.length === 0 && engine && (
        <div className="panel">
          <h3>没有找到候选文章</h3>
          <p>可能原因：</p>
          <ul className="resource-list">
            <li>公开搜索引擎暂未收录该公众号文章。</li>
            <li>公众号主页链接需要登录态，分享出来的页面没有暴露公开文章列表。</li>
            <li>搜索词与公众号名称不完全一致，可尝试复制更准确的账号名。</li>
          </ul>
          <p className="hint-text">你也可以切换到“多链接批量分析”模式，手动粘贴文章 URL 继续分析。</p>
        </div>
      )}
    </div>
  );
}
