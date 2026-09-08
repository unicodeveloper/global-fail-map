import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { investigationInputSchema } from '../src/lib/fail-map-types';
import { buildResearchNotification } from '../src/lib/server/research-notification';
import { POST } from '../src/app/api/investigations/route';

const location = { name: 'Denver', latitude: 39.7392, longitude: -104.9903 };
const previousEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.NEXT_PUBLIC_APP_MODE = 'self-hosted';
process.env.NEXT_PUBLIC_APP_URL = 'https://failmap.example';
process.env.VALYU_API_KEY = 'test-placeholder';
process.env.DEEPRESEARCH_ALERT_EMAIL = 'researcher@example.com';

after(() => {
  process.env = previousEnvironment;
  globalThis.fetch = originalFetch;
});

function post(body: unknown) {
  return new Request('https://failmap.example/api/investigations', {
    method: 'POST',
    headers: {
      Origin: 'https://failmap.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('research defaults to fast without silently enabling email alerts', () => {
  const input = investigationInputSchema.parse({ location });
  assert.equal(input.mode, 'fast');
  assert.equal(input.notifyOnCompletion, false);
});

test('research accepts the three selectable API modes and rejects arbitrary recipients', () => {
  for (const mode of ['fast', 'standard', 'heavy']) {
    assert.equal(
      investigationInputSchema.safeParse({ location, mode }).success,
      true,
    );
  }
  for (const mode of ['lite', 'max', 'unknown']) {
    assert.equal(
      investigationInputSchema.safeParse({ location, mode }).success,
      false,
    );
  }
  assert.equal(
    investigationInputSchema.safeParse({ location, email: 'other@example.com' })
      .success,
    false,
  );
  assert.equal(
    investigationInputSchema.safeParse({ location, notifyOnCompletion: 'yes' })
      .success,
    false,
  );
});

test('completion notification uses the literal API placeholder and the app report URL', () => {
  assert.deepEqual(
    buildResearchNotification({
      enabled: true,
      email: ' researcher@example.com ',
      appUrl: 'https://failmap.example/api/investigations?unrelated=1#section',
    }),
    {
      email: 'researcher@example.com',
      custom_url: 'https://failmap.example/?research={id}',
    },
  );
});

test('notification is omitted when opted out or no valid recipient is configured', () => {
  const options = {
    enabled: true,
    email: 'researcher@example.com',
    appUrl: 'https://failmap.example',
  };
  assert.equal(
    buildResearchNotification({ ...options, enabled: false }),
    undefined,
  );
  assert.equal(
    buildResearchNotification({ ...options, email: undefined }),
    undefined,
  );
  assert.equal(
    buildResearchNotification({ ...options, email: 'invalid' }),
    undefined,
  );
  assert.equal(
    buildResearchNotification({ ...options, appUrl: 'not a URL' }),
    undefined,
  );
  assert.equal(
    buildResearchNotification({ ...options, appUrl: 'javascript:alert(1)' }),
    undefined,
  );
});

test('creation sends selected modes and notification fields using the verified API contract', async () => {
  let requestCount = 0;
  globalThis.fetch = (async (resource, options) => {
    assert.equal(
      String(resource),
      'https://api.valyu.ai/v1/deepresearch/tasks',
    );
    const body = JSON.parse(String(options?.body));
    const mode = ['fast', 'standard', 'heavy'][requestCount];
    assert.equal(body.mode, mode);
    assert.deepEqual(body.alert_email, {
      email: 'researcher@example.com',
      custom_url: 'https://failmap.example/?research={id}',
    });
    assert.equal(body.metadata.email, undefined);
    requestCount += 1;
    return Response.json({
      deepresearch_id: randomUUID(),
      status: 'running',
      mode,
    });
  }) as typeof fetch;
  for (const mode of ['fast', 'standard', 'heavy']) {
    const response = await POST(
      post({ location, mode, notifyOnCompletion: true }),
    );
    assert.equal(response.status, 201);
    assert.equal((await response.json()).notified, true);
  }
  assert.equal(requestCount, 3);
});

test('creation does not send an email when the user opts out', async () => {
  globalThis.fetch = (async (_resource, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal('alert_email' in body, false);
    return Response.json({ deepresearch_id: randomUUID(), status: 'running' });
  }) as typeof fetch;
  const response = await POST(post({ location, notifyOnCompletion: false }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).notified, false);
});

test('creation cannot be used to send alerts to a client-selected address', async () => {
  let contactedProvider = false;
  globalThis.fetch = (async () => {
    contactedProvider = true;
    return Response.json({});
  }) as typeof fetch;
  const response = await POST(
    post({
      location,
      notifyOnCompletion: true,
      alert_email: 'other@example.com',
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(contactedProvider, false);
});
