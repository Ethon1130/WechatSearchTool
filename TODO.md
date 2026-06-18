# 公众号研究助手 · 3 入口重构 TODO

> 定位:把当前的「单链接提取器」升级为「公众号研究助手」。
> 核心原则 —— **不声称能爬取全网公众号,而是通过公众号名称发现公开文章线索,再由用户确认后进行分析**。

---

## 一、设计定位与边界

| 我们做的事 | 我们明确不做的事 |
| --- | --- |
| 粘贴单篇链接 → 提取并可选摘要 | ❌ 登录公众号后台 / 调用任何需登录态的接口 |
| 粘贴多篇链接 → 批量提取并合并报告 | ❌ 爬取 sogou 微信搜索(已被官方限制) |
| 输入公众号名 → 公开搜索找候选 → 用户勾选 → 再分析 | ❌ 做全文索引 / 持久化用户数据到服务端(无数据库) |
| 原始数据 + AI 摘要 + 合并报告,均可导出 JSON / Markdown | ❌ 高频抓取、绕过反爬 |

对外统一话术:

> 工具通过公开搜索引擎为你发现 `<公众号名>` 的公开文章线索,以下列表只展示公开可访问的候选,**经你勾选后**才会被抓取和分析。如果候选不全,你也可以在下方手动追加 URL。

---

## 二、三个入口(用户体验视角)

### 入口 1:文章链接分析
- 输入:单篇公众号文章 URL(或普通网页 URL)
- 流程:粘贴 URL → 提取 → 可选 AI 摘要 → 导出
- 复用度:**完全复用** 现有的 `lib/parser.ts` + `/api/parse-wechat`,几乎零成本

### 入口 2:多链接批量分析
- 输入:多行 URL(每行一条,或自动识别 `mp.weixin.qq.com` 链接)
- 流程:粘贴多条 → 并发/顺序解析 → 逐篇生成摘要 → 合并为单一报告
- 关键产物:**MergedReport**(带总览 + 每篇 section)

### 入口 3:公众号账号发现模式 ⭐
- 输入:公众号名称(如「彭涛说」「彭少」「程序员章鱼哥」)
- 流程:
  1. 用公开搜索引擎(DuckDuckGo HTML 接口)执行 `site:mp.weixin.qq.com <名称>` 查询
  2. 解析搜索结果 → 候选 `DiscoveredArticle { title, url, snippet }`
  3. 前端 checkbox 列表,**用户确认** 哪些要分析
  4. 勾选后走「入口 2」的批量解析 + 合并报告流程
- 兜底:若搜索失败 / 候选为 0,引导用户**手动粘贴 URL**,不阻塞流程

---

## 三、目标文件结构

```
app/
  page.tsx                      # 入口选择页(三个卡片) ← 重写
  extract/page.tsx              # 入口 1:单链接(从 page.tsx 抽离)
  batch/page.tsx                # 入口 2:多链接
  discover/page.tsx             # 入口 3:账号发现
  report/page.tsx               # 合并报告展示(可被入口 2 / 3 复用)
  api/
    parse-wechat/route.ts       # 现有,保持不变
    summarize/route.ts          # 现有,保持不变
    discover/route.ts           # 新增
    batch/route.ts              # 新增
lib/
  parser.ts                     # 现有,保持不变
  deepseek.ts                   # 现有,扩展批量 + 合并函数
  types.ts                      # 现有,扩展新类型
  discover.ts                   # 新增:搜索结果 HTML 解析
  batch.ts                      # 新增:批量编排(并发/节流)
  report.ts                     # 新增:合并报告生成
```

> UI 形态可选方案:
> - **方案 A(推荐)**:一个 `app/page.tsx` + 三个 tab 模式(`mode: 'single' | 'batch' | 'discover'`),URL 保持 `/`,实现简单。
> - **方案 B**:拆为独立路由(`/extract`、`/batch`、`/discover`),URL 清晰、可分享。
>
> 实施时采用 **方案 A(单页 + 三个 tab)**,用户已确认。
> 搜索采用 **DuckDuckGo HTML 接口**(无 API Key、零新增依赖),用户已确认。

---

## 四、详细 TODO 列表

### 阶段 1:类型与基础库(预计 2~3 个任务)

- [ ] **T1.1** 扩展 `lib/types.ts`
  - 新增 `DiscoveredArticle { title, url, snippet, sourceName? }`
  - 新增 `BatchParseResult { sources: ExtractedSource[]; errors: Array<{ url: string; message: string }> }`
  - 新增 `MergedReport { title: string; generatedAt: string; items: Array<{ source: ExtractedSource; summary?: SourceSummary }>; overview?: string }`
  - 新增 `DiscoverResult { accountName: string; candidates: DiscoveredArticle[]; engine: string; hint?: string }`

- [ ] **T1.2** 扩展 `lib/deepseek.ts`,新增两个函数
  - `summarizeSources(sources: ExtractedSource[]): Promise<SourceSummary[]>` —— 串行调用现有 `summarizeSource`,间隔 ~500ms 防 QPS 触发
  - `mergeReport(items: Array<{ source, summary? }>, title?: string): Promise<string>` —— 跨篇 executive overview,中文,≤ 600 字,严格基于已提供的源

- [ ] **T1.3** 新增 `lib/batch.ts`
  - `parseBatch(urls: string[], concurrency = 3): Promise<BatchParseResult>` —— `Promise.allSettled` 包装 `parseSource`,失败项收集到 `errors`,成功的进入 `sources`

### 阶段 2:新增 API 路由(3 个)

- [ ] **T2.1** 新增 `app/api/discover/route.ts`
  - 入参:`{ accountName: string, limit?: number }`(默认 15)
  - 抓取 `https://html.duckduckgo.com/html/?q=site%3Amp.weixin.qq.com+<encoded name>`(也可考虑 Bing 兜底)
  - User-Agent 伪装浏览器,带 `Accept-Language: zh-CN`
  - 用 `cheerio` 解析 `.result__a`(title + href)、`.result__snippet`
  - URL 规范化:`mp.weixin.qq.com/s?__biz=...&mid=...&idx=...` 去重
  - 返回 `DiscoverResult`
  - 失败兜底:返回 `{ candidates: [], engine: 'duckduckgo', hint: '公开搜索暂无结果,可手动粘贴 URL' }`

- [ ] **T2.2** 新增 `app/api/batch/route.ts`
  - 入参:`{ urls: string[], withSummary?: boolean }`
  - 校验:URL 数量 ≤ 10(防滥用)
  - 调用 `parseBatch`,如果 `withSummary` 串行 `summarizeSources`
  - 返回 `BatchParseResult`

- [ ] **T2.3**(可选) `app/api/report/route.ts`
  - 入参:`{ items, title? }`,返回 `{ overview, ... }`
  - 若选 A(前端合并),可省略此路由,直接调 `mergeReport` 客户端

### 阶段 3:前端重构(5 个)

- [ ] **T3.1** 重写 `app/page.tsx` 为入口选择页(采用方案 A)
  - 顶部 hero:标题「公众号研究助手」+ 一句定位(强调「公开线索 + 用户确认」)
  - 三个 tab / 卡片:单链接、批量、账号发现
  - tab 状态用 `useState`,不引入路由
  - 选中后渲染对应组件:`<SingleMode />` / `<BatchMode />` / `<DiscoverMode />`

- [ ] **T3.2** 抽离 `<SourceViewer source summary />` 组件
  - 现有 `app/page.tsx` 中的 meta-grid、content-preview、summary-grid、images、links 全部抽到 `components/SourceViewer.tsx`
  - 三个入口的结果展示统一用此组件,行为完全一致

- [ ] **T3.3** 实现 `<SingleMode />`(入口 1)
  - 复用现有 input + 解析逻辑,基本就是搬迁
  - 「导出 JSON / Markdown」「生成摘要」按钮保持原样

- [ ] **T3.4** 实现 `<BatchMode />`(入口 2)
  - 多行 `<textarea>` 输入 URL,自动 split + trim + 去空
  - 实时显示解析进度:`3 / 8 完成`(可用进度条)
  - 全部完成后用 `<SourceViewer>` 列表展示,顶部加 `<MergedReportHeader>`(文章数 / 来源 / 总字符数)
  - 「导出合并报告」按钮:生成包含 overview + sections 的 Markdown / JSON

- [ ] **T3.5** 实现 `<DiscoverMode />`(入口 3)⭐
  - 输入框:公众号名称
  - 点击「发现公开文章」 → `POST /api/discover` → 展示候选列表
  - 每条候选:`<input type="checkbox">` + 标题(链接到原文) + 摘要片段 + URL
  - 顶部按钮:全选 / 反选 / 清空
  - 下方 textarea:**手动追加 URL**(关键兜底)
  - 点击「分析所选」 → 收集 checked + 手动追加的 URL → `POST /api/batch` → 跳转/内嵌 `<BatchMode>` 展示结果
  - 固定提示卡:
    > 工具通过公开搜索发现文章线索。**只有你勾选的链接才会被分析**。如果候选不全,可手动追加 URL。

### 阶段 4:文案与定位打磨(2 个)

- [ ] **T4.1** 更新 `app/layout.tsx` 的 metadata
  - `title: '公众号研究助手 | WeChat Research Tool'`
  - `description: '通过公众号名称发现公开文章线索,由你确认后再分析。'`

- [ ] **T4.2** 更新 `README.md`
  - 重写「What It Does」一节,描述三个入口
  - 强调边界:不爬全网、只处理公开内容、需要用户确认
  - 给三个入口各一段使用说明 + 1 个示例

### 阶段 5:稳健性(3 个,非阻塞)

- [ ] **T5.1** 速率限制
  - `/api/batch` 单次最多 10 个 URL
  - 摘要串行,每个间隔 500ms

- [ ] **T5.2** 错误处理
  - 单篇失败不影响整体批次,在结果旁显示「⚠️ 跳过」徽标
  - `BatchParseResult.errors` 在 UI 上折叠展示,不让一片红覆盖掉成功的部分

- [ ] **T5.3** 简单缓存(可选)
  - URL → 解析结果的内存 LRU(避免重复抓同一 URL)
  - 摘要同理

---

## 五、合并报告 Markdown 模板(参考)

```markdown
# {报告标题}

- 生成时间:{YYYY-MM-DD HH:mm}
- 文章数:{N}
- 来源公众号:{a, b, c}  ← 来自 sourceName 去重

## 总览(Overview)
{AI 合并摘要,跨篇 executive summary}

## 文章 1:{title}
- 来源:{sourceName}
- 作者:{author}  ·  发布时间:{publishTime}
- 链接:{sourceUrl}
- 摘要 Key Points:{...}
- 摘要 Entities:{...}
- 摘要 Business Signals:{...}
- 摘要 Useful Facts:{...}
- 摘要 Follow-up Ideas:{...}
- 原文内容:{contentText 截断 / 完整}

## 文章 2:{title}
...

---
*本报告基于 {N} 篇公开可访问的公众号文章。*
```

---

## 六、验收清单

- [ ] 首页能选 3 个入口之一
- [ ] 入口 1 行为与当前完全一致
- [ ] 入口 2 能一次处理 ≥ 3 个 URL,产出合并报告
- [ ] 入口 3 输入「彭涛说」等真实公众号名能返回 ≥ 3 个候选(失败时给出兜底提示)
- [ ] 三个入口的合并报告都能导出 JSON / Markdown
- [ ] 入口 3 的页面文案明确写出「公开线索 + 用户确认」的边界
- [ ] 单篇解析失败不会阻塞批次
- [ ] README 与首页文案体现「公开线索 + 用户确认」的专业定位

---

## 七、依赖与可复用

- 新增依赖:**无**(`cheerio` 已存在,`discover` 路由直接复用)
- 完全复用:`lib/parser.ts`、`app/api/parse-wechat/route.ts`、`app/api/summarize/route.ts`
- 主要新增代码量预估:
  - `lib/types.ts` + `lib/batch.ts` + `lib/discover.ts` + `lib/report.ts` ≈ 200 行
  - 3 个 API route ≈ 150 行
  - 前端三模式组件 ≈ 600 行
