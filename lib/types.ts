export interface WeChatArticle {
  title: string;
  accountName: string;
  author: string;
  digest: string;
  cover: string;
  contentText: string;
  contentHtml: string;
  sourceUrl: string;
}

export interface ArticleSummary {
  coreInsights: string;
  productInfo: string;
  businessDirection: string;
  growthStrategy: string;
  interviewInsights: string;
}

export interface ExportData {
  article: WeChatArticle;
  summary: ArticleSummary;
  exportedAt: string;
}

export interface ParseError {
  error: string;
  detail?: string;
}
