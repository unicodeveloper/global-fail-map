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

interface ReportLink extends Source {
  start: number;
  end: number;
}

function markdownText(value: string): string {
  return value
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1')
    .replace(/&amp;/g, '&');
}

function webLinks(text: string): ReportLink[] {
  const links: ReportLink[] = [];
  for (const match of text.matchAll(/https?:\/\//g)) {
    if (match.index < (links.at(-1)?.end || 0)) continue;
    let end = match.index;
    let depth = 0;
    let bracketDepth = 0;
    while (end < text.length && !/[\s<>"`]/.test(text[end])) {
      if (text[end] === '\\' && /[()]/.test(text[end + 1] || '')) {
        end += 2;
        continue;
      }
      if (text[end] === '(') depth += 1;
      if (text[end] === '[') bracketDepth += 1;
      if (text[end] === ']') {
        if (!bracketDepth) break;
        bracketDepth -= 1;
      }
      if (text[end] === ')') {
        if (!depth) break;
        depth -= 1;
      }
      end += 1;
    }

    let start = match.index;
    let title = '';
    const prefix = text.slice(0, start).replace(/<$/, '').trimEnd();
    const angle = text[start - 1] === '<';
    let suffix = end + (angle && text[end] === '>' ? 1 : 0);
    if (prefix.endsWith('](')) {
      let bracketDepth = 1;
      let opening = prefix.length - 3;
      for (; opening >= 0; opening -= 1) {
        if (prefix[opening - 1] === '\\') continue;
        if (prefix[opening] === ']') bracketDepth += 1;
        if (prefix[opening] === '[' && --bracketDepth === 0) break;
      }
      const closing = text
        .slice(suffix)
        .match(/^\s*(?:"[^"\n]*"|'[^'\n]*')?\s*\)/);
      if (opening >= 0 && closing) {
        title = markdownText(prefix.slice(opening + 1, -2));
        start = opening;
        suffix += closing[0].length;
      }
    }
    if (start === match.index && !angle) {
      while (/[.,;:!?]/.test(text[end - 1] || '')) end -= 1;
      suffix = end;
    } else if (angle && start === match.index) {
      start -= 1;
    }
    const url = markdownText(text.slice(match.index, end));
    if (sourceHostname(url)) links.push({ start, end: suffix, url, title });
  }
  return links;
}

function entrySources(entry: string, links: ReportLink[]): Source[] {
  let label = entry;
  for (const link of [...links].reverse()) {
    const title = /^\[?\d+\]?$/.test(link.title) ? '' : link.title;
    label = label.slice(0, link.start) + title + label.slice(link.end);
  }
  label = markdownText(label)
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, '')
    .trim();
  return links.map((link) => ({
    url: link.url,
    title:
      label ||
      (/^\[?\d+\]?$/.test(link.title) ? '' : link.title) ||
      sourceHostname(link.url),
  }));
}

function bibliographySources(bibliography: string) {
  const definitions: string[] = [];
  const extracted: Source[] = [];
  let valid = true;
  const remaining = bibliography.replace(
    /^ {0,3}\[([^\]\n]+)\]:[^\n]*(?:\n[ \t]+["'][^\n]*["'][ \t]*)?/gm,
    (definition: string, reference: string) => {
      const links = webLinks(definition);
      if (links.length !== 1) {
        valid = false;
        return definition;
      }
      const title = definition.match(/\s["']([^\n]+)["']\s*$/)?.[1];
      extracted.push({
        url: links[0].url,
        title:
          title ||
          (/^\d+$/.test(reference) ? sourceHostname(links[0].url) : reference),
      });
      definitions.push(definition);
      return '';
    },
  );
  if (!valid) return null;

  const links = webLinks(remaining);
  const markers = [
    ...[
      ...remaining.matchAll(
        /(?:^|(?<=\s))\[\[?\d+\]?\](?=\s)|^[ \t]*(?:\d+[.)]|[-*+])\s+/gm,
      ),
    ]
      .filter(
        (marker) =>
          !links.some(
            (link) => marker.index >= link.start && marker.index < link.end,
          ),
      )
      .map((marker) => ({ index: marker.index, length: marker[0].length })),
    ...links
      .filter((link) => /^\[?\d+\]?$/.test(link.title))
      .map((link) => ({ index: link.start, length: 0 })),
  ].sort((left, right) => left.index - right.index);
  const entries = markers.length
    ? markers
        .map((marker, index) =>
          remaining
            .slice(marker.index + marker.length, markers[index + 1]?.index)
            .trim(),
        )
        .filter(Boolean)
    : remaining
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
  if (markers.length && remaining.slice(0, markers[0].index).trim())
    return null;
  for (const entry of entries) {
    const entryLinks = webLinks(entry);
    if (!entryLinks.length || /\n\s*\n\s*\S/.test(entry)) return null;
    if (!markers.length) {
      let otherText = entry;
      for (const link of [...entryLinks].reverse()) {
        otherText = otherText.slice(0, link.start) + otherText.slice(link.end);
      }
      if (otherText.replace(/[\s,;.]/g, '')) return null;
    }
    extracted.push(...entrySources(entry, entryLinks));
  }
  return extracted.length ? { sources: extracted, definitions } : null;
}

export function prepareReport(content: string, sources: Source[]) {
  const allSources = sources.map((source) => ({ ...source }));
  const known = new Set(sources.map((source) => source.url));
  const markdown = content.replace(/\r\n/g, '\n').replace(/^# [^\n]+\n\s*/, '');
  const headings: {
    start: number;
    end: number;
    level: number;
    bibliography: boolean;
  }[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | null = null;
  for (const line of markdown.split('\n')) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence)
        fence = { character: delimiter[1][0], length: delimiter[1].length };
      else if (
        delimiter[1][0] === fence.character &&
        delimiter[1].length >= fence.length
      )
        fence = null;
    } else if (!fence) {
      const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
      if (heading)
        headings.push({
          start: offset,
          end: offset + line.length + 1,
          level: heading[1].length,
          bibliography:
            /^(?:Sources|References|Bibliography|Source links):?$/i.test(
              heading[2].replace(/\*\*/g, ''),
            ),
        });
    }
    offset += line.length + 1;
  }
  let body = '';
  let cursor = 0;
  for (const [index, heading] of headings.entries()) {
    if (!heading.bibliography || heading.start < cursor) continue;
    const end =
      headings.slice(index + 1).find((next) => next.level <= heading.level)
        ?.start ?? markdown.length;
    const bibliography = bibliographySources(markdown.slice(heading.end, end));
    if (!bibliography) continue;
    for (const source of bibliography.sources) {
      if (!known.has(source.url)) {
        allSources.push(source);
        known.add(source.url);
      }
    }
    body += markdown.slice(cursor, heading.start);
    if (bibliography.definitions.length)
      body += `${bibliography.definitions.join('\n')}\n\n`;
    cursor = end;
  }
  return { body: (body + markdown.slice(cursor)).trim(), sources: allSources };
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
