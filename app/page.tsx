'use client';

import { useState, type CSSProperties } from 'react';
import { BatchMode } from '@/components/modes/BatchMode';
import { ChatMode } from '@/components/modes/ChatMode';
import { DiscoverMode } from '@/components/modes/DiscoverMode';
import { SingleMode } from '@/components/modes/SingleMode';

type Mode = 'single' | 'batch' | 'discover' | 'chat';
type BannerType = 'error' | 'info';

const TABS: Array<{ id: Mode; label: string; description: string }> = [
  { id: 'chat', label: '多 Agent 研究室', description: '多智能体协同提取、总结、追问和导出' },
  { id: 'single', label: '单链接分析', description: '支持公众号文章与普通网页总结' },
  { id: 'batch', label: '多链接批量分析', description: '批量解析文章并合并成研究报告' },
  { id: 'discover', label: '公众号账号发现', description: '输入公众号名，发现公开文章后勾选分析' },
];

const MODE_INDEX = TABS.reduce<Record<Mode, number>>((acc, tab, index) => {
  acc[tab.id] = index;
  return acc;
}, {} as Record<Mode, number>);

type ModeTransitionStyle = CSSProperties & {
  '--mode-direction': number;
};

export default function Home() {
  const [mode, setMode] = useState<Mode>('chat');
  const [transitionDirection, setTransitionDirection] = useState(1);
  const [banner, setBanner] = useState<{ type: BannerType; message: string } | null>(null);
  const [batchSeedUrls, setBatchSeedUrls] = useState<string[]>([]);
  const [batchSeedKey, setBatchSeedKey] = useState(0);

  const notify = (message: string, type: BannerType = 'info') => {
    if (!message) {
      setBanner(null);
      return;
    }
    setBanner({ type, message });
  };

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) {
      return;
    }

    setTransitionDirection(MODE_INDEX[nextMode] > MODE_INDEX[mode] ? 1 : -1);
    setMode(nextMode);
  };

  const handleSwitchToBatch = (urls: string[]) => {
    setBatchSeedUrls(urls);
    setBatchSeedKey((prev) => prev + 1);
    handleModeChange('batch');
    notify(`已从账号发现移交 ${urls.length} 个 URL 到批量分析。`, 'info');
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">公众号与网页研究助手 / WeChat Research Tool</p>
          <h1>提取公众号文章与普通网页，生成摘要和研究报告</h1>
          <p className="subtitle">
            支持粘贴公众号文章 URL 或普通网页 URL，提取标题、来源、正文、图片与链接，并可选择生成 AI 摘要。
            当你只知道公众号名称时，工具也能通过公开搜索发现候选文章；现在也可以直接在对话入口里让 AI 自动完成研究整理。
          </p>
        </div>
      </section>

      <section className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={mode === tab.id ? 'tab-button active' : 'tab-button'}
            aria-pressed={mode === tab.id}
            aria-current={mode === tab.id ? 'page' : undefined}
            onClick={() => handleModeChange(tab.id)}
            type="button"
          >
            <span className="tab-label">{tab.label}</span>
            <span className="tab-description">{tab.description}</span>
          </button>
        ))}
      </section>

      {banner && (
        <div className={banner.type === 'error' ? 'error' : 'info-banner'}>{banner.message}</div>
      )}

      <section
        key={mode}
        className="mode-transition"
        style={{ '--mode-direction': transitionDirection } as ModeTransitionStyle}
      >
        {mode === 'single' && <SingleMode notify={notify} />}
        {mode === 'batch' && <BatchMode key={batchSeedKey} notify={notify} initialUrls={batchSeedUrls} />}
        {mode === 'discover' && <DiscoverMode notify={notify} onHandOff={handleSwitchToBatch} />}
        {mode === 'chat' && <ChatMode notify={notify} />}
      </section>

      <footer className="page-footer">
        <p>
          边界：不做需要登录的抓取，不持久化用户数据；公开搜索仅返回搜索引擎收录结果，请尊重原始内容版权。
        </p>
      </footer>
    </main>
  );
}
