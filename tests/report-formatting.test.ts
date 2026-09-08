import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareReport } from '../src/components/fail-map/report-utils';

test('numbered plain-text references become distinct source rows even in one paragraph', () => {
  const result = prepareReport(
    '# Report\n\nFinding.\n\n## Sources\n[1] City archive. https://example.com/one [2] Council report. https://example.com/two',
    [],
  );
  assert.equal(result.body, 'Finding.');
  assert.deepEqual(result.sources, [
    { title: 'City archive', url: 'https://example.com/one' },
    { title: 'Council report', url: 'https://example.com/two' },
  ]);
});

test('Markdown references retain balanced and nested parentheses in URLs', () => {
  const result = prepareReport(
    '## References\n1. [Archive](https://example.com/item_(project_(A)))\n2. [Report](https://example.com/second_(B))',
    [],
  );
  assert.equal(result.body, '');
  assert.deepEqual(result.sources, [
    { title: 'Archive', url: 'https://example.com/item_(project_(A))' },
    { title: 'Report', url: 'https://example.com/second_(B)' },
  ]);
});

test('citation-number link labels use the reference title outside the link', () => {
  const result = prepareReport(
    '## Sources\n[[1]](https://example.com/first) Official archive\n[2](https://example.com/second) City report',
    [],
  );
  assert.equal(result.body, '');
  assert.deepEqual(
    result.sources.map((source) => source.title),
    ['Official archive', 'City report'],
  );
  const numbered = prepareReport(
    '## Sources\n1. [[1]](https://example.com/first) Official archive\n2. [2](https://example.com/second) City report',
    [],
  );
  assert.deepEqual(
    numbered.sources.map((source) => source.title),
    ['Official archive', 'City report'],
  );
});

test('collapsed citation-number links retain their corresponding titles', () => {
  const result = prepareReport(
    '## Sources\n[[1]](https://example.com/first) Official archive [[2]](https://example.com/second) City report',
    [],
  );
  assert.deepEqual(result.sources, [
    { title: 'Official archive', url: 'https://example.com/first' },
    { title: 'City report', url: 'https://example.com/second' },
  ]);
});

test('URL query parameters are not mistaken for additional sources', () => {
  const result = prepareReport(
    "## Sources\n1. [Archive](https://example.com/redirect?url=https://archive.example/L'Homme&filter[0]=1950)",
    [],
  );
  assert.deepEqual(result.sources, [
    {
      title: 'Archive',
      url: "https://example.com/redirect?url=https://archive.example/L'Homme&filter[0]=1950",
    },
  ]);
});

test('parenthetical publication metadata is not trimmed from source titles', () => {
  const result = prepareReport(
    '## Sources\n1. Annual report (1950): https://example.com/annual\n2. [Archive (1960)](https://example.com/archive)',
    [],
  );
  assert.deepEqual(
    result.sources.map((source) => source.title),
    ['Annual report (1950)', 'Archive (1960)'],
  );
});

test('number-only citation links fall back to the source hostname', () => {
  const result = prepareReport(
    '## Sources\n[[1]](https://example.com/archive)',
    [],
  );
  assert.deepEqual(result.sources, [
    { title: 'example.com', url: 'https://example.com/archive' },
  ]);
});

test('angle-bracket links preserve punctuation that belongs to the URL', () => {
  const result = prepareReport(
    '## Source links\n- [Why?](<https://example.com/why?>)\n- <https://example.com/final.>',
    [],
  );
  assert.deepEqual(
    result.sources.map((source) => source.url),
    ['https://example.com/why?', 'https://example.com/final.'],
  );
  assert.equal(result.sources[0].title, 'Why?');
});

test('raw URLs trim sentence punctuation but preserve matched URL parentheses', () => {
  const result = prepareReport(
    '## Sources\n1. A report: https://example.com/A_(B).\n2. Another: (https://example.com/second).',
    [],
  );
  assert.deepEqual(result.sources, [
    { title: 'A report', url: 'https://example.com/A_(B)' },
    { title: 'Another', url: 'https://example.com/second' },
  ]);
});

test('existing structured sources preserve order, repeated citation positions and metadata', () => {
  const sources = [
    { title: 'Source two', url: 'https://example.com/two' },
    { title: 'Source one', url: 'https://example.com/one' },
    { title: 'Repeated citation', url: 'https://example.com/two' },
  ];
  const result = prepareReport(
    '## Sources\n1. [One](https://example.com/one)\n2. [Two](https://example.com/two)\n3. [New](https://example.com/new)\n4. [New again](https://example.com/new)',
    sources,
  );
  assert.deepEqual(result.sources.slice(0, 3), sources);
  assert.equal(result.sources.length, 4);
  assert.equal(result.sources[3].url, 'https://example.com/new');
  assert.notEqual(result.sources[0], sources[0]);
});

test('reference definitions remain available to inline reference-style citations', () => {
  const result = prepareReport(
    'A finding [1].\n\n## Sources\n[1]: https://example.com/archive_(A) "Official archive"\n[city]: <https://example.com/city>\n  "City archive"',
    [],
  );
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].title, 'Official archive');
  assert.equal(result.sources[1].title, 'City archive');
  assert.match(result.body, /^A finding \[1\]\./);
  assert.match(
    result.body,
    /\[1\]: https:\/\/example.com\/archive_\(A\) "Official archive"/,
  );
  assert.match(
    result.body,
    /\[city\]: <https:\/\/example.com\/city>\n  "City archive"/,
  );
  assert.doesNotMatch(result.body, /## Sources/);
});

test('a bibliography before later report content does not remove that content', () => {
  const result = prepareReport(
    '## Sources\n1. [Archive](https://example.com/one)\n\n## What survived\nThe railway remains.\n\n### Sources of revenue\nTicket sales.',
    [],
  );
  assert.equal(
    result.body,
    '## What survived\nThe railway remains.\n\n### Sources of revenue\nTicket sales.',
  );
  assert.equal(result.sources.length, 1);
});

test('prose sections called Sources are preserved even when they contain a URL', () => {
  const content =
    '## Sources\nThe sources disagree about the timing. See https://example.com/report for one account.\n\nThis uncertainty matters.';
  assert.deepEqual(prepareReport(content, []), { body: content, sources: [] });
});

test('mixed bibliography and prose remains intact rather than losing the explanation', () => {
  const content =
    '## Sources\n1. Archive: https://example.com/archive\n\nThese records are incomplete and may undercount projects.';
  assert.deepEqual(prepareReport(content, []), { body: content, sources: [] });
});

test('a numbered list with an unsupported entry is preserved as a whole', () => {
  const content =
    '## References\n1. [Archive](https://example.com/archive)\n2. An offline book, pages 10-20.';
  assert.deepEqual(prepareReport(content, []), { body: content, sources: [] });
});

test('Sources headings inside fenced examples remain untouched', () => {
  const content =
    '```markdown\n## Sources\n1. [Archive](https://example.com/archive)\n```\n\n## Findings\nText.';
  assert.deepEqual(prepareReport(content, []), { body: content, sources: [] });
});

test('single-link bibliographies and different heading levels are recognized', () => {
  const result = prepareReport(
    '### **Bibliography**:\n[Archive](https://example.com/archive)\n\n### Details\nStill here.',
    [],
  );
  assert.equal(result.body, '### Details\nStill here.');
  assert.deepEqual(result.sources, [
    { title: 'Archive', url: 'https://example.com/archive' },
  ]);
});

test('multiline numbered titles and multiple URLs in an entry retain their text and links', () => {
  const result = prepareReport(
    '## Sources\n1. City planning archive,\n   annual report (1950).\n   https://example.com/one and https://example.com/two\n2. [Council](https://example.com/council)',
    [],
  );
  assert.equal(result.sources.length, 3);
  assert.match(
    result.sources[0].title,
    /City planning archive, annual report \(1950\)/,
  );
  assert.deepEqual(
    result.sources.map((source) => source.url),
    [
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/council',
    ],
  );
});

test('unsafe or malformed reference URLs never cause a section to be stripped', () => {
  for (const url of ['javascript:alert(1)', 'https://', 'file:///tmp/report']) {
    const content = `## Sources\n1. [Invalid](${url})`;
    assert.deepEqual(prepareReport(content, []), {
      body: content,
      sources: [],
    });
  }
});
test('years in reference titles are not mistaken for numbered bibliography entries', () => {
  const report =
    '## Sources\n\n[1] Mistake or Modern Marvel? (Published 1995) - https://example.com/1995\n[2] Another source - https://example.com/other';
  const result = prepareReport(report, []);
  assert.equal(result.body, '');
  assert.equal(result.sources.length, 2);
  assert.match(result.sources[0].title, /Published 1995/);
});
