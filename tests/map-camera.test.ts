import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getMapCameraTarget,
  sameMapCameraTarget,
} from '../src/components/fail-map/map-camera';

const denver = { name: 'Denver', latitude: 39.7392, longitude: -104.9903 };

test('report camera starts centered on the research area at zoom four', () => {
  assert.deepEqual(getMapCameraTarget(denver, 'report', 384), {
    center: [-104.9903, 39.7392],
    zoom: 4,
  });
  assert.equal(getMapCameraTarget(denver, 'report', 0).zoom, 4);
});

test('recreated focus objects do not trigger camera changes during polling', () => {
  const original = getMapCameraTarget(denver, 'report', 384);
  const refreshed = getMapCameraTarget(
    { ...denver, name: 'Denver, Colorado' },
    'report',
    384,
  );
  assert.notEqual(original, refreshed);
  assert.equal(sameMapCameraTarget(original, refreshed), true);
});

test('a different research target changes the camera', () => {
  const original = getMapCameraTarget(denver, 'report', 384);
  const next = getMapCameraTarget(
    { name: 'London', latitude: 51.5, longitude: -0.12 },
    'report',
    384,
  );
  assert.equal(sameMapCameraTarget(original, next), false);
  assert.equal(sameMapCameraTarget(null, next), false);
});

test('report layout resizing does not change its camera target', () => {
  assert.equal(
    sameMapCameraTarget(
      getMapCameraTarget(denver, 'report', 0),
      getMapCameraTarget(denver, 'report', 640),
    ),
    true,
  );
});

test('worldwide research retains the globe instead of focusing placeholder coordinates', () => {
  assert.deepEqual(
    getMapCameraTarget(
      { name: 'Flying cars', latitude: 0, longitude: 0, scope: 'worldwide' },
      'report',
      384,
    ),
    {
      center: [10, 22],
      zoom: 0.8,
    },
  );
});

test('valid locations on the equator or prime meridian still receive a focused camera', () => {
  assert.deepEqual(
    getMapCameraTarget(
      { name: 'Greenwich', latitude: 51.48, longitude: 0 },
      'report',
      384,
    ),
    {
      center: [0, 51.48],
      zoom: 4,
    },
  );
  assert.deepEqual(
    getMapCameraTarget(
      { name: 'Equator', latitude: 0, longitude: 37 },
      'report',
      384,
    ),
    {
      center: [37, 0],
      zoom: 4,
    },
  );
});

test('atlas camera preserves its existing world and selection zooms', () => {
  assert.equal(getMapCameraTarget(null, undefined, 390).zoom, 0.8);
  assert.equal(getMapCameraTarget(null, 'atlas', 1440).zoom, 1.6);
  assert.equal(getMapCameraTarget(denver, 'atlas', 1440).zoom, 2.5);
});
