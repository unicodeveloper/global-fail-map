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

test('History message activity preserves research steps and pairs their sources', () => {
  const result = investigationFromTask({
    status: 'running',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Private instructions' }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Compare contemporary records.' },
          { type: 'text', text: 'Checking the project timeline.' },
          {
            type: 'tool-call',
            toolCallId: 'research-1',
            toolName: 'research',
            input: { objective: 'Search: original cancellation announcement' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'research-1',
            toolName: 'research',
            output: {
              type: 'json',
              value: {
                sources: [
                  {
                    title: 'Original announcement',
                    url: 'https://example.org/announcement',
                  },
                ],
              },
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'read-1',
            toolName: 'fetch_contents',
            input: { urls: ['https://example.org/archive'] },
          },
        ],
      },
    ],
  });
  assert.deepEqual(result.activity, [
    {
      id: 'step-1-0',
      type: 'thought',
      title: 'Research plan',
      detail: 'Compare contemporary records.',
      status: 'completed',
    },
    {
      id: 'step-1-1',
      type: 'write',
      title: 'Research update',
      detail: 'Checking the project timeline.',
      status: 'completed',
    },
    {
      id: 'step-1-2',
      type: 'search',
      title: 'Searching sources',
      detail: 'Search: original cancellation announcement',
      status: 'completed',
      sources: [
        {
          title: 'Original announcement',
          url: 'https://example.org/announcement',
        },
      ],
    },
    {
      id: 'step-3-0',
      type: 'read',
      title: 'Reading sources',
      detail: 'https://example.org/archive',
      status: 'running',
    },
  ]);
});

test('activity deduplicates repeated messages and calls without inventing tool completion', () => {
  const call = {
    type: 'tool-call',
    toolName: 'web_search',
    toolCallId: 'same',
    input: { query: 'London projects' },
  };
  const result = investigationFromTask({
    messages: [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Checking sources.' }, call],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Checking sources.' }, call],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'read',
            toolCallId: 'standalone',
            output: { sources: [{ url: 'https://example.org/' }] },
          },
        ],
      },
    ],
  });
  assert.equal(result.activity?.length, 3);
  assert.equal(result.activity?.[1].status, 'running');
  assert.equal(result.activity?.[2].status, 'completed');
  assert.deepEqual(result.activity?.[2].sources, [
    { title: 'example.org', url: 'https://example.org/' },
  ]);
});

test('activity only exposes allowlisted text, queries, and safe source links', () => {
  const result = investigationFromTask({
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'PRIVATE_SYSTEM' }] },
      { role: 'user', content: [{ type: 'text', text: 'PRIVATE_USER' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'search',
            toolCallId: 'one',
            input: {
              queries: ['A', 'B', 'A'],
              password: 'PRIVATE_INPUT',
              headers: { authorization: 'PRIVATE_HEADER' },
            },
          },
          {
            type: 'tool-call',
            toolName: 'custom_tool',
            toolCallId: 'two',
            input: { credentials: 'PRIVATE_CREDENTIALS' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'one',
            output: {
              value: {
                text: 'PRIVATE_RAW_RESULT',
                sources: [
                  { title: 'A', url: 'https://example.org/' },
                  { title: 'Duplicate', url: 'https://example.org/' },
                  { title: 'Unsafe', url: 'javascript:alert(1)' },
                  {
                    title: 'Private',
                    url: 'https://name:password@example.org/',
                  },
                  { title: 'File', url: 'file:///private/document' },
                  { title: 'Relative', url: '/local' },
                ],
              },
            },
          },
        ],
      },
    ],
  });
  const encoded = JSON.stringify(result.activity);
  assert.equal(encoded.includes('PRIVATE_'), false);
  assert.equal(result.activity?.[0].detail, 'A\nB');
  assert.deepEqual(result.activity?.[0].sources, [
    { title: 'A', url: 'https://example.org/' },
  ]);
  assert.equal(result.activity?.[1].title, 'custom tool');
  assert.equal(result.activity?.[1].detail, undefined);
});

test('activity is absent for public serialization and malformed messages', () => {
  const task = {
    messages: [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Owner-only update' }],
      },
    ],
  };
  assert.ok(investigationFromTask(task).activity);
  assert.equal(
    'activity' in
      investigationFromTask(task, undefined, { includeActivity: false }),
    false,
  );
  for (const messages of [
    undefined,
    {},
    'raw',
    [
      null,
      1,
      [],
      { role: 'assistant', content: 'raw' },
      { role: 'tool', content: [{ type: 'tool-result' }] },
    ],
  ]) {
    assert.equal('activity' in investigationFromTask({ messages }), false);
  }
});

test('activity retains more than a preview while bounding entries and text sizes', () => {
  const messages = Array.from({ length: 250 }, (_, index) => ({
    role: 'assistant',
    content: [
      { type: 'reasoning', text: `Step ${index}\u0000 ${'x'.repeat(6000)}` },
    ],
  }));
  const activity = investigationFromTask({ messages }).activity!;
  assert.equal(activity.length, 200);
  assert.equal(activity[0].id, 'step-0-0');
  assert.equal(activity[199].id, 'step-199-0');
  for (const step of activity) {
    assert.equal(step.detail?.length, 4000);
    assert.equal(step.detail?.includes('\u0000'), false);
  }
});

test('activity IDs remain stable when a running tool receives its result', () => {
  const messages: Record<string, unknown>[] = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'write',
          toolName: 'write_report',
          input: { query: 'Compare the findings' },
        },
      ],
    },
  ];
  const before = investigationFromTask({ messages }).activity!;
  messages.push({
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'write',
        output: { text: 'Raw report body' },
      },
    ],
  });
  const after = investigationFromTask({ messages }).activity!;
  assert.equal(before[0].type, 'write');
  assert.equal(before[0].status, 'running');
  assert.equal(after[0].status, 'completed');
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].detail, before[0].detail);
  assert.equal(after.length, 1);
});
