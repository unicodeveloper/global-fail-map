import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { buildInvestigationPrompt, investigationFromTask, investigationInputSchema } from '../src/lib/fail-map-types';
import { assertSameOrigin, RequestError } from '../src/lib/server/http';
import { seal, unseal } from '../src/lib/server/valyu-session';
import { POST as createInvestigation, GET as listInvestigations } from '../src/app/api/investigations/route';
import { GET as pollInvestigation } from '../src/app/api/investigations/[id]/route';

const previousEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.NEXT_PUBLIC_APP_MODE = 'self-hosted';
process.env.VALYU_API_KEY = 'test-placeholder';
process.env.VALYU_SESSION_SECRET = randomUUID();
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3100';

after(() => {
  globalThis.fetch = originalFetch;
  process.env = previousEnvironment;
});

function post(body: unknown): Request {
  return new Request('http://localhost:3100/api/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' },
    body: JSON.stringify(body),
  });
}

test('input validation rejects unbounded coordinates and unsupported categories', () => {
  assert.equal(investigationInputSchema.safeParse({ location: { name: 'London', latitude: 91, longitude: 0 } }).success, false);
  assert.equal(investigationInputSchema.safeParse({ location: { name: 'London', latitude: 51, longitude: 0 }, category: 'medical-advice' }).success, false);
  assert.equal(investigationInputSchema.safeParse({ location: { name: 'London', latitude: 51, longitude: 0 }, instructions: 'x'.repeat(2001) }).success, false);
});

test('cross-site requests cannot spend research credits', () => {
  assert.throws(() => assertSameOrigin(new Request('http://localhost:3100/api/investigations', {
    method: 'POST', headers: { Origin: 'https://unrelated.example' },
  })), (error: unknown) => error instanceof RequestError && error.status === 403);
});

test('session encryption rejects tampering and does not reveal bearer credentials', () => {
  const payload = { accessToken: 'private-bearer-value', expiresAt: Date.now() + 3600000 };
  const cookie = seal(payload);
  assert.equal(cookie.includes(payload.accessToken), false);
  assert.deepEqual(unseal(cookie), payload);
  const changed = Buffer.from(cookie, 'base64url');
  changed[changed.length - 1] ^= 1;
  assert.equal(unseal(changed.toString('base64url')), null);
  assert.equal(unseal('not-a-valid-cookie'), null);
});

test('research prompt preserves evidence and geographic precision', () => {
  const prompt = buildInvestigationPrompt({ location: { name: 'Basel', latitude: 47.56, longitude: 7.59 }, category: 'science', instructions: '' });
  assert.match(prompt, /^Research target: Basel/m);
  assert.match(prompt, /^Research coordinates: 47.56, 7.59/m);
  assert.match(prompt, /A terminated trial does not establish lack of efficacy/);
  assert.match(prompt, /project site, headquarters, laboratory, trial site/);
  assert.match(prompt, /primary sources/);
});

test('worldwide idea research has no invented geographic anchor', () => {
  const prompt = buildInvestigationPrompt({ location: { name: 'Flying cars', latitude: 0, longitude: 0, scope: 'worldwide' }, category: 'technology', instructions: '' });
  assert.match(prompt, /worldwide topic search/);
  assert.match(prompt, /establish the real location of each case/);
  assert.doesNotMatch(prompt, /at latitude 0/);
});

test('task responses expose only safe report fields and source URLs', () => {
  const id = randomUUID();
  const result = investigationFromTask({
    deepresearch_id: id,
    status: 'completed',
    query: 'Research target: London\nResearch coordinates: 51.5, -0.12\nResearch category: infrastructure',
    output: '# A documented attempt',
    sources: [{ title: 'Archive', url: 'https://example.com/archive' }, { title: 'Bad URL', url: 'javascript:alert(1)' }],
    messages: [{ role: 'assistant', content: 'Internal trace that must never be served' }],
    created_at: '2026-09-08T12:00:00.000Z',
  });
  assert.equal(result.id, id);
  assert.equal(result.location.name, 'London');
  assert.equal(result.location.latitude, 51.5);
  assert.equal(result.category, 'infrastructure');
  assert.equal(result.sources.length, 1);
  assert.equal('messages' in result, false);
});

test('create, list and poll use the DeepResearch API contract', async () => {
  const providerId = randomUUID();
  globalThis.fetch = (async (resource: RequestInfo | URL, options?: RequestInit) => {
    const url = String(resource);
    if (options?.method === 'POST') {
      assert.equal(url, 'https://api.valyu.ai/v1/deepresearch/tasks');
      const body = JSON.parse(String(options.body));
      assert.equal(body.mode, 'fast');
      assert.equal(body.model, undefined);
      assert.deepEqual(body.output_formats, ['markdown']);
      assert.match(body.query, /^Research target: London/m);
      return Response.json({ deepresearch_id: providerId, status: 'running', created_at: '2026-09-08T12:00:00.000Z' }, { status: 202 });
    }
    if (url.endsWith('/v1/deepresearch/list?limit=50')) {
      return Response.json([{ deepresearch_id: providerId, status: 'running', query: 'Research target: London\nResearch coordinates: 51.5, -0.12\nResearch category: infrastructure', created_at: '2026-09-08T12:00:00.000Z' }]);
    }
    assert.equal(url, `https://api.valyu.ai/v1/deepresearch/tasks/${providerId}/status`);
    return Response.json({
      deepresearch_id: providerId,
      status: 'completed',
      query: 'Research target: London\nResearch coordinates: 51.5, -0.12\nResearch category: infrastructure',
      output: '# A documented attempt',
      sources: [{ title: 'Archive', url: 'https://example.com/archive' }],
      created_at: '2026-09-08T12:00:00.000Z',
      completed_at: '2026-09-08T12:05:00.000Z',
    });
  }) as typeof fetch;

  const input = { location: { name: 'London', latitude: 51.5, longitude: -0.12 }, category: 'infrastructure' };
  const created = await createInvestigation(post(input));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).investigation.id, providerId);

  const listed = await listInvestigations();
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).investigations[0].location.name, 'London');

  const poll = await pollInvestigation(new Request(`http://localhost:3100/api/investigations/${providerId}`), { params: Promise.resolve({ id: providerId }) });
  const completed = (await poll.json()).investigation;
  assert.equal(completed.status, 'completed');
  assert.match(completed.report, /documented attempt/);
});

test('bad input and provider failures return safe errors', async () => {
  const invalid = await createInvestigation(post({ location: { name: '', latitude: 0, longitude: 0 } }));
  assert.equal(invalid.status, 400);
  globalThis.fetch = (async () => Response.json({ error: 'private provider details and credentials' }, { status: 402 })) as typeof fetch;
  const response = await createInvestigation(post({ location: { name: 'Rome', latitude: 41.9, longitude: 12.5 } }));
  assert.equal(response.status, 402);
  const error = await response.json();
  assert.equal(error.error, 'INSUFFICIENT_CREDITS');
  assert.equal(JSON.stringify(error).includes('private provider details'), false);
});
