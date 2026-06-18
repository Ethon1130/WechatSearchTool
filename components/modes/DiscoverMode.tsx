'use client';

import { useState } from 'react';
import { SourceViewer } from '@/components/SourceViewer';
import type {
  BatchItem,
  BatchParseResult,
  DiscoveredArticle,
  DiscoverResult,
  EngineName,
  ExtractedSource,
  SourceSummary,
} from '@/lib/types';

interface DiscoverModeProps {
  notify: (message: string, type?: 'error' | 'info') => void;
  onHandOff: (urls: string[]) => void;
}

type Phase = 'idle' | 'discovering' | 'analyzing' | 'summarizing';
type AnalyzeStep = 'parsing' | 'summarizing';

const DISCOVER_LIMITS = [5, 10, 15, 20, 30];
const MAX_ANALYZE_URLS = 10;

const ENGINE_OPTIONS: Array<{ id: EngineName; label: string; recommended?: boolean }> = [
  { id: 'duckduckgo', label: 'DuckDuckGo', recommended: true },
  { id: 'bing', label: 'Bing', recommended: true },
  { id: 'sogou', label: '搜狗微信(可能触发验证码)' },
];

export function DiscoverMode({ notify, onHandOff }: DiscoverModeProps) {
  const [accountName, setAccountName] = useState('');
  const [articleLimit, setArticleLimit] = useState(10);
  const [enabledEngines, setEnabledEngines] = useState<Set<EngineName>>(
    new Set(['duckduckgo', 'bing'])
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [candidates, setCandidates] = useState<DiscoveredArticle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraUrls, setExtraUrls] = useState('');
  const [engine, setEngine] = useState('');
  const [hint, setHint] = useState<string | undefined>();
  const [overview, setOverview] = useState<DiscoverResult['overview']>();
  const [discoveryType, setDiscoveryType] = useState<DiscoverResult['discoveryType']>();
  const [accountProfile, setAccountProfile] = useState<DiscoverResult['accountProfile']>();
  const [engineSelection, setEngineSelection] = useState<DiscoverResult['engineSelection']>();

  const [analyzeItems, setAnalyzeItems] = useState<BatchItem[]>([]);
  const [analyzeErrors, setAnalyzeErrors] = useState<BatchParseResult['errors']>([]);
  const [analyzeStep, setAnalyzeStep] = useState<AnalyzeStep>('parsing');
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });
  const [analyzeSourceLabel, setAnalyzeSourceLabel] = useState('');

  const handleEngineToggle = (engineName: EngineName) => {
    setEnabledEngines((prev) => {
      const next = new Set(prev);
      if (next.has(engineName)) {
        if (next.size === 1) {
          notify('至少保留一个搜索引擎。', 'error');
          return prev;
        }
        next.delete(engineName);
      } else {
        next.add(engineName);
      }
      return next;
    });
  };

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
    setAccountProfile(undefined);
    setEngineSelection(undefined);
    setAnalyzeItems([]);
    setAnalyzeErrors([]);
    setAnalyzeProgress({ done: 0, total: 0 });

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: query,
          limit: articleLimit,
          engines: Array.from(enabledEngines),
        }),
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
      setAccountProfile(data.accountProfile);
      setEngineSelection(data.engineSelection);
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

  const collectUrls = (): string[] => {
    const manualUrls = extraUrls
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    return Array.from(new Set([...Array.from(selected), ...manualUrls]));
  };

  const handleAnalyze = () => {
    const urls = collectUrls();

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

  const handleAnalyzeAllInPlace = async () => {
    const urls = collectUrls();
    if (urls.length === 0) {
      notify('请至少勾选一篇文章或手动追加一个 URL。', 'error');
      return;
    }

    notify('');
    setPhase('analyzing');
    setAnalyzeItems([]);
    setAnalyzeErrors([]);
    setAnalyzeStep('parsing');
    setAnalyzeProgress({ done: 0, total: urls.length });
    setAnalyzeSourceLabel(
      accountProfile?.name ||
        (accountName.trim() && candidates[0]?.sourceName) ||
        accountName.trim() ||
        '公众号'
    );

    try {
      const sources: ExtractedSource[] = [];
      const errors: BatchParseResult['errors'] = [];
      for (let i = 0; i < urls.length; i += MAX_ANALYZE_URLS) {
        const batch = urls.slice(i, i + MAX_ANALYZE_URLS);
        const response = await fetch('/api/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: batch }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || '批量解析失败。');
        }
        const result: BatchParseResult = await response.json();
        sources.push(...result.sources);
        errors.push(...result.errors);
        setAnalyzeProgress({ done: sources.length + errors.length, total: urls.length });
      }

      setAnalyzeItems(sources.map((source) => ({ source })));
      setAnalyzeErrors(errors);

      if (sources.length === 0) {
        notify('所有候选文章解析失败，无法生成摘要。', 'error');
        setPhase('idle');
        return;
      }

      if (sources.length <= 3) {
        notify(`已解析 ${sources.length} 篇，直接跳过摘要。`, 'info');
        setPhase('idle');
        return;
      }

      setAnalyzeStep('summarizing');
      setPhase('summarizing');
      setAnalyzeProgress({ done: 0, total: sources.length });
      const summarizeResponse = await fetch('/api/batch-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      if (!summarizeResponse.ok) {
        const data = await summarizeResponse.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '摘要失败。');
      }
      const { summaries } = (await summarizeResponse.json()) as { summaries: SourceSummary[] };
      const updated: BatchItem[] = sources.map((source, index) => ({
        source,
        summary: summaries[index],
      }));
      setAnalyzeItems(updated);
      notify(`已解析 ${sources.length} 篇并生成摘要。`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : '分析失败。', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const manualCount = extraUrls
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  const isBusy = phase !== 'idle';
  const allUrlsCount = collectUrls().length;

  const sourceLabel =
    discoveryType === 'homepage-url'
      ? '公众号主页链接'
      : discoveryType === 'article-url'
        ? '公众号文章链接'
        : '公开搜索';

  const showNoCandidatesHint = candidates.length === 0 && engine;
  const showEmptyMainlineHelp =
    discoveryType === 'homepage-url' &&
    candidates.length === 0 &&
    engineSelection !== undefined;

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
            <label className="field-label" htmlFor="discover-query-input">
              公众号名称 / 主页链接 / 任意文章链接
            </label>
            <input
              id="discover-query-input"
              type="text"
              placeholder="如：程序员鱼皮，或 https://mp.weixin.qq.com/s/..."
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isBusy && handleDiscover()}
              disabled={isBusy}
            />
          </div>
          <div className="discover-limit">
            <label className="field-label" htmlFor="discover-limit-select">
              先发现多少篇
            </label>
            <select
              id="discover-limit-select"
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

        <div className="engine-picker" role="group" aria-labelledby="engine-picker-label">
          <span className="field-label" id="engine-picker-label">
            搜索源
          </span>
          <div className="engine-options">
            {ENGINE_OPTIONS.map((option) => (
              <label key={option.id} className="engine-option">
                <input
                  type="checkbox"
                  checked={enabledEngines.has(option.id)}
                  onChange={() => handleEngineToggle(option.id)}
                  disabled={isBusy}
                />
                <span className={option.id === 'sogou' ? 'engine-option-warn' : 'engine-option-label'}>
                  {option.label}
                </span>
              </label>
            ))}
          </div>
          <p className="hint-text">
            默认开启 DuckDuckGo + Bing。搜狗微信搜索是中文公众号索引最强的引擎,但会触发验证码,
            失败时不会影响其他引擎的结果。
          </p>
        </div>

        {engine && (
          <p className="engine-hint">
            来源：{sourceLabel} / {engine}
            {hint ? ` · ${hint}` : ''}
          </p>
        )}
      </div>

      {accountProfile && (
        <div className="panel account-profile-panel">
          <div>
            <span className="section-kicker">已识别公众号</span>
            <strong>{accountProfile.name}</strong>
          </div>
          {accountProfile.homepageUrl && (
            <div>
              <span className="section-kicker">公众号主页链接</span>
              <a href={accountProfile.homepageUrl} target="_blank" rel="noopener noreferrer">
                {accountProfile.homepageUrl}
              </a>
            </div>
          )}
          {accountProfile.sourceArticleUrl && (
            <p className="hint-text">来源文章：{accountProfile.sourceArticleUrl}</p>
          )}
        </div>
      )}

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

      {engineSelection && Object.keys(engineSelection.errors).length > 0 && (
        <div className="panel error">
          <strong>部分搜索引擎出错:</strong>
          <p className="hint-text">这些搜索源请求失败，不代表该公众号没有文章；可稍后重试或先用其它搜索源结果。</p>
          <ul className="resource-list">
            {Object.entries(engineSelection.errors).map(([name, message]) => (
              <li key={name}>
                <code>{name}</code>: {String(message)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {engineSelection?.noResults && engineSelection.noResults.length > 0 && candidates.length === 0 && (
        <div className="panel">
          <strong>已搜索但未找到匹配文章:</strong>
          <p className="hint-text">
            {engineSelection.noResults.join('、')} 请求成功，但没有返回可用的公众号文章候选。这和上方“搜索引擎出错”不同。
          </p>
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
                    disabled={isBusy}
                  />
                  <div className="candidate-content">
                    <a className="candidate-title" href={candidate.url} target="_blank" rel="noopener noreferrer">
                      <span className="candidate-rank">#{index + 1}</span>
                      <span className="candidate-source">{formatCandidateSource(candidate.discoverySource)}</span>
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
          <label className="field-label" htmlFor="discover-extra-urls">
            手动追加文章 URL(每行一个,可选)
          </label>
          <textarea
            id="discover-extra-urls"
            className="batch-textarea"
            rows={3}
            placeholder={'https://mp.weixin.qq.com/s/...'}
            value={extraUrls}
            onChange={(e) => setExtraUrls(e.target.value)}
            disabled={isBusy}
          />
          <p className="hint-text">
            已选 {selected.size} 篇候选 + {manualCount} 个手动 URL(共 {allUrlsCount} 个)。
            {allUrlsCount > MAX_ANALYZE_URLS
              ? `全部分析会自动按 ${MAX_ANALYZE_URLS} 篇/批串行处理。`
              : '进入下一步后会抓取正文,并可生成逐篇摘要。'}
          </p>
          <div className="actions">
            <button onClick={handleAnalyze} disabled={isBusy || allUrlsCount === 0}>
              分析所选文章(移交到批量分析)
            </button>
            <button
              className="secondary"
              onClick={handleAnalyzeAllInPlace}
              disabled={isBusy || allUrlsCount === 0}
            >
              {phase === 'analyzing' && analyzeStep === 'parsing'
                ? `解析中... ${analyzeProgress.done}/${analyzeProgress.total}`
                : phase === 'summarizing'
                  ? `摘要中... ${analyzeProgress.done}/${analyzeProgress.total}`
                  : '全部分析并生成摘要'}
            </button>
          </div>
        </div>
      )}

      {showNoCandidatesHint && (
        <div className="panel">
          <h3>没有找到候选文章</h3>
          <p>可能原因:</p>
          <ul className="resource-list">
            <li>公开搜索引擎暂未收录该公众号文章。</li>
            <li>公众号主页链接需要登录态,分享出来的页面没有暴露公开文章列表。</li>
            <li>搜索词与公众号名称不完全一致,可尝试复制更准确的账号名。</li>
            <li>搜索源被全部关闭或触发反爬验证码,可尝试勾选其他搜索引擎。</li>
          </ul>
          <p className="hint-text">你也可以切换到“多链接批量分析”模式,手动粘贴文章 URL 继续分析。</p>
        </div>
      )}

      {showEmptyMainlineHelp && (
        <div className="panel">
          <h3>该公众号主页不公开文章列表</h3>
          <p>微信公众号主页(`mp.weixin.qq.com/mp/profile_ext`)通常需要登录态,未登录访问只会返回空列表。
            推荐两种继续工作的方式:</p>
          <ul className="resource-list">
            <li>改用<strong>公众号名称</strong>搜索(把链接换成名称,如「AI星火研习社」),系统会用公开搜索引擎补全文章候选。</li>
            <li>粘贴任意一篇该公众号的文章链接,系统会自动识别出公众号并触发相同的搜索兜底。</li>
            <li>勾选 <strong>搜狗微信</strong> 引擎,通常能补齐一部分公众号文章列表(但可能触发验证码)。</li>
          </ul>
          <p className="hint-text">仍可通过下方的“手动追加 URL”继续分析。</p>
        </div>
      )}

      {(phase === 'analyzing' || phase === 'summarizing') && (
        <div className="panel">
          <div className="loading" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <span>
              {analyzeStep === 'parsing'
                ? `正在解析 ${analyzeSourceLabel} 的候选文章... ${analyzeProgress.done}/${analyzeProgress.total}`
                : `正在为 ${analyzeSourceLabel} 的候选文章生成摘要... ${analyzeProgress.done}/${analyzeProgress.total}`}
            </span>
          </div>
        </div>
      )}

      {analyzeItems.length > 0 && (
        <div className="panel">
          <h3>分析结果 · {analyzeSourceLabel}</h3>
          <p className="hint-text">
            已解析 {analyzeItems.length} 篇{analyzeErrors.length > 0 ? `,失败 ${analyzeErrors.length} 篇` : ''}。
            {analyzeItems[0]?.summary ? '已生成 AI 摘要。' : '未生成 AI 摘要。'}
          </p>
          {analyzeErrors.length > 0 && (
            <details className="error-list">
              <summary>跳过 {analyzeErrors.length} 个 URL(已折叠)</summary>
              <ul>
                {analyzeErrors.map((err) => (
                  <li key={err.url}>
                    <code>{err.url}</code> — {err.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="batch-items">
            {analyzeItems.map((item, index) => (
              <div key={item.source.sourceUrl} className="batch-item-card">
                <div className="batch-item-header">
                  <span className="batch-item-index">#{index + 1}</span>
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

function formatCandidateSource(source: DiscoveredArticle['discoverySource']): string {
  if (source === 'seed-article') return '当前文章';
  if (source === 'homepage') return '主页';
  if (source === 'search') return '搜索';
  return '候选';
}
