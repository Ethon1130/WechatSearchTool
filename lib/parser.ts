import type { ExtractedSource, SourceType } from './types';

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
