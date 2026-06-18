'use client';

import { useState } from 'react';
import type { ExtractedSource, SourceSummary } from '@/lib/types';

interface SourceViewerProps {
  source: ExtractedSource;
  summary: SourceSummary | null;
  onGenerateSummary?: () => void;
  onExportJSON?: () => void;
  onExportMarkdown?: () => void;
  summarizing?: boolean;
  showActions?: boolean;
}

const CONTENT_PREVIEW_LIMIT = 1800;

export function SourceViewer({
  source,
  summary,
  onGenerateSummary,
  onExportJSON,
  onExportMarkdown,
  summarizing = false,
  showActions = true,
}: SourceViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const previewText = source.contentText || '';
  const shouldClamp = previewText.length > CONTENT_PREVIEW_LIMIT && !expanded;
  const displayText = shouldClamp ? `${previewText.slice(0, CONTENT_PREVIEW_LIMIT)}...` : previewText || '无内容';

  return (
    <div className="source-viewer">
      <div className="source-viewer-header">
        <div>
          <p className="eyebrow">{source.sourceType === 'wechat' ? '公众号文章' : '普通网页'}</p>
          <h3 className="source-viewer-title">{source.title || '未提取到标题'}</h3>
        </div>
        {showActions && (
          <div className="actions">
            {onExportJSON && (
              <button className="secondary" onClick={onExportJSON}>
                导出 JSON
              </button>
            )}
            {onExportMarkdown && (
              <button className="secondary" onClick={onExportMarkdown}>
                导出 Markdown
              </button>
            )}
            {onGenerateSummary && (
              <button onClick={onGenerateSummary} disabled={summarizing}>
                {summary ? '重新生成摘要' : '生成摘要'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="meta-grid">
        <Info label="来源" value={source.sourceName || '未知'} />
        <Info label="作者" value={source.author || '未知'} />
        <Info label="发布时间" value={source.publishTime || '未知'} />
        <Info label="内容长度" value={`${source.contentText.length} 字`} />
        <Info label="图片" value={`${source.images.length}`} />
        <Info label="链接" value={`${source.links.length}`} />
      </div>

      {source.digest && (
        <div className="digest">
          <span>摘要</span>
          <p>{source.digest}</p>
        </div>
      )}

      <div className="content-preview-section">
        <h4>原文内容</h4>
        <div className={expanded ? 'content-preview expanded' : 'content-preview'}>
          <p>{displayText}</p>
        </div>
        {previewText.length > CONTENT_PREVIEW_LIMIT && (
          <button className="text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起内容' : '展开完整内容'}
          </button>
        )}
      </div>

      {summary && (
        <div className="summary-section">
          <h4>AI 摘要</h4>
          <div className="summary-grid">
            <SummaryBlock title="Key Points" value={summary.keyPoints} />
            <SummaryBlock title="Entities" value={summary.entities} />
            <SummaryBlock title="Business Signals" value={summary.businessSignals} />
            <SummaryBlock title="Useful Facts" value={summary.usefulFacts} />
            <SummaryBlock title="Follow-up Ideas" value={summary.followUpIdeas} />
          </div>
        </div>
      )}

      {(source.images.length > 0 || source.links.length > 0) && (
        <div className="two-column">
          {source.images.length > 0 && (
            <div>
              <h4>图片</h4>
              <ul className="resource-list">
                {source.images.slice(0, 12).map((image) => (
                  <li key={image}>{image}</li>
                ))}
              </ul>
            </div>
          )}
          {source.links.length > 0 && (
            <div>
              <h4>链接</h4>
              <ul className="resource-list">
                {source.links.slice(0, 12).map((link) => (
                  <li key={`${link.text}-${link.href}`}>{`${link.text} - ${link.href}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="summary-block">
      <span>{title}</span>
      <p>{value || '无'}</p>
    </div>
  );
}
