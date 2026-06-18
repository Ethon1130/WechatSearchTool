# 公众号研究助手 · WeChat Research Tool

> **定位**:不做"爬取全网公众号"的承诺,而是 **通过公众号名称发现公开文章线索 → 由用户确认 → 再进行分析**。

当用户只记得一个公众号名字(例如「彭涛说」「彭少」「程序员章鱼哥」),工具会通过公开搜索引擎为用户找到该公众号的公开文章候选,用户勾选后才抓取并分析。原始数据、摘要、合并报告均可导出为 JSON / Markdown。

---

## 三个入口

### 入口 1:单链接分析
- 输入:单篇公众号文章 URL 或普通网页 URL
- 流程:粘贴 → 提取 → 可选 AI 摘要 → 导出
- 适用:已知一篇文章地址,做深度阅读或资料归档

### 入口 2:多链接批量分析
- 输入:多行 URL(每行一条)
- 流程:批量解析(并发 3) → 逐篇生成 AI 摘要 → 合并报告
- 输出:可导出合并 Markdown / JSON,带跨篇总览(Overview)
- 适用:已经收集到一批相关文章,做主题研究

### 入口 3:公众号账号发现模式 ⭐
- 输入:公众号名称 / 公众号主页链接 / 任意一篇文章链接
- 流程:
  1. 通过 **DuckDuckGo + Bing 公开搜索**(可选启用搜狗微信)执行 `site:mp.weixin.qq.com <名称>` 等多组查询,优先用 `__biz` 做精确匹配
  2. 展示候选文章列表(标题 + 摘要片段 + URL)
  3. 用户**勾选**希望分析的文章(可全选/清空)
  4. 也可**手动追加 URL**(候选不全时的兜底)
  5. 两种继续方式:
     - **分析所选文章**:移交到入口 2 完成批量解析 + 摘要 + 合并报告
     - **全部分析并生成摘要**:原地按 10 篇/批串行解析 + 摘要,直接展示逐篇结果
- 兜底:若搜索无结果,引导用户切换到入口 2 手动粘贴,或在 Discover 页面手动追加 URL

---

## 边界(明确不做的事)

- ❌ 登录公众号后台 / 调用任何需登录态的接口
- ❌ 做全文索引 / 持久化用户数据到服务端(无数据库)
- ❌ 高频抓取、绕过反爬
- ⚠️ **搜狗微信搜索** (`weixin.sogou.com`) 作为可选引擎,**默认关闭**。只有用户在 UI 上明确勾选才请求,可能触发反爬验证码;失败不会影响其他引擎的结果。

我们做的事:
- ✅ 公开搜索引擎可见的公众号文章链接(默认 DuckDuckGo + Bing;搜狗可选)
- ✅ 用户确认后的抓取与解析
- ✅ 可选的 AI 摘要(DeepSeek)
- ✅ 原始数据 + 合并报告导出

---

## Setup

### Requirements
- Node.js >= 18.17
- npm / pnpm / yarn

### Install

```bash
npm install
```

### Optional AI Summary
原始解析无需任何环境变量。
要启用摘要功能,复制 `.env.local.example` 到 `.env.local` 并设置:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

> **安全提示**:`.env.local` 已在 `.gitignore` 中忽略,请勿提交任何含真实 key 的文件。
> 如不慎泄漏,立即到 [DeepSeek 控制台](https://platform.deepseek.com/) 吊销并重建。

### Run

PowerShell 可能阻止 `npm.ps1`,Windows 下请用 `npm.cmd`:

```bash
npm.cmd run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### Build

```bash
npm.cmd run build
npm.cmd start
```

---

## 数据结构

```ts
interface ExtractedSource {
  title: string;
  sourceName: string;
  sourceType: 'wechat' | 'webpage';
  author: string;
  publishTime: string;
  digest: string;
  cover: string;
  contentText: string;
  contentHtml: string;
  sourceUrl: string;
  images: string[];
  links: Array<{ text: string; href: string }>;
  extractedAt: string;
}

interface SourceSummary {
  keyPoints: string;
  entities: string;
  businessSignals: string;
  usefulFacts: string;
  followUpIdeas: string;
}

interface DiscoveredArticle {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
}

interface DiscoverResult {
  accountName: string;
  candidates: DiscoveredArticle[];
  engine: string;        // 当前实际使用的引擎(多引擎时用 '+' 连接)
  hint?: string;         // 无结果或部分失败时的兜底提示
  discoveryType?: 'account-name' | 'homepage-url' | 'article-url';
  overview?: DiscoverOverview;
  accountProfile?: WechatAccountProfile;
  engineSelection?: {
    requested: Array<'duckduckgo' | 'bing' | 'sogou'>;
    used: Array<'duckduckgo' | 'bing' | 'sogou'>;
    noResults?: Array<'duckduckgo' | 'bing' | 'sogou'>;
    errors: Partial<Record<'duckduckgo' | 'bing' | 'sogou', string>>;
  };
}

interface BatchParseResult {
  sources: ExtractedSource[];
  errors: Array<{ url: string; message: string }>;
}

interface MergedReport {
  title: string;
  generatedAt: string;
  items: Array<{ source: ExtractedSource; summary?: SourceSummary }>;
  overview?: string;
}
```

---

## API

### `POST /api/parse-wechat`
单链接解析(同时支持公众号与普通网页)。

Request:
```json
{ "url": "https://mp.weixin.qq.com/s/xxxxx" }
```

Response:`ExtractedSource`

### `POST /api/summarize`
对单条 `ExtractedSource` 生成摘要(需 `DEEPSEEK_API_KEY`)。

Request:
```json
{ "source": { "title": "...", "contentText": "..." } }
```

Response:`SourceSummary`

### `POST /api/batch`
批量解析(单次最多 10 个 URL,内部并发 3)。

Request:
```json
{ "urls": ["https://...", "https://..."] }
```

Response:`BatchParseResult`

### `POST /api/discover`
公开搜索发现公众号文章候选,支持多引擎选择。

Request:
```json
{
  "accountName": "彭涛说",
  "limit": 15,
  "engines": ["duckduckgo", "bing"],
  "biz": "Mzg3NjI5Nzc3NQ=="
}
```

- `engines`:可选数组,支持 `duckduckgo` / `bing` / `sogou`。默认 `["duckduckgo","bing"]`,搜狗默认关闭。
- `biz`:从主页 URL 或文章 URL 提取的 `__biz`,传入后会显著提高搜索精确度。

Response:`DiscoverResult`

---

## 典型使用流程

### 场景 A:只知道公众号名

1. 切换到「公众号账号发现」
2. 输入「彭涛说」→ 点击「发现公开文章」
3. 在候选列表中勾选 5 篇,再手动追加 2 条已知 URL
4. 选择:
   - 点击 **「分析所选文章」** → 移交到「多链接批量分析」,在那里解析、生成摘要、生成跨篇总览并导出
   - 或点击 **「全部分析并生成摘要」** → 原地按 10 篇/批串行解析 + 摘要,直接在 Discover 页面查看逐篇结果

### 场景 B:已有 8 篇文章 URL

1. 切换到「多链接批量分析」
2. 粘贴 8 行 URL → 点击「批量解析」
3. 点击「为全部文章生成摘要」
4. 点击「生成跨篇总览」
5. 导出合并报告(MD / JSON)

### 场景 C:一篇深度文章

1. 切换到「单链接分析」
2. 粘贴 URL → 点击「提取」
3. 点击「生成摘要」→ 导出 Markdown / JSON

---

## 适用场景

- 公司 / 行业 / 竞品研究前的资料整理
- 跟踪某个公众号的系列观点
- 构建行业 / 竞品信息库
- 把数据喂给 LLM、RAG、Notion、飞书、Excel 等下游工作流

---

## 注意事项

- 部分公众号文章限制外站访问,可能解析失败(已归入 `BatchParseResult.errors`,不影响其他文章)
- 公开搜索结果取决于搜索引擎的收录情况,候选不全时可手动追加
- 微信公众号主页 (`mp.weixin.qq.com/mp/profile_ext`) 通常需要登录态,未登录访问时主页解析不到文章列表;系统会自动用公开搜索兜底
- 如果你需要增强公众号主页历史文章发现,可在 `.env.local` 配置自己的 `WECHAT_COOKIE` 后重启服务。工具只会把该 Cookie 发给 `mp.weixin.qq.com`,并且只读取一页候选文章;请只用于你有权访问的内容
- 搜狗微信搜索为可选引擎,可能触发反爬验证码,触发后会自动跳过,不影响其他引擎
- 请尊重原始内容版权,合理使用抓取结果
