'use client';

import { useState } from 'react';
import { BatchMode } from '@/components/modes/BatchMode';
import { DiscoverMode } from '@/components/modes/DiscoverMode';
import { SingleMode } from '@/components/modes/SingleMode';

type Mode = 'single' | 'batch' | 'discover';
type BannerType = 'error' | 'info';

const TABS: Array<{ id: Mode; label: string; description: string }> = [
  { id: 'single', label: '单链接分析', description: '支持公众号文章与普通网页总结' },
  { id: 'batch', label: '多链接批量分析', description: '批量解析公众号文章/网页并合并报告' },
  { id: 'discover', label: '公众号账号发现', description: '输入公众号名,发现公开文章后勾选分析' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('single');
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

  const handleSwitchToBatch = (urls: string[]) => {
    setBatchSeedUrls(urls);
    setBatchSeedKey((prev) => prev + 1);
    setMode('batch');
    notify(`已从账号发现移交 ${urls.length} 个 URL 到批量分析。`, 'info');
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">公众号与网页研究助手 · WeChat Research Tool</p>
          <h1>提取公众号文章与普通网页,生成摘要和研究报告</h1>
          <p className="subtitle">
            支持粘贴公众号文章 URL 或普通网页 URL,提取标题、来源、正文、图片与链接,并可选生成 AI 摘要。
            当你只知道公众号名称时,工具也能通过公开搜索发现候选文章;经你确认后再解析。原始数据与合并报告均可导出为 JSON / Markdown。
          </p>
        </div>
      </section>

      <section className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={mode === tab.id ? 'tab-button active' : 'tab-button'}
            onClick={() => setMode(tab.id)}
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

      {mode === 'single' && <SingleMode notify={notify} />}
      {mode === 'batch' && <BatchMode key={batchSeedKey} notify={notify} initialUrls={batchSeedUrls} />}
      {mode === 'discover' && <DiscoverMode notify={notify} onHandOff={handleSwitchToBatch} />}

      <footer className="page-footer">
        <p>
          边界:不做需登录的抓取 · 不持久化用户数据 · 公开搜索仅返回搜索引擎收录结果 · 请尊重原始内容版权
        </p>
      </footer>
    </main>
  );
}
