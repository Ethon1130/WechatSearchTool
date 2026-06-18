# WeChat Research Agent

> 公众号文章调研工具 - 快速提取、整理和分析公众号内容

一个基于 Next.js 14+ App Router 的智能调研工具，帮助你从微信公众号文章中快速提取关键信息，并通过 AI 自动归类总结。

## 功能特性

- 🔗 **链接解析**：粘贴公众号文章链接，自动抓取文章内容
- 📝 **智能提取**：自动提取标题、公众号名、作者、正文、摘要、封面
- 🤖 **AI 总结**：调用 DeepSeek AI 从 5 个维度分析文章
- 📊 **结构化输出**：核心观点、产品信息、业务方向、增长策略、面试启发
- 💾 **一键导出**：支持 JSON 和 Markdown 格式下载报告

## 快速开始

### 环境要求

- Node.js >= 18.17
- npm / pnpm / yarn

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量示例文件：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 DeepSeek API Key：

```env
API_KEY=your_deepseek_api_key_here
```

获取 API Key：[DeepSeek Platform](https://platform.deepseek.com/)

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 使用方法

1. 在输入框中粘贴公众号文章链接（必须包含 `mp.weixin.qq.com`）
2. 点击「开始分析」按钮
3. 等待解析和 AI 分析完成（约 10-30 秒）
4. 查看分析结果：
   - **文章基本信息**：标题、公众号、作者、摘要
   - **AI 智能分析**：5 个维度的结构化总结
5. 点击「导出 JSON」或「导出 Markdown」下载报告

## AI 分析维度

| 维度 | 说明 |
|------|------|
| 核心观点 | 文章主要想表达什么？ |
| 产品/公司信息 | 提到了哪些产品、项目或公司？ |
| 业务方向 | 文章体现了什么业务发展方向？ |
| 增长策略 | 有哪些增长或运营策略值得学习？ |
| 面试启发 | 对面试这家公司的候选人有什么建议？ |

## 技术栈

- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript
- **前端**：React 19
- **后端**：Next.js API Routes
- **HTML 解析**：Cheerio
- **AI 服务**：DeepSeek API

## 项目结构

```
WechatResearchTool/
├── app/
│   ├── page.tsx                       # 主页面（UI + 交互逻辑）
│   ├── layout.tsx                     # 根布局
│   ├── globals.css                    # 全局样式
│   └── api/
│       ├── parse-wechat/
│       │   └── route.ts               # 解析公众号文章 API
│       └── summarize/
│           └── route.ts               # AI 总结 API
├── lib/
│   ├── parser.ts                      # Cheerio 解析逻辑
│   ├── deepseek.ts                    # DeepSeek API 调用 + 响应解析
│   └── types.ts                       # TypeScript 类型定义
├── .env.local.example                 # 环境变量模板
├── .gitignore                         # Git 忽略文件
├── next.config.js                     # Next.js 配置
├── package.json                       # 项目依赖
├── tsconfig.json                      # TypeScript 配置
└── README.md                          # 项目说明
```

## API 端点

### POST `/api/parse-wechat`

解析公众号文章

**请求体**：
```json
{ "url": "https://mp.weixin.qq.com/s/xxxxx" }
```

**响应**：
```json
{
  "title": "文章标题",
  "accountName": "公众号名称",
  "author": "作者",
  "digest": "摘要",
  "cover": "封面图URL",
  "contentText": "正文文本",
  "contentHtml": "正文HTML",
  "sourceUrl": "原文链接"
}
```

### POST `/api/summarize`

调用 DeepSeek AI 总结

**请求体**：
```json
{ "content": "文章正文", "title": "文章标题" }
```

**响应**：
```json
{
  "coreInsights": "核心观点",
  "productInfo": "产品/公司信息",
  "businessDirection": "业务方向",
  "growthStrategy": "增长策略",
  "interviewInsights": "面试启发"
}
```

## 常见问题

### 解析失败怎么办？

部分公众号文章可能设置了访问限制（仅微信内可访问），此时解析会失败。可以尝试：
- 在微信中打开文章，确认可以正常访问
- 复制完整的文章链接（包含 `?__biz=` 等参数）

### AI 总结质量如何？

总结质量取决于 DeepSeek 模型的输出。建议：
- 提供完整、正文的文章
- 文章内容过短时，分析可能较为简略

### 部署到 Vercel

```bash
npm i -g vercel
vercel
```

记得在 Vercel 控制台配置 `API_KEY` 环境变量。

## 注意事项

- 部分公众号文章可能设置了访问限制，解析可能失败
- AI 总结质量取决于 DeepSeek API 的响应
- 请合理使用，避免频繁请求导致 API 限流
- 工具仅供学习研究使用，请尊重原创内容版权

## License

MIT
