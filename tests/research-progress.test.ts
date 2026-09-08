import assert from 'node:assert/strict';
import { test } from 'node:test';
import { investigationFromTask } from '../src/lib/fail-map-types';

test('completed research reaches 100 even when the provider step budget is unused', () => {
  const result = investigationFromTask({
    status: 'completed',
    progress: { current_step: 6, total_steps: 10 },
  });
  assert.equal(result.progress, 100);
  assert.equal(result.currentStep, 6);
});

test('research progress uses actual steps and supports older provider field aliases', () => {
  assert.equal(
    investigationFromTask({
      status: 'running',
      progress: { current_step: 0, total_steps: 10 },
    }).progress,
    0,
  );
  assert.equal(
    investigationFromTask({
      status: 'running',
      progress: { step: 4, total: 10 },
    }).progress,
    40,
  );
  assert.equal(
    investigationFromTask({
      status: 'running',
      progress: { current_step: 20, total_steps: 10 },
    }).progress,
    99,
  );
});

test('missing or malformed steps never become invented percentages', () => {
  for (const progress of [
    undefined,
    {},
    { total_steps: 10 },
    { current_step: -1, total_steps: 10 },
    { current_step: Infinity, total_steps: 10 },
    { current_step: 1, total_steps: 0 },
    { current_step: 1, total_steps: NaN },
  ]) {
    assert.equal(
      investigationFromTask({ status: 'running', progress }).progress,
      undefined,
    );
  }
});
