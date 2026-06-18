import type { ExtractedSource, SourceType, WechatAccountProfile } from './types';

export async function parseSource(url: string): Promise<ExtractedSource> {
  const parsedUrl = normalizeUrl(url);
  const sourceType: SourceType = parsedUrl.hostname.includes('mp.weixin.qq.com')
    ? 'wechat'
    : 'webpage';

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status}`);
  }

  const html = await response.text();

  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const title = cleanText(
    sourceType === 'wechat'
      ? $('#activity-name').text()
      : $('meta[property="og:title"]').attr('content') ||
          $('meta[name="twitter:title"]').attr('content') ||
          $('h1').first().text() ||
          $('title').text()
  );

  const sourceName = cleanText(
    sourceType === 'wechat'
      ? $('#js_name').text()
      : $('meta[property="og:site_name"]').attr('content') ||
          $('meta[name="application-name"]').attr('content') ||
          parsedUrl.hostname.replace(/^www\./, '')
  );

  const author = cleanText(
    sourceType === 'wechat'
      ? $('#js_author_name').text()
      : $('meta[name="author"]').attr('content') ||
          $('[rel="author"]').first().text() ||
          $('[class*="author"]').first().text()
  );

  const publishTime = cleanText(
    sourceType === 'wechat'
      ? $('#publish_time').text()
      : $('meta[property="article:published_time"]').attr('content') ||
          $('meta[name="pubdate"]').attr('content') ||
          $('time').first().attr('datetime') ||
          $('time').first().text()
  );

  const digest =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    '';

  const cover =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    '';

  const contentRoot =
    sourceType === 'wechat'
      ? $('#js_content')
      : $('article').first().length
        ? $('article').first()
        : $('main').first().length
          ? $('main').first()
          : $('body');

  contentRoot.find('script, style, noscript, iframe, svg').remove();

  const contentHtml = contentRoot.html() || '';
  const contentText = cleanMultilineText(contentRoot.text());
  const images = collectImages($, contentRoot, parsedUrl.origin);
  const links = collectLinks($, contentRoot, parsedUrl.origin);
  const accountProfile =
    sourceType === 'wechat'
      ? extractWechatAccountProfile($, html, parsedUrl.toString(), sourceName)
      : undefined;

  return {
    title,
    sourceName,
    sourceType,
    author,
    publishTime,
    digest: cleanText(digest),
    cover: resolveUrl(cover, parsedUrl.origin),
    contentText,
    contentHtml,
    sourceUrl: parsedUrl.toString(),
    images,
    links,
    extractedAt: new Date().toISOString(),
    ...(accountProfile ? { accountProfile } : {}),
  };
}

export const parseWeChatArticle = parseSource;

function normalizeUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    return new URL(`https://${url}`);
  }
}

function cleanText(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value: string): string {
  return value
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join('\n');
}

function resolveUrl(value: string | undefined, baseUrl: string): string {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function collectImages($: any, root: any, baseUrl: string): string[] {
  const urls = new Set<string>();

  root.find('img').each((_: number, image: unknown) => {
    const src =
      $(image).attr('data-src') ||
      $(image).attr('data-original') ||
      $(image).attr('src');

    const resolved = resolveUrl(src, baseUrl);
    if (resolved) urls.add(resolved);
  });

  return Array.from(urls).slice(0, 40);
}

function collectLinks($: any, root: any, baseUrl: string): ExtractedSource['links'] {
  const links: ExtractedSource['links'] = [];
  const seen = new Set<string>();

  root.find('a[href]').each((_: number, link: unknown) => {
    const href = resolveUrl($(link).attr('href'), baseUrl);
    const text = cleanText($(link).text());
    const key = `${text}|${href}`;

    if (!href || seen.has(key)) return;
    seen.add(key);
    links.push({ text: text || href, href });
  });

  return links.slice(0, 80);
}

function extractWechatAccountProfile(
  $: any,
  html: string,
  sourceArticleUrl: string,
  fallbackName: string
): WechatAccountProfile | undefined {
  const name = cleanText(
    $('#js_name').text() ||
      extractScriptString(html, 'nickname') ||
      extractScriptString(html, 'nick_name') ||
      fallbackName
  );
  const profileHref =
    $('#js_name').attr('href') ||
    $('a[href*="profile_ext"]').first().attr('href') ||
    extractScriptString(html, 'profile_url');
  const biz =
    extractBizFromUrl(sourceArticleUrl) ||
    extractBizFromUrl(profileHref || '') ||
    extractScriptString(html, 'biz') ||
    extractScriptString(html, '__biz');
  const homepageUrl = normalizeWechatProfileUrl(profileHref, biz);

  if (!name && !homepageUrl) return undefined;

  return {
    name: name || '未知公众号',
    ...(homepageUrl ? { homepageUrl } : {}),
    sourceArticleUrl,
  };
}

function normalizeWechatProfileUrl(rawUrl: string | undefined, biz: string): string {
  if (rawUrl) {
    const decoded = decodeHtmlText(rawUrl).trim();
    let absolute = decoded;
    if (decoded.startsWith('//')) absolute = `https:${decoded}`;
    if (decoded.startsWith('/')) absolute = `https://mp.weixin.qq.com${decoded}`;

    try {
      const parsed = new URL(absolute);
      if (parsed.hostname.endsWith('mp.weixin.qq.com') && parsed.pathname.includes('profile_ext')) {
        parsed.hash = '#wechat_redirect';
        return parsed.toString();
      }
    } catch {
      // Fall through to the __biz constructor below.
    }
  }

  return biz
    ? `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${encodeURIComponent(biz)}&scene=124#wechat_redirect`
    : '';
}

function extractBizFromUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const decoded = decodeHtmlText(rawUrl).trim();
  let absolute = decoded;
  if (decoded.startsWith('//')) absolute = `https:${decoded}`;
  if (decoded.startsWith('/')) absolute = `https://mp.weixin.qq.com${decoded}`;

  try {
    const parsed = new URL(absolute);
    return parsed.searchParams.get('__biz') || '';
  } catch {
    const match = decoded.match(/[?&]__biz=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
}

function extractScriptString(html: string, variableName: string): string {
  const pattern = new RegExp(`(?:var\\s+)?${escapeRegExp(variableName)}\\s*=\\s*(['"])(.*?)\\1`);
  const match = html.match(pattern);
  return match ? cleanText(decodeHtmlText(match[2])) : '';
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
