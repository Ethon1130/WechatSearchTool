import { parseSource } from './parser';
import type { BatchParseResult, ExtractedSource } from './types';

const DEFAULT_CONCURRENCY = 3;

export async function parseBatch(
  urls: string[],
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<BatchParseResult> {
  const unique = dedupeUrls(urls);
  const sources: ExtractedSource[] = [];
  const errors: BatchParseResult['errors'] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < unique.length) {
      const index = cursor;
      cursor += 1;
      const url = unique[index];
      try {
        const source = await parseSource(url);
        sources.push(source);
      } catch (err) {
        errors.push({
          url,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  });

  await Promise.all(workers);

  sources.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  return { sources, errors };
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}
