export type SourceType = 'wechat' | 'webpage';

export interface ExtractedSource {
  title: string;
  sourceName: string;
  sourceType: SourceType;
  author: string;
  publishTime: string;
  digest: string;
  cover: string;
  contentText: string;
  contentHtml: string;
  sourceUrl: string;
  images: string[];
  links: Array<{
    text: string;
    href: string;
  }>;
  extractedAt: string;
}

export interface SourceSummary {
  keyPoints: string;
  entities: string;
  businessSignals: string;
  usefulFacts: string;
  followUpIdeas: string;
}

export interface ExportData {
  source: ExtractedSource;
  summary?: SourceSummary;
  exportedAt: string;
}

export interface ParseError {
  error: string;
  detail?: string;
}

export interface DiscoveredArticle {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
}

export interface DiscoverOverview {
  articleCount: number;
  titleDirection: string;
  keywords: string[];
  sampleTitles: string[];
}

export interface DiscoverResult {
  accountName: string;
  candidates: DiscoveredArticle[];
  engine: string;
  hint?: string;
  discoveryType?: 'account-name' | 'homepage-url' | 'article-url';
  overview?: DiscoverOverview;
}

export interface BatchParseError {
  url: string;
  message: string;
}

export interface BatchParseResult {
  sources: ExtractedSource[];
  errors: BatchParseError[];
}

export interface BatchItem {
  source: ExtractedSource;
  summary?: SourceSummary;
}

export interface MergedReport {
  title: string;
  generatedAt: string;
  items: BatchItem[];
  overview?: string;
}
