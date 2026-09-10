import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getGlobeSpinStep,
  getMapCameraTarget,
  sameMapCameraTarget,
  spinDegreesPerSecond,
  wrapLongitude,
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
      center: [-38, 26],
      zoom: 0.9,
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

test('atlas camera opens over the marker-dense Atlantic rim', () => {
  assert.equal(getMapCameraTarget(null, undefined, 390).zoom, 0.9);
  assert.equal(getMapCameraTarget(null, 'atlas', 1440).zoom, 1.7);
  assert.equal(getMapCameraTarget(denver, 'atlas', 1440).zoom, 2.5);
  assert.deepEqual(getMapCameraTarget(null, 'atlas', 1440).center, [-38, 26]);
});

test('the idle drift turns at a steady pace while the globe is whole', () => {
  assert.equal(getGlobeSpinStep(1.7, 1000), spinDegreesPerSecond * 0.1);
  assert.equal(getGlobeSpinStep(0.9, 500), getGlobeSpinStep(2, 500));
});

test('the drift eases out as the reader zooms in and stops on the ground', () => {
  assert.ok(getGlobeSpinStep(3, 100) < getGlobeSpinStep(2, 100));
  assert.equal(getGlobeSpinStep(4, 100), 0);
  assert.equal(getGlobeSpinStep(9, 100), 0);
});

test('a stalled frame does not lurch the globe forward', () => {
  assert.equal(getGlobeSpinStep(1.7, 8000), getGlobeSpinStep(1.7, 100));
  assert.equal(getGlobeSpinStep(1.7, -20), 0);
});

test('a globe left turning stays within normal longitudes', () => {
  assert.equal(wrapLongitude(-190), 170);
  assert.equal(wrapLongitude(-38), -38);
  assert.equal(wrapLongitude(540), -180);
});
