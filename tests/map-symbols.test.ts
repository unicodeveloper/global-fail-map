import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mapSymbolPaths } from '../src/components/fail-map/map-symbols';
import { groupMapExamples } from '../src/components/fail-map/map-groups';
import examples from '../src/data/examples.json';
import type { Category, FailExample } from '../src/components/fail-map/types';

test('nearby overlapping symbols group without moving or losing stories', () => {
  const base = examples[0] as FailExample;
  const records = [
    { ...base, id: 'a', lat: 51, lng: 0 },
    { ...base, id: 'b', lat: 51.1, lng: 0.1 },
    { ...base, id: 'c', lat: -30, lng: 140 },
  ];
  const groups = groupMapExamples(records, () => ({ x: 100, y: 100 }));
  assert.deepEqual(
    groups.map((group) => group.map((entry) => entry.id)),
    [['a', 'b'], ['c']],
  );
  assert.equal(groups[0][0], records[0]);
  assert.equal(
    groupMapExamples(records.slice(0, 2), (entry) => ({
      x: entry.id === 'a' ? 0 : 50,
      y: 0,
    })).length,
    2,
  );
});

test('every seeded story has a map symbol and personal research has a fallback', () => {
  for (const example of examples) {
    assert.ok(
      mapSymbolPaths(example.id, example.category as Category).length > 0,
    );
  }
  assert.ok(mapSymbolPaths('', 'general').length > 0);
  assert.notDeepEqual(
    mapSymbolPaths('concorde', 'technology'),
    mapSymbolPaths('babbage', 'technology'),
  );
  assert.notDeepEqual(
    mapSymbolPaths('aduhelm', 'science'),
    mapSymbolPaths('verubecestat', 'science'),
  );
});

test('favicon assets have the advertised raster dimensions', () => {
  for (const [name, size] of [
    ['favicon-32.png', 32],
    ['favicon-64.png', 64],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ] as const) {
    const png = readFileSync(new URL(`../public/${name}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const icon = readFileSync(new URL('../src/app/favicon.ico', import.meta.url));
  assert.equal(icon.readUInt16LE(2), 1);
  assert.ok(icon.readUInt16LE(4) > 0);
});
