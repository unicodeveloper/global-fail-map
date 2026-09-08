import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mapGeocodingTypes,
  resolveMapLocation,
} from '../src/components/fail-map/map-location';
import { buildInvestigationPrompt } from '../src/lib/fail-map-types';

const point = { latitude: 51.519, longitude: -2.591 };
const country = { id: 'country.1', text: 'United Kingdom' };
const region = { id: 'region.1', text: 'England' };
const city = { id: 'place.1', text: 'Bristol' };
const response = {
  features: [
    {
      id: 'locality.1',
      place_type: ['locality'],
      text: 'Filton',
      place_name: 'Filton, Bristol, England, United Kingdom',
      center: [-2.573, 51.51],
      context: [city, region, country],
    },
    {
      ...city,
      place_type: ['place'],
      place_name: 'Bristol, England, United Kingdom',
    },
    {
      ...region,
      place_type: ['region'],
      place_name: 'England, United Kingdom',
    },
    { ...country, place_type: ['country'], place_name: 'United Kingdom' },
  ],
};

test('map selection follows the existing zoom thresholds and result order', () => {
  const expected = [
    [0, 'United Kingdom'],
    [4.99, 'United Kingdom'],
    [5, 'England, United Kingdom'],
    [6.99, 'England, United Kingdom'],
    [7, 'Bristol, England, United Kingdom'],
    [9.99, 'Bristol, England, United Kingdom'],
    [10, 'Filton, Bristol, England, United Kingdom'],
    [14, 'Filton, Bristol, England, United Kingdom'],
  ] as const;
  for (const [zoom, name] of expected) {
    assert.equal(resolveMapLocation(response, { ...point, zoom }).name, name);
  }
  assert.equal(mapGeocodingTypes, 'country,region,place,locality,district');
});

test('country selection can recover the country from a town feature context', () => {
  const result = resolveMapLocation(
    { features: [response.features[0]] },
    { ...point, zoom: 2 },
  );
  assert.deepEqual(result, {
    name: 'United Kingdom',
    ...point,
    scope: 'location',
  });
});

test('regional and city scopes recover contextual names with geographic parents', () => {
  const onlyLocality = { features: [response.features[0]] };
  assert.equal(
    resolveMapLocation(onlyLocality, { ...point, zoom: 6 }).name,
    'England, United Kingdom',
  );
  assert.equal(
    resolveMapLocation(onlyLocality, { ...point, zoom: 8 }).name,
    'Bristol, England, United Kingdom',
  );
});

test('the selected feature never replaces the clicked coordinates with its center', () => {
  for (const zoom of [1, 6, 8, 12]) {
    const result = resolveMapLocation(response, { ...point, zoom });
    assert.equal(result.latitude, point.latitude);
    assert.equal(result.longitude, point.longitude);
    assert.equal(result.scope, 'location');
  }
});

test('zoomed-in selection accepts district names and text-only features', () => {
  const result = resolveMapLocation(
    {
      features: [
        { id: 'district.2', text: 'District 4', context: [region, country] },
      ],
    },
    { ...point, zoom: 11 },
  );
  assert.equal(result.name, 'District 4, England, United Kingdom');
});

test('missing preferred geography falls back to the first usable returned feature', () => {
  const result = resolveMapLocation(
    { features: [null, { place_type: ['region'], text: 'England' }] },
    { ...point, zoom: 2 },
  );
  assert.equal(result.name, 'England');
});

test('empty or malformed provider payloads retain a readable coordinate fallback', () => {
  for (const payload of [
    null,
    {},
    { features: [] },
    { features: 'bad' },
    {
      features: [null, false, {}, { place_type: ['country'], text: ' ' }],
    },
  ]) {
    assert.deepEqual(resolveMapLocation(payload, { ...point, zoom: 2 }), {
      name: '51.519, -2.591',
      ...point,
      scope: 'location',
    });
  }
});

test('invalid zoom defaults to the broad country scope', () => {
  assert.equal(
    resolveMapLocation(response, { ...point, zoom: Number.NaN }).name,
    'United Kingdom',
  );
});

test('country selection reaches the research prompt as the named target', () => {
  const location = resolveMapLocation(response, { ...point, zoom: 2 });
  const prompt = buildInvestigationPrompt({
    location,
    category: 'general',
    instructions: '',
  });
  assert.match(prompt, /^Research target: United Kingdom$/m);
  assert.match(prompt, /^Research coordinates: 51.519, -2.591$/m);
  assert.match(prompt, /Research the full named area/);
  assert.match(prompt, /not a restriction on the research boundary/);
  assert.doesNotMatch(prompt, /Filton|Bristol/);
});
