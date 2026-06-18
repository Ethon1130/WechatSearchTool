import type { DiscoveredArticle, DiscoverOverview, WechatAccountProfile } from './types';
import { parseSource } from './parser';

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const WECHAT_HOST = 'mp.weixin.qq.com';

type DiscoveryType = 'account-name' | 'homepage-url' | 'article-url';

export type EngineName = 'duckduckgo' | 'bing' | 'sogou';

export interface SearchEngine {
  name: EngineName;
  search(query: string, limit: number): Promise<{ candidates: DiscoveredArticle[]; error?: string }>;
}

export interface EngineSelection {
  requested: EngineName[];
  used: EngineName[];
  noResults?: EngineName[];
  errors: Partial<Record<EngineName, string>>;
}

export interface DiscoverWechatArticlesResult {
  candidates: DiscoveredArticle[];
  engine: string;
  hint?: string;
  discoveryType: DiscoveryType;
  overview: DiscoverOverview;
  accountProfile?: WechatAccountProfile;
  engineSelection?: EngineSelection;
}

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
  app_msg_info?: WechatAppMsg;
}

interface WechatHistoryApiResponse {
  general_msg_list?: string;
  errmsg?: string;
  ret?: number;
}

export interface DiscoverOptions {
  engines?: EngineName[];
  biz?: string;
}

export async function discoverWechatArticles(
  accountNameOrUrl: string,
  limit: number = DEFAULT_LIMIT,
  options: DiscoverOptions = {}
): Promise<DiscoverWechatArticlesResult> {
  const input = accountNameOrUrl.trim();
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const engines = resolveEngines(options.engines);

  if (!input) {
    return buildResult([], 'input', '请输入公众号名称或公众号主页链接。', 'account-name');
  }

  if (isLikelyUrl(input) && normalizeWechatArticleUrl(input)) {
    return discoverWechatArticlesFromArticle(input, safeLimit, engines, options.biz);
  }

  if (isLikelyUrl(input)) {
    return discoverWechatHomepage(input, safeLimit, engines, options.biz);
  }

  return discoverWechatArticlesBySearch(input, safeLimit, engines, options.biz);
}

function resolveEngines(requested: EngineName[] | undefined): EngineName[] {
  const whitelist: EngineName[] = ['duckduckgo', 'bing', 'sogou'];
  if (!Array.isArray(requested) || requested.length === 0) {
    return ['duckduckgo', 'bing'];
  }
  const filtered = requested.filter((engine): engine is EngineName =>
    typeof engine === 'string' && whitelist.includes(engine as EngineName)
  );
  return filtered.length > 0 ? filtered : ['duckduckgo', 'bing'];
}

function buildResult(
  candidates: DiscoveredArticle[],
  engine: string,
  hint: string | undefined,
  discoveryType: DiscoveryType,
  accountProfile?: WechatAccountProfile,
  engineSelection?: EngineSelection
): DiscoverWechatArticlesResult {
  return {
    candidates,
    engine,
    ...(hint ? { hint } : {}),
    discoveryType,
    overview: buildTitleOverview(candidates),
    ...(accountProfile ? { accountProfile } : {}),
    ...(engineSelection ? { engineSelection } : {}),
  };
}

async function discoverWechatArticlesFromArticle(
  url: string,
  limit: number,
  engines: EngineName[],
  bizHint?: string
): Promise<DiscoverWechatArticlesResult> {
  const articleUrl = normalizeWechatArticleUrl(url);
  if (!articleUrl) {
    return buildResult([], 'wechat-article', '请粘贴 mp.weixin.qq.com 的文章链接。', 'article-url');
  }

  try {
    const source = await parseSource(articleUrl);
    const accountName = source.accountProfile?.name || source.sourceName;
    const detectedBiz = bizHint || extractBizFromUrl(articleUrl);
    const accountProfile = buildAccountProfile(
      accountName,
      source.accountProfile?.homepageUrl,
      articleUrl
    );
    const seedArticle: DiscoveredArticle = {
      title: source.title || articleUrl,
      url: articleUrl,
      snippet: source.digest || source.contentText.slice(0, 160),
      discoverySource: 'seed-article',
      ...(accountName ? { sourceName: accountName } : {}),
    };

    if (!accountName) {
      return buildResult(
        [seedArticle],
        'wechat-article',
        '已解析当前文章，但没有从页面中识别到公众号名称；可继续手动追加文章 URL。',
        'article-url',
        accountProfile
      );
    }

    const hints: string[] = [`已从文章识别公众号「${accountName}」。`];
    let homepageCandidates: DiscoveredArticle[] = [];
    let engineSelection: EngineSelection | undefined;

    if (accountProfile?.homepageUrl) {
      const homepageResult = await discoverWechatHomepage(
        accountProfile.homepageUrl,
        limit,
        engines,
        detectedBiz,
        accountProfile
      );
      homepageCandidates = homepageResult.candidates;
      engineSelection = homepageResult.engineSelection;
      if (homepageResult.hint) hints.push(homepageResult.hint);
    } else {
      hints.push('没有从文章中提取到公众号主页链接。');
    }

    const searchResult = await discoverWechatArticlesBySearch(
      accountName,
      Math.max(limit, 1),
      engines,
      detectedBiz
    );
    const mergedSelection = mergeEngineSelection(engineSelection, searchResult.engineSelection);
    if (searchResult.hint) hints.push(searchResult.hint);

    const candidates = dedupeArticles([
      seedArticle,
      ...homepageCandidates,
      ...searchResult.candidates,
    ]).slice(0, limit);

    if (homepageCandidates.length > 0) {
      hints.push('已优先从公众号主页解析候选文章，并用公开搜索补齐。');
    } else {
      hints.push('主页文章列表不可公开访问或未解析到候选，已使用公开搜索兜底。');
    }

    const combinedEngine = Array.from(
      new Set(['wechat-article', ...(mergedSelection?.used ?? []), searchResult.engine])
    ).join(' + ');

    return buildResult(
      candidates,
      combinedEngine,
      hints.join(' '),
      'article-url',
      accountProfile,
      mergedSelection
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

async function discoverWechatHomepage(
  url: string,
  limit: number,
  engines: EngineName[],
  bizHint?: string,
  accountProfile?: WechatAccountProfile
): Promise<DiscoverWechatArticlesResult> {
  const normalizedUrl = normalizeProfileUrl(url);
  const detectedBiz = bizHint || extractBizFromUrl(url);

  if (!normalizedUrl) {
    const selection = emptyEngineSelection(engines);
    return buildResult(
      [],
      'wechat-homepage',
      '请粘贴 mp.weixin.qq.com 的公众号主页链接。',
      'homepage-url',
      accountProfile,
      selection
    );
  }

  let response: Response;
  try {
    response = await fetch(normalizedUrl, {
      headers: browserHeaders({ wechat: true }),
    });
  } catch (error) {
    const selection = emptyEngineSelection(engines, {
      message: `公众号主页请求失败：${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return buildResult(
      [],
      'wechat-homepage',
      `公众号主页请求失败：${error instanceof Error ? error.message : 'Unknown error'}。`,
      'homepage-url',
      accountProfile,
      selection
    );
  }

  if (!response.ok) {
    const selection = emptyEngineSelection(engines, {
      message: `公众号主页返回 ${response.status}`,
    });
    return buildResult(
      [],
      'wechat-homepage',
      `公众号主页返回 ${response.status}，可尝试改用公众号名称搜索或手动粘贴文章 URL。`,
      'homepage-url',
      accountProfile,
      selection
    );
  }

  const html = await response.text();
  const homepageBiz = detectedBiz || extractBizFromHtml(html);
  const homepageCandidates = dedupeArticles([
    ...parseWechatMsgList(html, 'homepage'),
    ...parseWechatAnchors(html, 'homepage'),
  ]).slice(0, limit);

  if (homepageCandidates.length === 0) {
    const historyCandidates = await fetchWechatHistoryApi(
      normalizedUrl,
      html,
      homepageBiz,
      limit
    );
    if (historyCandidates.length > 0) {
      return buildResult(
        historyCandidates,
        'wechat-homepage-cookie',
        '已使用本机配置的 WECHAT_COOKIE 从公众号主页历史消息接口读取候选文章。请只用于你有权访问的内容，并控制频率。',
        'homepage-url',
        accountProfile,
        emptyEngineSelection(engines)
      );
    }

    const fallback = await discoverWechatArticlesBySearch(
      accountProfile?.name || normalizedUrl,
      limit,
      engines,
      homepageBiz
    );
    const hintParts = [
      hasWechatCookie()
        ? '未能从该主页解析到文章列表。已检测到 WECHAT_COOKIE，但主页没有返回可用历史消息或 token；已自动切换为公开搜索兜底。'
        : '未能从该主页解析到公开文章列表。可能该链接需要登录态，或微信页面结构已变化；已自动切换为公开搜索兜底。如需增强主页读取，可在 .env.local 配置你自己的 WECHAT_COOKIE 后重启服务。',
    ];
    if (fallback.hint) hintParts.push(fallback.hint);

    if (fallback.candidates.length === 0) {
      return buildResult(
        [],
        ['wechat-homepage', ...(fallback.engineSelection?.used ?? [])].join(' + '),
        hintParts.join(' '),
        'homepage-url',
        accountProfile,
        fallback.engineSelection
      );
    }

    return buildResult(
      fallback.candidates,
      ['wechat-homepage', ...(fallback.engineSelection?.used ?? [])].join(' + '),
      hintParts.join(' '),
      'homepage-url',
      accountProfile,
      fallback.engineSelection
    );
  }

  return buildResult(
    homepageCandidates,
    'wechat-homepage',
    undefined,
    'homepage-url',
    accountProfile,
    emptyEngineSelection(engines)
  );
}

async function discoverWechatArticlesBySearch(
  accountName: string,
  limit: number,
  engines: EngineName[],
  bizHint?: string
): Promise<DiscoverWechatArticlesResult & { engineSelection: EngineSelection }> {
  const queries = buildSearchQueries(accountName, bizHint);
  const candidates: DiscoveredArticle[] = [];
  const engineErrors: Partial<Record<EngineName, string>> = {};
  const used: EngineName[] = [];
  const noResults: EngineName[] = [];

  const activeEngines = engines
    .map((name) => getEngine(name))
    .filter((engine): engine is SearchEngine => Boolean(engine));

  for (const engine of activeEngines) {
    if (dedupeArticles(candidates).length >= limit) break;

    let engineFilled = false;
    let engineSucceeded = false;
    for (const query of queries) {
      if (dedupeArticles(candidates).length >= limit) break;

      try {
        const { candidates: found, error } = await engine.search(query, limit);
        if (!error) engineSucceeded = true;
        if (found.length > 0) {
          candidates.push(...found);
          engineFilled = true;
        }
        if (error) engineErrors[engine.name] = error;
      } catch (error) {
        engineErrors[engine.name] = `搜索失败：${formatFetchError(error)}`;
      }
    }
    if (engineSucceeded || engineFilled) used.push(engine.name);
    if (engineSucceeded && !engineFilled) noResults.push(engine.name);
  }

  const deduped = dedupeArticles(
    candidates.map((candidate) => ({
      ...candidate,
      sourceName: candidate.sourceName || accountName,
    }))
  ).slice(0, limit);

  const engineSelection: EngineSelection = {
    requested: engines,
    used,
    ...(noResults.length > 0 ? { noResults } : {}),
    errors: engineErrors,
  };

  if (deduped.length === 0) {
    const successfulWithoutResults = noResults.length > 0;
    const failedEngines = Object.keys(engineErrors).length > 0;
    const hint = successfulWithoutResults
      ? `已完成搜索，但 ${noResults.join('、')} 没有找到匹配文章。${
          failedEngines ? '另有部分搜索引擎请求失败，详见下方错误区。' : ''
        }可粘贴任意一篇文章链接或手动追加文章 URL 后继续。`
      : failedEngines
        ? '公开搜索请求失败，未能判断是否有匹配文章；请稍后重试、切换搜索源，或粘贴任意一篇文章链接/手动追加文章 URL 后继续。'
        : '公开搜索暂无结果，可粘贴任意一篇文章链接或手动追加文章 URL 后继续。';
    return buildResult(
      [],
      used.length > 0 ? used.join(' + ') : 'public-search',
      hint,
      'account-name',
      undefined,
      engineSelection
    ) as DiscoverWechatArticlesResult & { engineSelection: EngineSelection };
  }

  return buildResult(
    deduped,
    used.length > 0 ? used.join(' + ') : 'public-search',
    undefined,
    'account-name',
    undefined,
    engineSelection
  ) as DiscoverWechatArticlesResult & { engineSelection: EngineSelection };
}

function getEngine(name: EngineName): SearchEngine | undefined {
  switch (name) {
    case 'duckduckgo':
      return duckDuckGoEngine;
    case 'bing':
      return bingEngine;
    case 'sogou':
      return sogouEngine;
    default:
      return undefined;
  }
}

function emptyEngineSelection(
  engines: EngineName[],
  error?: { message: string }
): EngineSelection {
  const errors: Partial<Record<EngineName, string>> = {};
  if (error) {
    engines.forEach((name) => {
      errors[name] = error.message;
    });
  }
  return { requested: engines, used: [], errors };
}

function mergeEngineSelection(
  a: EngineSelection | undefined,
  b: EngineSelection | undefined
): EngineSelection | undefined {
  if (!a && !b) return undefined;
  const requested = Array.from(new Set([...(a?.requested ?? []), ...(b?.requested ?? [])])) as EngineName[];
  const used = Array.from(new Set([...(a?.used ?? []), ...(b?.used ?? [])])) as EngineName[];
  const noResults = Array.from(new Set([...(a?.noResults ?? []), ...(b?.noResults ?? [])])) as EngineName[];
  const errors: Partial<Record<EngineName, string>> = {
    ...(a?.errors ?? {}),
    ...(b?.errors ?? {}),
  };
  return { requested, used, ...(noResults.length > 0 ? { noResults } : {}), errors };
}

function buildSearchQueries(accountName: string, bizHint?: string): string[] {
  const cleanName = accountName.trim();
  const quoted = `"${cleanName}"`;
  const queries = new Set<string>();

  if (bizHint) {
    queries.add(`site:mp.weixin.qq.com/s "${bizHint}"`);
    queries.add(`site:mp.weixin.qq.com "${bizHint}" ${cleanName}`);
    queries.add(`${quoted} ${bizHint}`);
  }

  queries.add(`site:mp.weixin.qq.com/s ${cleanName}`);
  queries.add(`site:mp.weixin.qq.com ${cleanName}`);
  queries.add(`${quoted} site:mp.weixin.qq.com/s`);
  queries.add(`${quoted} "mp.weixin.qq.com/s"`);
  queries.add(`${quoted} 公众号 文章`);

  return Array.from(queries);
}

const duckDuckGoEngine: SearchEngine = {
  name: 'duckduckgo',
  async search(query, limit) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, { headers: browserHeaders() });
    if (!response.ok) {
      return { candidates: [], error: `DuckDuckGo 返回 ${response.status}` };
    }
    const html = await response.text();
    return { candidates: parseDuckDuckGoResults(html, limit) };
  },
};

const bingEngine: SearchEngine = {
  name: 'bing',
  async search(query, limit) {
    const searchUrl = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN`;
    const response = await fetch(searchUrl, { headers: browserHeaders() });
    if (!response.ok) {
      return { candidates: [], error: `Bing 返回 ${response.status}` };
    }
    const html = await response.text();
    return { candidates: parseBingResults(html, limit) };
  },
};

const sogouEngine: SearchEngine = {
  name: 'sogou',
  async search(query, limit) {
    const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}&ie=utf8`;
    const response = await fetch(searchUrl, { headers: browserHeaders() });
    if (!response.ok) {
      return { candidates: [], error: `搜狗微信搜索返回 ${response.status}` };
    }
    const html = await response.text();
    if (detectSogouCaptcha(html)) {
      return { candidates: [], error: '搜狗触发反爬验证码，已自动跳过' };
    }
    return { candidates: parseSogouResults(html, limit) };
  },
};

function detectSogouCaptcha(html: string): boolean {
  return /验证码|verifycode|antispider|请输入验证码/i.test(html);
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
      discoverySource: 'search',
      ...(sourceName ? { sourceName } : {}),
    });
  });

  return dedupeArticles(results).slice(0, limit);
}

function parseBingResults(html: string, limit: number): DiscoveredArticle[] {
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html);
  const results: DiscoveredArticle[] = [];

  $('li.b_algo').each((_, element) => {
    if (results.length >= limit) return false;

    const $element = $(element);
    const $link = $element.find('h2 a[href]').first();
    if ($link.length === 0) return;

    const title = cleanText($link.text());
    const url = extractTargetUrl($link.attr('href') || '');
    if (!url || !isWechatArticleUrl(url)) return;

    const snippet = cleanText($element.find('.b_caption p').first().text() || $element.find('p').first().text());
    const sourceName = extractSourceName(snippet);

    results.push({
      title: title || url,
      url,
      snippet,
      discoverySource: 'search',
      ...(sourceName ? { sourceName } : {}),
    });
  });

  return dedupeArticles(results).slice(0, limit);
}

function parseSogouResults(html: string, limit: number): DiscoveredArticle[] {
  const cheerio = require('cheerio') as typeof import('cheerio');
  const $ = cheerio.load(html);
  const results: DiscoveredArticle[] = [];

  $('.news-list li, .news-list2 li').each((_, element) => {
    if (results.length >= limit) return false;

    const $element = $(element);
    const $link = $element.find('a[href*="mp.weixin.qq.com"]').first();
    if ($link.length === 0) return;

    const url = extractTargetUrl($link.attr('href') || '');
    if (!url || !isWechatArticleUrl(url)) return;

    const title = cleanText($element.find('.tit').first().text()) || cleanText($link.text());
    const snippet = cleanText(
      $element.find('.txt-info, .txt, .des, p').first().text()
    );

    results.push({
      title: title || url,
      url,
      snippet,
      discoverySource: 'search',
    });
  });

  if (results.length === 0) {
    $('a[href*="mp.weixin.qq.com/s"]').each((_, element) => {
      if (results.length >= limit) return false;
      const $link = $(element);
      const url = extractTargetUrl($link.attr('href') || '');
      if (!url || !isWechatArticleUrl(url)) return;

      const title = cleanText($link.text()) || cleanText($link.attr('title') || '');
      results.push({
        title: title || url,
        url,
        snippet: '',
        discoverySource: 'search',
      });
    });
  }

  return dedupeArticles(results).slice(0, limit);
}

function parseWechatMsgList(
  html: string,
  discoverySource: DiscoveredArticle['discoverySource'] = 'homepage'
): DiscoveredArticle[] {
  const rawMsgList = extractFirstJsonLikeValue(html, [
    'msgList',
    'msg_list',
    'appmsgList',
    'appmsg_list',
  ]);
  if (!rawMsgList) return [];

  const parsed = safeJsonParse(rawMsgList);
  const list = normalizeWechatMsgItems(parsed);
  const articles: DiscoveredArticle[] = [];

  for (const item of list) {
    const main = item.app_msg_ext_info || item.app_msg_info;
    if (!main) continue;

    articles.push(...appMsgToArticles(main, discoverySource));
  }

  return articles;
}

async function fetchWechatHistoryApi(
  homepageUrl: string,
  homepageHtml: string,
  biz: string,
  limit: number
): Promise<DiscoveredArticle[]> {
  if (!hasWechatCookie() || !biz) return [];

  const appmsgToken = extractScriptString(homepageHtml, 'appmsg_token');
  if (!appmsgToken) return [];

  try {
    const apiUrl = new URL('https://mp.weixin.qq.com/mp/profile_ext');
    apiUrl.searchParams.set('action', 'getmsg');
    apiUrl.searchParams.set('__biz', biz);
    apiUrl.searchParams.set('f', 'json');
    apiUrl.searchParams.set('offset', '0');
    apiUrl.searchParams.set('count', String(Math.min(Math.max(limit, 1), 20)));
    apiUrl.searchParams.set('is_ok', '1');
    apiUrl.searchParams.set('scene', '124');
    apiUrl.searchParams.set('uin', '');
    apiUrl.searchParams.set('key', '');
    apiUrl.searchParams.set('pass_ticket', '');
    apiUrl.searchParams.set('wxtoken', '');
    apiUrl.searchParams.set('appmsg_token', appmsgToken);
    apiUrl.searchParams.set('x5', '0');

    const response = await fetch(apiUrl.toString(), {
      headers: {
        ...browserHeaders({ wechat: true }),
        Referer: homepageUrl,
      },
    });
    if (!response.ok) return [];

    const payload = (await response.json().catch(() => null)) as WechatHistoryApiResponse | null;
    if (!payload?.general_msg_list) return [];

    const parsed = safeJsonParse(payload.general_msg_list);
    return dedupeArticles(
      normalizeWechatMsgItems(parsed).flatMap((item) => {
        const main = item.app_msg_ext_info || item.app_msg_info;
        return main ? appMsgToArticles(main, 'homepage') : [];
      })
    ).slice(0, limit);
  } catch {
    return [];
  }
}

function normalizeWechatMsgItems(value: any): WechatMsgListItem[] {
  if (Array.isArray(value)) return value as WechatMsgListItem[];
  if (Array.isArray(value?.list)) return value.list as WechatMsgListItem[];
  if (Array.isArray(value?.app_msg_list)) return value.app_msg_list as WechatMsgListItem[];
  if (Array.isArray(value?.msg_list)) return value.msg_list as WechatMsgListItem[];
  return [];
}

function extractFirstJsonLikeValue(html: string, variableNames: string[]): string {
  for (const variableName of variableNames) {
    const raw = extractJsonLikeValue(html, variableName);
    if (raw) return raw;
  }
  return '';
}

function parseWechatAnchors(
  html: string,
  discoverySource: DiscoveredArticle['discoverySource'] = 'homepage'
): DiscoveredArticle[] {
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
      discoverySource,
    });
  });

  return articles;
}

function appMsgToArticles(
  message: WechatAppMsg,
  discoverySource: DiscoveredArticle['discoverySource'] = 'homepage'
): DiscoveredArticle[] {
  const articles: DiscoveredArticle[] = [];
  const mainUrl = normalizeWechatArticleUrl(message.content_url || '');

  if (mainUrl) {
    articles.push({
      title: decodeHtmlText(message.title || mainUrl),
      url: mainUrl,
      snippet: decodeHtmlText(message.digest || ''),
      discoverySource,
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
      discoverySource,
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

function buildAccountProfile(
  name: string,
  homepageUrl: string | undefined,
  sourceArticleUrl: string
): WechatAccountProfile | undefined {
  if (!name && !homepageUrl) return undefined;
  return {
    name: name || '未知公众号',
    ...(homepageUrl ? { homepageUrl } : {}),
    sourceArticleUrl,
  };
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

function extractBizFromUrl(rawUrl: string): string {
  const decoded = decodeHtmlText(rawUrl || '').trim();
  if (!decoded) return '';

  let absolute = decoded;
  if (decoded.startsWith('//')) absolute = `https:${decoded}`;
  if (decoded.startsWith('/')) absolute = `https://${WECHAT_HOST}${decoded}`;

  try {
    const parsed = new URL(absolute);
    const biz = parsed.searchParams.get('__biz');
    if (biz) return biz;
  } catch {
    const match = decoded.match(/[?&]__biz=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

function extractBizFromHtml(html: string): string {
  const match = html.match(/__biz\s*=\s*['"]([^'"]+)['"]/);
  if (match) return match[1];
  const mpMatch = html.match(/["']([A-Za-z0-9+/=]{16,})["']/);
  return mpMatch ? mpMatch[1] : '';
}

function extractScriptString(html: string, variableName: string): string {
  const pattern = new RegExp(`(?:var\\s+)?${escapeRegExp(variableName)}\\s*=\\s*(['"])(.*?)\\1`);
  const match = html.match(pattern);
  return match ? cleanText(decodeHtmlText(match[2])) : '';
}

function extractTargetUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const parsed = new URL(href);
      const uddg = parsed.searchParams.get('uddg');
      if (parsed.hostname.includes('duckduckgo.com') && uddg) return decodeURIComponent(uddg);
      if (parsed.hostname.includes('sogou.com') || parsed.hostname.includes('so.com')) {
        const urlParam = parsed.searchParams.get('url');
        if (urlParam) return decodeURIComponent(urlParam);
      }
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

function articleFingerprint(url: string): string {
  const biz = extractBizFromUrl(url);
  let mid = '';
  let idx = '';
  try {
    const parsed = new URL(url);
    mid = parsed.searchParams.get('mid') || '';
    idx = parsed.searchParams.get('idx') || '';
  } catch {
    const midMatch = url.match(/[?&]mid=([^&#]+)/);
    const idxMatch = url.match(/[?&]idx=([^&#]+)/);
    if (midMatch) mid = decodeURIComponent(midMatch[1]);
    if (idxMatch) idx = decodeURIComponent(idxMatch[1]);
  }
  if (biz && mid) return `${biz}|${mid}|${idx}`;
  return normalizeWechatArticleUrl(url);
}

function dedupeArticles(articles: DiscoveredArticle[]): DiscoveredArticle[] {
  const seen = new Set<string>();
  const result: DiscoveredArticle[] = [];

  for (const article of articles) {
    const normalizedUrl = normalizeWechatArticleUrl(article.url);
    if (!normalizedUrl) continue;
    const fingerprint = articleFingerprint(normalizedUrl);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
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

function browserHeaders(options: { wechat?: boolean } = {}): HeadersInit {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  const cookie = process.env.WECHAT_COOKIE?.trim();
  if (options.wechat && cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

function hasWechatCookie(): boolean {
  return Boolean(process.env.WECHAT_COOKIE?.trim());
}

function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = 'code' in cause ? String((cause as { code?: unknown }).code || '') : '';
    const reason = 'message' in cause ? String((cause as { message?: unknown }).message || '') : '';
    const detail = [code, reason].filter(Boolean).join(' ');
    if (detail) return `${error.message} (${detail})`;
  }
  return error.message;
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
