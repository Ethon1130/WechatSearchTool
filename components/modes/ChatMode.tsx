'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type {
  BatchItem,
  BatchParseResult,
  ResearchAgentStep,
  ResearchArtifact,
  ResearchChatMessage,
  SourceSummary,
} from '@/lib/types';

interface ChatModeProps {
  notify: (message: string, type?: 'error' | 'info') => void;
}

type AgentStatus = 'waiting' | 'running' | 'done' | 'warning' | 'error';

const MAX_URLS = 10;
const AGENT_STEPS: Array<{
  id: ResearchAgentStep;
  name: string;
  description: string;
}> = [
  { id: 'extracting', name: 'ExtractorAgent', description: '提取标题、来源、正文、图片和链接' },
  { id: 'summarizing', name: 'SummarizerAgent', description: '生成逐篇结构化摘要' },
  { id: 'extracting-insights', name: 'InsightAgent', description: '整理实体、事实、商业信号和追问方向' },
  { id: 'composing-report', name: 'ReportAgent', description: '生成跨篇总览和可导出研究包' },
];

const DEFAULT_STATUSES: Record<ResearchAgentStep, AgentStatus> = {
  extracting: 'waiting',
  summarizing: 'waiting',
  'extracting-insights': 'waiting',
  'composing-report': 'waiting',
  ready: 'waiting',
  failed: 'waiting',
};

export function ChatMode({ notify }: ChatModeProps) {
  const [prompt, setPrompt] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [messages, setMessages] = useState<ResearchChatMessage[]>([
    buildMessage(
      'assistant',
      '粘贴 1-10 个公众号文章或普通网页链接，我会自动完成提取、摘要、研究洞察和跨篇整合。'
    ),
  ]);
  const [artifact, setArtifact] = useState<ResearchArtifact | null>(null);

  const urls = useMemo(() => parseUrls(prompt), [prompt]);
  const hasArtifact = Boolean(artifact?.sources.length);

  const setAgentStatus = (step: ResearchAgentStep, status: AgentStatus) => {
    setStatuses((current) => ({ ...current, [step]: status }));
  };

  const resetAgents = () => {
    setStatuses(DEFAULT_STATUSES);
  };

  const addMessage = (role: ResearchChatMessage['role'], content: string, nextArtifact?: ResearchArtifact) => {
    setMessages((current) => [...current, buildMessage(role, content, nextArtifact)]);
  };

  const runResearch = async () => {
    if (urls.length === 0) {
      notify('请先粘贴至少一个可访问的 URL。', 'error');
      return;
    }
    if (urls.length > MAX_URLS) {
      notify(`对话研究一次最多处理 ${MAX_URLS} 个 URL。`, 'error');
      return;
    }

    notify('');
    resetAgents();
    setBusy(true);
    setArtifact(null);
    addMessage('user', prompt.trim());

    try {
      setAgentStatus('extracting', 'running');
      const batchResponse = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!batchResponse.ok) {
        const data = await batchResponse.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '链接提取失败。');
      }
      const batchResult = (await batchResponse.json()) as BatchParseResult;
      setAgentStatus('extracting', batchResult.sources.length > 0 ? 'done' : 'error');

      if (batchResult.sources.length === 0) {
        const emptyArtifact = buildArtifact([], [], '', batchResult.errors);
        setArtifact(emptyArtifact);
        setAgentStatus('failed', 'error');
        addMessage('assistant', '没有成功提取到文章内容，请检查链接是否可公开访问。', emptyArtifact);
        return;
      }

      let summaries: SourceSummary[] = [];
      let overview = '';
      let aiUnavailableMessage = '';

      setAgentStatus('summarizing', 'running');
      try {
        const summaryResponse = await fetch('/api/batch-summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: batchResult.sources }),
        });
        if (!summaryResponse.ok) {
          const data = await summaryResponse.json().catch(() => ({}));
          throw new Error(data.detail || data.error || '摘要生成失败。');
        }
        const data = (await summaryResponse.json()) as { summaries: SourceSummary[] };
        summaries = data.summaries;
        setAgentStatus('summarizing', 'done');
      } catch (error) {
        aiUnavailableMessage = getReadableError(error);
        setAgentStatus('summarizing', 'warning');
      }

      setAgentStatus('extracting-insights', summaries.length > 0 ? 'done' : 'warning');

      setAgentStatus('composing-report', 'running');
      if (summaries.length > 0) {
        try {
          const items: BatchItem[] = batchResult.sources.map((source, index) => ({
            source,
            summary: summaries[index],
          }));
          const mergeResponse = await fetch('/api/merge-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, title: guessResearchTitle(batchResult.sources[0]?.sourceName) }),
          });
          if (!mergeResponse.ok) {
            const data = await mergeResponse.json().catch(() => ({}));
            throw new Error(data.detail || data.error || '跨篇总览生成失败。');
          }
          const data = (await mergeResponse.json()) as { overview: string };
          overview = data.overview;
          setAgentStatus('composing-report', 'done');
        } catch (error) {
          aiUnavailableMessage = aiUnavailableMessage || getReadableError(error);
          setAgentStatus('composing-report', 'warning');
        }
      } else {
        setAgentStatus('composing-report', 'warning');
      }

      const nextArtifact = buildArtifact(batchResult.sources, summaries, overview, batchResult.errors);
      setArtifact(nextArtifact);
      setAgentStatus('ready', 'done');
      addMessage('assistant', buildCompletionMessage(nextArtifact, aiUnavailableMessage), nextArtifact);
    } catch (error) {
      setAgentStatus('failed', 'error');
      notify(getReadableError(error), 'error');
      addMessage('assistant', getReadableError(error));
    } finally {
      setBusy(false);
    }
  };

  const askFollowUp = async () => {
    if (!artifact?.sources.length) {
      notify('请先粘贴链接并完成一次研究。', 'error');
      return;
    }
    if (!followUp.trim()) {
      notify('请输入要追问的问题。', 'error');
      return;
    }

    notify('');
    setAsking(true);
    const question = followUp.trim();
    setFollowUp('');
    addMessage('user', question);

    try {
      const response = await fetch('/api/research-follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, artifact }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || '追问生成失败。');
      }
      const data = (await response.json()) as { answer: string };
      addMessage('assistant', data.answer);
    } catch (error) {
      notify(getReadableError(error), 'error');
      addMessage('assistant', `追问暂时失败：${getReadableError(error)}`);
    } finally {
      setAsking(false);
    }
  };

  const exportMarkdown = () => {
    if (!artifact) return;
    downloadFile(buildResearchMarkdown(artifact), 'ai-research-report.md', 'text/markdown;charset=utf-8');
  };

  const exportJSON = () => {
    if (!artifact) return;
    downloadFile(JSON.stringify(artifact, null, 2), 'ai-research-report.json', 'application/json;charset=utf-8');
  };

  return (
    <div className="mode-panel chat-mode">
      <div className="mode-intro">
        <h2>多 Agent 研究室</h2>
        <p>直接粘贴链接，研究助理会按多 agent 步骤自动提取、总结、整理洞察，并支持基于本轮结果继续追问。</p>
      </div>

      <div className="panel chat-input-panel">
        <label className="field-label" htmlFor="research-chat-input">
          链接和研究要求
        </label>
        <textarea
          id="research-chat-input"
          className="batch-textarea chat-textarea"
          placeholder={'https://mp.weixin.qq.com/s/...\nhttps://example.com/article\n\n也可以补充：重点关注竞品、商业信号或可复用事实'}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={busy}
        />
        <div className="batch-meta">
          <span>已识别 {urls.length} / {MAX_URLS} 个 URL</span>
          <button onClick={runResearch} disabled={busy || urls.length === 0}>
            {busy ? '研究中...' : '开始 AI 研究'}
          </button>
        </div>
      </div>

      <div className="agent-grid">
        {AGENT_STEPS.map((step) => (
          <AgentStepCard key={step.id} {...step} status={statuses[step.id]} />
        ))}
      </div>

      {artifact && (
        <div className="panel research-result-panel">
          <div className="research-result-header">
            <div>
              <h3>研究摘要包</h3>
              <p>{artifact.sources.length} 篇成功，{artifact.errors.length} 个失败链接。</p>
            </div>
            <div className="actions">
              <button className="secondary" onClick={exportMarkdown}>导出 MD</button>
              <button className="secondary" onClick={exportJSON}>导出 JSON</button>
            </div>
          </div>

          {artifact.overview && (
            <div className="overview-block">
              <span>跨篇总览</span>
              <p>{artifact.overview}</p>
            </div>
          )}

          <div className="research-items">
            {artifact.sources.map((source, index) => (
              <article className="research-item" key={source.sourceUrl}>
                <div className="research-item-heading">
                  <span>#{index + 1}</span>
                  <h4>{source.title || '未提取到标题'}</h4>
                </div>
                <p className="research-item-meta">
                  {source.sourceName || '未知来源'} · {source.publishTime || '未知时间'} · {source.sourceType}
                </p>
                <SummaryPreview summary={artifact.summaries[index]} fallback={source.digest || source.contentText.slice(0, 220)} />
              </article>
            ))}
          </div>

          {artifact.errors.length > 0 && (
            <details className="error-list">
              <summary>失败链接 {artifact.errors.length} 个</summary>
              <ul>
                {artifact.errors.map((error) => (
                  <li key={error.url}>
                    <code>{error.url}</code> - {error.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="panel chat-thread-panel">
        <h3>对话</h3>
        <div className="chat-thread">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <span>{message.role === 'user' ? '你' : 'AI 研究助理'}</span>
              <MarkdownContent content={message.content} />
            </div>
          ))}
        </div>
        <div className="chat-followup-row">
          <label className="sr-only" htmlFor="research-followup-input">继续追问</label>
          <input
            id="research-followup-input"
            type="text"
            placeholder={hasArtifact ? '基于本轮结果继续追问...' : '完成一次研究后可以继续追问'}
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && askFollowUp()}
            disabled={!hasArtifact || asking || busy}
          />
          <button onClick={askFollowUp} disabled={!hasArtifact || asking || busy}>
            {asking ? '回答中...' : '追问'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentStepCard({
  name,
  description,
  status,
}: {
  name: string;
  description: string;
  status: AgentStatus;
}) {
  return (
    <div className={`agent-step ${status}`}>
      <div>
        <strong>{name}</strong>
        <p>{description}</p>
      </div>
      <span>{statusLabel(status)}</span>
    </div>
  );
}

function SummaryPreview({ summary, fallback }: { summary?: SourceSummary; fallback: string }) {
  if (!summary) {
    return <p className="research-fallback">{fallback || '已完成提取；配置 API Key 后可生成 AI 摘要。'}</p>;
  }

  return (
    <div className="summary-grid compact-summary">
      <SummaryCell title="关键观点" value={summary.keyPoints} />
      <SummaryCell title="实体" value={summary.entities} />
      <SummaryCell title="商业信号" value={summary.businessSignals} />
      <SummaryCell title="可复用事实" value={summary.usefulFacts} />
      <SummaryCell title="后续追问" value={summary.followUpIdeas} />
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="markdown-content">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h4 key={index}>{renderInlineMarkdown(block.text)}</h4>;
        }
        if (block.type === 'ordered-list') {
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'unordered-list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'paragraph') {
          return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
        }
        return null;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let orderedItems: string[] = [];
  let unorderedItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  const flushOrdered = () => {
    if (orderedItems.length > 0) {
      blocks.push({ type: 'ordered-list', items: orderedItems });
      orderedItems = [];
    }
  };

  const flushUnordered = () => {
    if (unorderedItems.length > 0) {
      blocks.push({ type: 'unordered-list', items: unorderedItems });
      unorderedItems = [];
    }
  };

  const flushLists = () => {
    flushOrdered();
    flushUnordered();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushLists();
      continue;
    }

    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushLists();
      blocks.push({ type: 'heading', text: headingMatch[1] });
      continue;
    }

    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushUnordered();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushOrdered();
      unorderedItems.push(unorderedMatch[1]);
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();
  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function SummaryCell({ title, value }: { title: string; value: string }) {
  return (
    <div className="summary-block">
      <span>{title}</span>
      <p>{value || '暂无'}</p>
    </div>
  );
}

function parseUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s，,。；;]+/g) || [];
  return Array.from(new Set(matches.map((url) => url.trim())));
}

function buildArtifact(
  sources: ResearchArtifact['sources'],
  summaries: SourceSummary[],
  overview: string,
  errors: ResearchArtifact['errors']
): ResearchArtifact {
  return {
    sources,
    summaries,
    ...(overview ? { overview } : {}),
    errors,
    generatedAt: new Date().toISOString(),
  };
}

function buildCompletionMessage(artifact: ResearchArtifact, warning: string): string {
  const base = `研究完成：成功提取 ${artifact.sources.length} 篇，失败 ${artifact.errors.length} 个链接。`;
  if (warning) {
    return `${base} 提取结果已可查看；AI 摘要、追问或跨篇总览需要可用的 DeepSeek API Key。具体信息：${warning}`;
  }
  return `${base} 已生成摘要、洞察和跨篇总览，可以继续追问或导出。`;
}

function buildMessage(
  role: ResearchChatMessage['role'],
  content: string,
  artifact?: ResearchArtifact
): ResearchChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(artifact ? { artifact } : {}),
  };
}

function getReadableError(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误。';
}

function guessResearchTitle(sourceName?: string): string {
  return sourceName ? `${sourceName} AI 对话研究报告` : 'AI 对话研究报告';
}

function statusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    waiting: '等待',
    running: '运行中',
    done: '完成',
    warning: '需配置',
    error: '失败',
  };
  return labels[status];
}

function buildResearchMarkdown(artifact: ResearchArtifact): string {
  const sections = artifact.sources.map((source, index) => {
    const summary = artifact.summaries[index];
    return [
      `## ${index + 1}. ${source.title || '未命名文章'}`,
      '',
      `- 来源：${source.sourceName || '未知'}`,
      `- 发布时间：${source.publishTime || '未知'}`,
      `- 链接：${source.sourceUrl}`,
      '',
      summary
        ? [
            '### 关键观点',
            summary.keyPoints || '暂无',
            '',
            '### 实体',
            summary.entities || '暂无',
            '',
            '### 商业信号',
            summary.businessSignals || '暂无',
            '',
            '### 可复用事实',
            summary.usefulFacts || '暂无',
            '',
            '### 后续追问',
            summary.followUpIdeas || '暂无',
          ].join('\n')
        : source.digest || source.contentText.slice(0, 800) || '暂无摘要',
    ].join('\n');
  });

  const failed = artifact.errors.length
    ? ['## 失败链接', '', ...artifact.errors.map((error) => `- ${error.url}: ${error.message}`)].join('\n')
    : '';

  return [
    '# AI 对话研究报告',
    '',
    `生成时间：${new Date(artifact.generatedAt).toLocaleString('zh-CN')}`,
    `成功文章：${artifact.sources.length}`,
    '',
    artifact.overview ? `## 跨篇总览\n\n${artifact.overview}` : '',
    '',
    ...sections,
    '',
    failed,
  ].filter(Boolean).join('\n\n');
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
