import type { WeChatArticle } from './types';

export async function parseWeChatArticle(url: string): Promise<WeChatArticle> {
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

  // Dynamic import cheerio on server side
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const title =
    $('#activity-name').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim();

  const accountName = $('#js_name').text().trim();

  const author = $('#js_author_name').text().trim();

  const digest =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  const cover =
    $('meta[property="og:image"]').attr('content') ||
    '';

  const contentHtml = $('#js_content').html() || '';
  const contentText = $('#js_content')
    .text()
    .replace(/\s+/g, '\n')
    .trim();

  return {
    title,
    accountName,
    author,
    digest,
    cover,
    contentText,
    contentHtml,
    sourceUrl: url,
  };
}
