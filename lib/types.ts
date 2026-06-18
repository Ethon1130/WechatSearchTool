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
  accountProfile?: WechatAccountProfile;
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

export type DiscoveredArticleSource = 'seed-article' | 'homepage' | 'search';

export interface WechatAccountProfile {
  name: string;
  homepageUrl?: string;
  sourceArticleUrl?: string;
}

export interface DiscoveredArticle {
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
  discoverySource?: DiscoveredArticleSource;
}

export interface DiscoverOverview {
  articleCount: number;
  titleDirection: string;
  keywords: string[];
  sampleTitles: string[];
}

export type DiscoveryType = 'account-name' | 'homepage-url' | 'article-url';
export type EngineName = 'duckduckgo' | 'bing' | 'sogou';

export interface EngineSelection {
  requested: EngineName[];
  used: EngineName[];
  noResults?: EngineName[];
  errors: Partial<Record<EngineName, string>>;
}

export interface DiscoverResult {
  accountName: string;
  candidates: DiscoveredArticle[];
  engine: string;
  hint?: string;
  discoveryType?: DiscoveryType;
  overview?: DiscoverOverview;
  accountProfile?: WechatAccountProfile;
  engineSelection?: EngineSelection;
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
