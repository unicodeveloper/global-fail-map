import { z } from 'zod';

const publicSubject = z
  .string()
  .trim()
  .min(2)
  .max(180)
  .refine((value) => !/[\u0000-\u001f\u007f]|https?:\/\//i.test(value));

export const projectImageInputSchema = z
  .object({
    projectName: publicSubject,
    locationName: publicSubject.max(100).optional(),
    subjects: z.array(publicSubject).max(3).optional(),
  })
  .strict();

export interface ProjectImage {
  url: string;
  sourceUrl: string;
  title: string;
}

export function projectPhotoSubjects(
  report: string,
  fallback: string,
): string[] {
  const headings = [...report.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    match[1].replace(/\*|`/g, '').trim(),
  );
  const cases = headings.filter((heading) =>
    /^(?:case\s*)?\d+[.:)\s-]/i.test(heading),
  );
  return (cases.length ? cases : [fallback]).slice(0, 3).map((heading) =>
    heading
      .replace(/^(?:case\s*)?\d+[.:)\s-]+/i, '')
      .split(/:\s/)[0]
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
      .slice(0, 180),
  );
}

export function publicImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(
        host,
      ) ||
      host === 'metadata.google.internal' ||
      [...url.searchParams.keys()].some((key) =>
        /token|secret|password|credential|signature|api.?key|authorization|jwt|^(?:auth|key|sig)$/i.test(
          key,
        ),
      )
    )
      return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function plainTitle(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
    : '';
}

export function selectProjectImages(
  response: unknown,
  projectName: string,
): ProjectImage[] {
  if (
    !response ||
    typeof response !== 'object' ||
    !('results' in response) ||
    !Array.isArray(response.results)
  )
    return [];
  const terms = projectName.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const candidates: (ProjectImage & { score: number })[] = [];
  const seen = new Set<string>();
  for (const value of response.results.slice(0, 10)) {
    if (!value || typeof value !== 'object') continue;
    const result = value as Record<string, unknown>;
    const sourceUrl = publicImageUrl(result.url);
    const title = plainTitle(result.title);
    if (!sourceUrl || !title) continue;
    const score = terms.filter((term) =>
      title.toLowerCase().includes(term),
    ).length;
    if (terms.length && score === 0) continue;
    const imageValues =
      typeof result.image_url === 'string'
        ? [result.image_url]
        : result.image_url && typeof result.image_url === 'object'
          ? Object.values(result.image_url).slice(0, 12)
          : [];
    for (const image of imageValues) {
      const url = publicImageUrl(image);
      if (
        !url ||
        seen.has(url) ||
        /(?:favicon|sprite|placeholder|avatar|logo|icons?)(?:[-_.\/\d]|$)|social[_-](?:facebook|twitter)|\.(?:svg|gif)(?:\?|$)/i.test(
          new URL(url).pathname,
        )
      )
        continue;
      seen.add(url);
      candidates.push({
        url,
        sourceUrl,
        title,
        score,
      });
      break;
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ url, sourceUrl, title }) => ({ url, sourceUrl, title }));
}
