import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import { GET as getPublicInvestigation } from '../src/app/api/investigations/public/[id]/route';
import { POST as setInvestigationPublic } from '../src/app/api/investigations/[id]/share/route';
import {
  researchIdFromUrl,
  researchPath,
  sharedResearchPath,
} from '../src/lib/research-links';

const originalFetch = globalThis.fetch;
const previousEnvironment = { ...process.env };
process.env.NEXT_PUBLIC_APP_MODE = 'self-hosted';
process.env.NEXT_PUBLIC_APP_URL = 'https://fail-map.example';
process.env.VALYU_API_KEY = 'test-placeholder';

after(() => {
  globalThis.fetch = originalFetch;
  process.env = previousEnvironment;
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function shareRequest(id: string, value: unknown): Request {
  return new Request(
    `https://fail-map.example/api/investigations/${id}/share`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://fail-map.example',
      },
      body: JSON.stringify(value),
    },
  );
}

test('research URLs distinguish private resumes from explicit public shares', () => {
  const id = randomUUID();
  assert.equal(researchPath(id), `/?research=${id}`);
  assert.equal(sharedResearchPath(id), `/?share=${id}`);
  assert.deepEqual(researchIdFromUrl(`https://example.com/?research=${id}`), {
    id,
    shared: false,
  });
  assert.deepEqual(researchIdFromUrl(`/?share=${id}`), { id, shared: true });
  assert.equal(researchIdFromUrl('/?research=not-an-id'), null);
  assert.throws(() => researchPath('not-an-id'));
});

test('an owner can explicitly publish and revoke an app research task', async () => {
  const id = randomUUID();
  const desiredStates: boolean[] = [];
  globalThis.fetch = (async (
    resource: RequestInfo | URL,
    options?: RequestInit,
  ) => {
    const url = String(resource);
    if (url.endsWith(`/${id}/status`)) {
      assert.equal(options?.method, 'GET');
      assert.equal(options?.headers && 'X-API-Key' in options.headers, true);
      return Response.json({
        deepresearch_id: id,
        status: 'completed',
        query:
          'Research target: London\nResearch coordinates: 51.5, -0.12\nResearch category: infrastructure',
      });
    }
    assert.equal(
      url,
      `https://api.valyu.ai/v1/deepresearch/tasks/${id}/public`,
    );
    assert.equal(options?.method, 'POST');
    desiredStates.push(JSON.parse(String(options?.body)).public);
    return Response.json({ public: desiredStates.at(-1) });
  }) as typeof fetch;

  const published = await setInvestigationPublic(
    shareRequest(id, { public: true }),
    context(id),
  );
  assert.equal(published.status, 200);
  assert.deepEqual(await published.json(), {
    public: true,
    shareUrl: `https://fail-map.example/?share=${id}`,
  });

  const revoked = await setInvestigationPublic(
    shareRequest(id, { public: false }),
    context(id),
  );
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { public: false, shareUrl: null });
  assert.deepEqual(desiredStates, [true, false]);
});

test('share mutation rejects unrelated tasks and unexpected input', async () => {
  const id = randomUUID();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({
      deepresearch_id: id,
      status: 'completed',
      query: 'Unrelated private research',
    });
  }) as typeof fetch;
  const unrelated = await setInvestigationPublic(
    shareRequest(id, { public: true }),
    context(id),
  );
  assert.equal(unrelated.status, 404);
  assert.equal(calls, 1);

  const invalid = await setInvestigationPublic(
    shareRequest(id, { public: true, extra: true }),
    context(id),
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls, 1);
});

test('public reads send no credentials and expose only explicitly public safe fields', async () => {
  const id = randomUUID();
  globalThis.fetch = (async (
    resource: RequestInfo | URL,
    options?: RequestInit,
  ) => {
    assert.equal(
      String(resource),
      `https://platform.valyu.ai/api/deepresearch/tasks/${id}/public-view`,
    );
    assert.deepEqual(options?.headers, { Accept: 'application/json' });
    return Response.json({
      success: true,
      data: {
        deepresearch_id: id,
        public: true,
        status: 'completed',
        query:
          'Research target: London\nResearch coordinates: 51.5, -0.12\nResearch category: infrastructure',
        output: '# A public report',
        sources: [{ title: 'Archive', url: 'https://example.com/archive' }],
        messages: [{ role: 'assistant', content: 'Private execution trace' }],
        created_at: '2026-09-08T12:00:00.000Z',
      },
    });
  }) as typeof fetch;

  const response = await getPublicInvestigation(
    new Request(`https://fail-map.example/api/investigations/public/${id}`),
    context(id),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.shared, true);
  assert.equal(body.investigation.id, id);
  assert.equal(body.investigation.report, '# A public report');
  assert.equal('messages' in body.investigation, false);
});

test('public reads reject private provider responses', async () => {
  const id = randomUUID();
  globalThis.fetch = (async () =>
    Response.json({
      success: true,
      data: {
        deepresearch_id: id,
        public: false,
        status: 'completed',
        query: 'Research target: London',
      },
    })) as typeof fetch;
  const response = await getPublicInvestigation(
    new Request(`https://fail-map.example/api/investigations/public/${id}`),
    context(id),
  );
  assert.equal(response.status, 404);
});
