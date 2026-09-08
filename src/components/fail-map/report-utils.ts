import type { Source } from './types';

export function sourceHostname(url: string) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol)
      ? parsed.hostname.replace(/^www\./, '')
      : '';
  } catch {
    return '';
  }
}

export function sourceTitle(source: Source) {
  return (
    source.title.replace(/<[^>]*>/g, '').trim() || sourceHostname(source.url)
  );
}

export function reportMarkdown(title: string, body: string, sources: Source[]) {
  const links = sources.map((source, index) => {
    const label = sourceTitle(source)
      .replace(/\s+/g, ' ')
      .replace(/[\\[\]]/g, '\\$&');
    const url = source.url.replace(/[<>\s]/g, (character) =>
      encodeURIComponent(character),
    );
    return `${index + 1}. [${label}](<${url}>)`;
  });
  const sourceLinks = links.length
    ? `\n\n## Source links\n\n${links.join('\n')}`
    : '';
  return `# ${title}\n\n${body}${sourceLinks}\n\n---\nGlobal Fail Map · Research by Valyu\n`;
}
