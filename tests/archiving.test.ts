import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  archiveSearchUrl,
  archiveYearLabel,
  archiveYears,
  isNigerianLocation,
} from '../src/lib/archiving';
import { buildInvestigationPrompt } from '../src/lib/fail-map-types';
import examples from '../src/data/examples.json';
import type { FailExample } from '../src/components/fail-map/types';

const lagos = { name: 'Lagos', latitude: 6.45, longitude: 3.4 };

test('the archive is offered for Nigeria and withheld everywhere else', () => {
  assert.equal(isNigerianLocation(lagos), true);
  assert.equal(
    isNigerianLocation({ name: 'Mambilla Plateau', ...{ latitude: 6.9, longitude: 11.1 } }),
    true,
  );
  /* The name carries places the box misses, such as a company headquarters. */
  assert.equal(
    isNigerianLocation({ name: 'Nigerian Airways', latitude: 51.5, longitude: -0.1 }),
    true,
  );
  assert.equal(
    isNigerianLocation({ name: 'Accra', latitude: 5.6, longitude: -0.2 }),
    false,
  );
  assert.equal(
    isNigerianLocation({ ...lagos, scope: 'worldwide' }),
    false,
  );
});

test('a search carries the press vocabulary for the category, not the project name alone', () => {
  const url = new URL(
    archiveSearchUrl({ subject: 'Ajaokuta Steel', category: 'infrastructure' })!,
  );
  assert.equal(url.origin + url.pathname, 'https://archivi.ng/search');
  const extract = url.searchParams.get('extract') || '';
  assert.match(extract, /^Ajaokuta Steel /);
  assert.match(extract, /white elephant/);

  const companies = new URL(
    archiveSearchUrl({ subject: 'Bank of the North', category: 'companies' })!,
  ).searchParams.get('extract');
  assert.match(companies || '', /receivership/);
  assert.doesNotMatch(companies || '', /white elephant/);

  /* An unknown category still searches rather than throwing. */
  assert.ok(archiveSearchUrl({ subject: 'Lagos', category: 'all' }));
  assert.equal(archiveSearchUrl({ subject: '   ', category: 'general' }), null);
});

test('the years searched follow the story period', () => {
  const open = archiveYears('1979-present', 1979);
  assert.equal(open?.from, 1977);
  assert.ok(open && open.to >= 2026);

  const closed = archiveYears('1962-1971', 1962);
  assert.deepEqual(closed, { from: 1962, to: 1973 });

  const single = archiveYears('1985', 1985);
  assert.deepEqual(single, { from: 1983, to: 1990 });

  assert.equal(archiveYears('', undefined), null);
  assert.equal(archiveYearLabel(null), '');
  assert.equal(archiveYearLabel({ from: 1979, to: 1999 }), '1979-1999');
});

test('a date window reaches the archive as a bounded search', () => {
  const url = new URL(
    archiveSearchUrl({
      subject: 'Ajaokuta Steel',
      category: 'infrastructure',
      years: { from: 1979, to: 1999 },
    })!,
  );
  assert.equal(url.searchParams.get('start_date'), '1979-01-01');
  assert.equal(url.searchParams.get('end_date'), '1999-12-31');
});

test('the seeded Nigerian story can reach the archive', () => {
  const nigerian = (examples as FailExample[]).filter(
    (example) => example.country === 'Nigeria',
  );
  assert.ok(nigerian.length);
  for (const example of nigerian) {
    const years = archiveYears(example.period, example.year);
    assert.ok(archiveSearchUrl({ subject: example.title, category: example.category, years }));
  }
});

test('only a Nigerian investigation is told the archive exists', () => {
  const base = { category: 'infrastructure' as const, instructions: '' };
  assert.match(
    buildInvestigationPrompt({ ...base, location: lagos }),
    /archivi\.ng/,
  );
  assert.doesNotMatch(
    buildInvestigationPrompt({
      ...base,
      location: { name: 'Accra', latitude: 5.6, longitude: -0.2 },
    }),
    /archivi\.ng/,
  );
});
