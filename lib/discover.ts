import type { DiscoveredArticle, DiscoverOverview } from './types';
import { parseSource } from './parser';

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const WECHAT_HOST = 'mp.weixin.qq.com';

interface DiscoverWechatArticlesResult {
  candidates: DiscoveredArticle[];
  engine: string;
  hint?: string;
  discoveryType: DiscoveryType;
  overview: DiscoverOverview;
}

type DiscoveryType = 'account-name' | 'homepage-url' | 'article-url';

interface WechatAppMsg {
  title?: string;
  content_url?: string;
  digest?: string;
  cover?: string;
  source_url?: string;
  multi_app_msg_item_list?: WechatAppMsg[];
}

interface WechatMsgListItem {
  app_msg_ext_info?: WechatAppMsg;
}

export async function discoverWechatArticles(
  accountNameOrUrl: string,
  limit: number = DEFAULT_LIMIT
): Promise<DiscoverWechatArticlesResult> {
  const input = accountNameOrUrl.trim();
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  if (!input) {
    return buildResult([], 'input', '请输入公众号名称或公众号主页链接。', 'account-name');
  }

  if (isLikelyUrl(input) && normalizeWechatArticleUrl(input)) {
    return discoverWechatArticlesFromArticle(input, safeLimit);
  }

  if (isLikelyUrl(input)) {
    return discoverWechatHomepage(input, safeLimit);
  }

  return discoverWechatArticlesBySearch(input, safeLimit);
}

function buildResult(
  candidates: DiscoveredArticle[],
  engine: string,
  hint: string | undefined,
  discoveryType: DiscoveryType
): DiscoverWechatArticlesResult {
  return {
    candidates,
    engine,
    ...(hint ? { hint } : {}),
    discoveryType,
    overview: buildTitleOverview(candidates),
  };
}

async function discoverWechatArticlesFromArticle(
  url: string,
  limit: number
): Promise<DiscoverWechatArticlesResult> {
  const articleUrl = normalizeWechatArticleUrl(url);
  if (!articleUrl) {
    return buildResult([], 'wechat-article', '请粘贴 mp.weixin.qq.com 的文章链接。', 'article-url');
  }

  try {
    const source = await parseSource(articleUrl);
    const seedArticle: DiscoveredArticle = {
      title: source.title || articleUrl,
      url: articleUrl,
      snippet: source.digest || source.contentText.slice(0, 160),
      ...(source.sourceName ? { sourceName: source.sourceName } : {}),
    };

    if (!source.sourceName) {
      return buildResult(
        [seedArticle],
        'wechat-article',
        '已解析当前文章，但没有从页面中识别到公众号名称；可继续手动追加文章 URL。',
        'article-url'
      );
    }

    const searchResult = await discoverWechatArticlesBySearch(source.sourceName, Math.max(limit, 1));
    const candidates = dedupeArticles([seedArticle, ...searchResult.candidates]).slice(0, limit);

    return buildResult(
      candidates,
      `wechat-article + ${searchResult.engine}`,
      `已从文章识别公众号「${source.sourceName}」，并用公开搜索补齐候选文章。`,
      'article-url'
    );
  } catch (error) {
    return buildResult(
      [],
      'wechat-article',
      `文章链接解析失败：${error instanceof Error ? error.message : 'Unknown error'}。可改用单链接分析或手动粘贴多篇文章 URL。`,
      'article-url'
    );
  }
}

async function discoverWechatHomepage(url: string, limit: number): Promise<DiscoverWechatArticlesResult> {
  const normalizedUrl = normalizeProfileUrl(url);
  if (!normalizedUrl) {
    return buildResult([], 'wechat-homepage', '请粘贴 mp.weixin.qq.com 的公众号主页链接。', 'homepage-url');
  }

  const response = await fetch(normalizedUrl, {
    headers: browserHeaders(),
  });

  if (!response.ok) {
    return buildResult(
      [],
      'wechat-homepage',
      `公众号主页返回 ${response.status}，可尝试改用公众号名称搜索或手动粘贴文章 URL。`,
      'homepage-url'
    );
  }

  const html = await response.text();
  const candidates = dedupeArticles([
    ...parseWechatMsgList(html),
    ...parseWechatAnchors(html),
  ]).slice(0, limit);

  if (candidates.length === 0) {
    return buildResult(
      [],
      'wechat-homepage',
      '未能从该主页解析到公开文章列表。可能该链接需要登录态，或微信页面结构已变化；可改用公众号名称搜索。',
      'homepage-url'
    );
  }

  return buildResult(candidates, 'wechat-homepage', undefined, 'homepage-url');
}

async function discoverWechatArticlesBySearch(
  accountName: string,
  limit: number
): Promise<DiscoverWechatArticlesResult> {
  const query = `site:mp.weixin.qq.com ${accountName}`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(searchUrl, {
    headers: browserHeaders(),
  });

  if (!response.ok) {
    return buildResult(
      [],
      'duckduckgo',
      `公开搜索返回 ${response.status}，可手动粘贴公众号主页链接或文章 URL。`,
      'account-name'
    );
  }

  const html = await response.text();
  const candidates = parseDuckDuckGoResults(html, limit);

  if (candidates.length === 0) {
    return buildResult(
      [],
      'duckduckgo',
      '公开搜索暂无结果，可粘贴公众号主页链接或手动追加文章 URL 后继续。',
      'account-name'
    );
  }

  return buildResult(candidates, 'duckduckgo', undefined, 'account-name');
}

function parseDuckDuckGoResults(html: string, limit: number): DiscoveredArticle[] {
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html);
  const results: DiscoveredArticle[] = [];

  $('.result').each((_, element) => {
    if (results.length >= limit) return false;

    const $element = $(element);
    const $link = $element.find('a.result__a').first();
    if ($link.length === 0) return;

    const title = cleanText($link.text());
    const rawHref = $link.attr('href') || '';
    const url = extractTargetUrl(rawHref);
    if (!url || !isWechatArticleUrl(url)) return;

    const snippet = cleanText($element.find('.result__snippet').text());
    const sourceName = extractSourceName(snippet);

    results.push({
      title: title || url,
      url,
      snippet,
      ...(sourceName ? { sourceName } : {}),
    });
  });

  return dedupeArticles(results).slice(0, limit);
}

function parseWechatMsgList(html: string): DiscoveredArticle[] {
  const rawMsgList = extractJsonLikeValue(html, 'msgList');
  if (!rawMsgList) return [];

  const parsed = safeJsonParse(rawMsgList);
  const list = Array.isArray(parsed?.list) ? (parsed.list as WechatMsgListItem[]) : [];
  const articles: DiscoveredArticle[] = [];

  for (const item of list) {
    const main = item.app_msg_ext_info;
    if (!main) continue;

    articles.push(...appMsgToArticles(main));
  }

  return articles;
}

function parseWechatAnchors(html: string): DiscoveredArticle[] {
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html);
  const articles: DiscoveredArticle[] = [];

  $('a[href]').each((_, element) => {
    const $link = $(element);
    const url = normalizeWechatArticleUrl($link.attr('href') || '');
    if (!url) return;

    const title = cleanText($link.text()) || cleanText($link.attr('title') || '');
    articles.push({
      title: title || url,
      url,
      snippet: '',
    });
  });

  return articles;
}

function appMsgToArticles(message: WechatAppMsg): DiscoveredArticle[] {
  const articles: DiscoveredArticle[] = [];
  const mainUrl = normalizeWechatArticleUrl(message.content_url || '');

  if (mainUrl) {
    articles.push({
      title: decodeHtmlText(message.title || mainUrl),
      url: mainUrl,
      snippet: decodeHtmlText(message.digest || ''),
    });
  }

  const multi = Array.isArray(message.multi_app_msg_item_list)
    ? message.multi_app_msg_item_list
    : [];
  for (const child of multi) {
    const childUrl = normalizeWechatArticleUrl(child.content_url || '');
    if (!childUrl) continue;
    articles.push({
      title: decodeHtmlText(child.title || childUrl),
      url: childUrl,
      snippet: decodeHtmlText(child.digest || ''),
    });
  }

  return articles;
}

function extractJsonLikeValue(html: string, variableName: string): string {
  const assignment = new RegExp(`(?:var\\s+)?${variableName}\\s*=`, 'g');
  const match = assignment.exec(html);
  if (!match) return '';

  let index = match.index + match[0].length;
  while (/\s/.test(html[index] || '')) index += 1;

  if (html.startsWith('JSON.parse', index)) {
    const parenStart = html.indexOf('(', index);
    const quoteStart = findNextQuote(html, parenStart + 1);
    if (quoteStart === -1) return '';
    const quoted = readQuotedString(html, quoteStart);
    return quoted ? unescapeScriptString(quoted.value) : '';
  }

  if (html[index] === '"' || html[index] === "'") {
    const quoted = readQuotedString(html, index);
    if (!quoted) return '';
    return unescapeScriptString(quoted.value);
  }

  if (html[index] === '{' || html[index] === '[') {
    return readBalancedValue(html, index);
  }

  return '';
}

function readBalancedValue(text: string, start: number): string {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return text.slice(start, i + 1);
  }

  return '';
}

function readQuotedString(text: string, start: number): { value: string; end: number } | null {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return null;

  let escaped = false;
  let value = '';
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return { value, end: i };
    }
    value += char;
  }

  return null;
}

function findNextQuote(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '"' || text[i] === "'") return i;
  }
  return -1;
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(value.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch {
      return null;
    }
  }
}

function normalizeProfileUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(WECHAT_HOST)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeWechatArticleUrl(rawUrl: string): string {
  const decoded = decodeHtmlText(rawUrl).trim();
  if (!decoded) return '';

  let absolute = decoded;
  if (decoded.startsWith('//')) absolute = `https:${decoded}`;
  if (decoded.startsWith('/')) absolute = `https://${WECHAT_HOST}${decoded}`;

  try {
    const parsed = new URL(absolute);
    if (!parsed.hostname.endsWith(WECHAT_HOST)) return '';
    if (!parsed.pathname.startsWith('/s') && !parsed.pathname.startsWith('/mp/appmsg')) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function extractTargetUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const parsed = new URL(href);
      const uddg = parsed.searchParams.get('uddg');
      if (parsed.hostname.includes('duckduckgo.com') && uddg) return decodeURIComponent(uddg);
    } catch {
      return href;
    }
    return href;
  }
  if (href.startsWith('//')) {
    return `https:${href}`;
  }
  try {
    const parsed = new URL(href, 'https://html.duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return parsed.toString();
  } catch {
    return '';
  }
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('//');
}

function isWechatArticleUrl(url: string): boolean {
  return Boolean(normalizeWechatArticleUrl(url));
}

function extractSourceName(snippet: string): string | undefined {
  const match = snippet.match(/公众号[「《“"]([^」》”"]+)[」》”"]/);
  return match ? match[1].trim() : undefined;
}

function dedupeArticles(articles: DiscoveredArticle[]): DiscoveredArticle[] {
  const seen = new Set<string>();
  const result: DiscoveredArticle[] = [];

  for (const article of articles) {
    const normalizedUrl = normalizeWechatArticleUrl(article.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    result.push({
      ...article,
      url: normalizedUrl,
      title: cleanText(decodeHtmlText(article.title || normalizedUrl)),
      snippet: cleanText(decodeHtmlText(article.snippet || '')),
    });
  }

  return result;
}

function buildTitleOverview(articles: DiscoveredArticle[]): DiscoverOverview {
  const sampleTitles = articles.slice(0, 8).map((article) => article.title).filter(Boolean);
  const keywords = extractKeywords(articles);

  if (articles.length === 0) {
    return {
      articleCount: 0,
      titleDirection: '暂无可用于判断方向的文章标题。',
      keywords: [],
      sampleTitles: [],
    };
  }

  const keywordText = keywords.length > 0 ? keywords.slice(0, 6).join('、') : '这些标题中的高频主题';
  return {
    articleCount: articles.length,
    titleDirection: `基于已发现的 ${articles.length} 篇公开文章标题与摘要，这个账号近期内容大致围绕 ${keywordText} 展开。建议先勾选标题最相关的文章，再进入批量解析获取正文级总结。`,
    keywords,
    sampleTitles,
  };
}

function extractKeywords(articles: DiscoveredArticle[]): string[] {
  const text = articles.map((article) => `${article.title} ${article.snippet}`).join(' ');
  const dictionary = [
    'AI',
    'AIGC',
    '大模型',
    '人工智能',
    '微信',
    '小程序',
    '私域',
    '增长',
    '运营',
    '商业',
    '创业',
    '投资',
    '产品',
    '技术',
    '开源',
    '数据',
    '教育',
    '职场',
    '消费',
    '品牌',
    '营销',
    '内容',
    '案例',
    '趋势',
    '行业',
    '政策',
  ];
  const scores = new Map<string, number>();

  for (const keyword of dictionary) {
    const pattern = new RegExp(escapeRegExp(keyword), 'gi');
    const matches = text.match(pattern);
    if (matches?.length) scores.set(keyword, matches.length);
  }

  const alnumTerms = text.match(/[a-zA-Z][a-zA-Z0-9+#.-]{1,24}/g) || [];
  for (const term of alnumTerms) {
    if (term.length < 2) continue;
    scores.set(term, (scores.get(term) || 0) + 1);
  }

  return Array.from(scores.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([keyword]) => keyword)
    .slice(0, 10);
}

function browserHeaders(): HeadersInit {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function unescapeScriptString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
