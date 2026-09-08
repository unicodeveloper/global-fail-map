import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import examples from '../src/data/examples.json';
import {
  reportMarkdown,
  sourceHostname,
  sourceTitle,
} from '../src/components/fail-map/report-utils';

test('source labels remove markup and favicons use only web hostnames', () => {
  assert.equal(
    sourceTitle({
      title: '<b>Official archive</b>',
      url: 'https://www.example.com/path?private=value',
    }),
    'Official archive',
  );
  assert.equal(
    sourceTitle({ title: ' ', url: 'https://www.example.com/path' }),
    'example.com',
  );
  assert.equal(
    sourceHostname('https://www.example.com/path?private=value'),
    'example.com',
  );
  assert.equal(sourceHostname('javascript:alert(1)'), '');
  assert.equal(sourceHostname('not a URL'), '');
});

test('downloaded reports preserve readable, clickable source links', () => {
  const markdown = reportMarkdown('Concorde', 'A documented history.', [
    { title: '<b>Archive [1976]</b>', url: 'https://example.com/a report' },
  ]);
  assert.match(markdown, /^# Concorde\n\nA documented history\./);
  assert.ok(
    markdown.includes(
      '1. [Archive \\[1976\\]](<https://example.com/a%20report>)',
    ),
  );
  assert.doesNotMatch(reportMarkdown('Title', 'Body', []), /## Source links/);
});

test('all cached stories have reports and matching numbered citation sources', () => {
  assert.ok(examples.length >= 32);
  assert.equal(
    new Set(examples.map((example) => example.id)).size,
    examples.length,
  );
  for (const example of examples) {
    const markdown = readFileSync(
      new URL(`../public${example.reportPath}`, import.meta.url),
      'utf8',
    );
    assert.ok(markdown.length > 500, `${example.id} has a substantive report`);
    const citations = [
      ...markdown.matchAll(
        /\[\[(\d+)\]\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g,
      ),
    ];
    assert.ok(citations.length > 0, `${example.id} has numbered citations`);
    assert.equal(
      citations.length,
      [...markdown.matchAll(/\[\[\d+\]\]\(/g)].length,
      `${example.id} has no malformed citation links`,
    );
    for (const match of citations) {
      const source = example.sources[Number(match[1]) - 1];
      assert.equal(
        source?.url,
        match[2],
        `${example.id} citation ${match[1]} matches its source`,
      );
    }
  }
});

test('expanded research covers the original sectors with dated, sourced locations', () => {
  const additions = [
    'exubera',
    'torcetrapib',
    'verubecestat',
    'bapineuzumab',
    'aduhelm',
    'loon',
    'argo-ai',
    'fisker-ocean',
    'dyson-ev',
    'apple-airpower',
    'keystone-xl',
    'texcoco-airport',
  ];
  for (const id of additions) {
    const example = examples.find((entry) => entry.id === id);
    assert.ok(example, `${id} is available`);
    assert.match(example.statusDate || '', /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(example.locationRole);
    assert.ok(example.confidence);
    assert.ok(example.sources.length >= 3);
    assert.ok(example.deepresearchId);
    assert.equal(example.deepresearchMode, 'fast');
  }
});
