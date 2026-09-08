import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  projectImageInputSchema,
  publicImageUrl,
  selectProjectImages,
} from '../src/lib/project-images';
import { POST } from '../src/app/api/project-images/route';
import { callResearch } from '../src/lib/server/investigation-provider';

const previousEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.NEXT_PUBLIC_APP_MODE = 'self-hosted';
process.env.VALYU_API_KEY = 'test-placeholder';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3100';

after(() => {
  globalThis.fetch = originalFetch;
  process.env = previousEnvironment;
});

function post(body: unknown, origin = 'http://localhost:3100') {
  return new Request('http://localhost:3100/api/project-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

test('photo requests accept only bounded public subject labels, not report bodies or URLs', () => {
  assert(
    projectImageInputSchema.safeParse({
      projectName: 'Fordlandia',
      locationName: 'Brazil',
    }).success,
  );
  for (const input of [
    { projectName: 'x'.repeat(181) },
    { projectName: 'https://private.example.com/report' },
    { projectName: 'Fordlandia\nPrivate notes' },
    { projectName: 'Fordlandia', locationName: 'https://private.example.com' },
    { projectName: 'Fordlandia', report: 'Private report content' },
  ])
    assert.equal(projectImageInputSchema.safeParse(input).success, false);
});

test('photo URLs reject private hosts, embedded credentials and signed access links', () => {
  assert.equal(
    publicImageUrl('https://upload.wikimedia.org/wikipedia/photo.jpg#view'),
    'https://upload.wikimedia.org/wikipedia/photo.jpg',
  );
  for (const url of [
    'http://example.com/photo.jpg',
    'file:///etc/passwd',
    'data:image/png;base64,test',
    'https://127.0.0.1/photo.jpg',
    'https://2130706433/photo.jpg',
    'https://[::1]/photo.jpg',
    'https://host.local/photo.jpg',
    'https://metadata.google.internal/photo.jpg',
    'https://localhost/photo.jpg',
    'https://user:password@example.com/photo.jpg',
    'https://example.com:3000/photo.jpg',
    'https://example.com/photo.jpg?access_token=private',
    'https://example.com/photo.jpg?X-Goog-Signature=private',
    'https://example.com/photo.jpg?key=private',
  ])
    assert.equal(publicImageUrl(url), null, url);
});

test('photo selection preserves source attribution, removes logos and duplicates, and ranks the project', () => {
  const response = {
    results: [
      {
        title: 'Other factory',
        url: 'https://example.com/factory',
        image_url: 'https://images.example.com/other.jpg',
      },
      {
        title: '<b>Fordlandia</b> historical factory',
        url: 'https://example.com/fordlandia',
        image_url: {
          logo: 'https://images.example.com/logo.png',
          photo: 'https://images.example.com/factory.jpg',
        },
      },
      {
        title: 'Fordlandia duplicate',
        url: 'https://example.com/duplicate',
        image_url: 'https://images.example.com/factory.jpg',
      },
      {
        title: 'Fordlandia unsafe',
        url: 'https://example.com/unsafe',
        image_url: 'https://localhost/private.jpg',
      },
    ],
  };
  assert.deepEqual(selectProjectImages(response, 'Fordlandia'), [
    {
      title: 'Fordlandia historical factory',
      sourceUrl: 'https://example.com/fordlandia',
      url: 'https://images.example.com/factory.jpg',
    },
  ]);
  assert.equal(
    selectProjectImages(
      {
        results: Array.from({ length: 20 }, (_, index) => ({
          title: 'Fordlandia',
          url: `https://example.com/${index}`,
          image_url: `https://images.example.com/${index}.jpg`,
        })),
      },
      'Fordlandia',
    ).length,
    5,
  );
  assert.deepEqual(selectProjectImages(null, 'Fordlandia'), []);
});

test('photo discovery performs one bounded Valyu search and never fetches image URLs on the server', async () => {
  let requests = 0;
  globalThis.fetch = (async (input, init) => {
    requests += 1;
    assert.equal(String(input), 'https://api.valyu.ai/v1/deepsearch');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      query: 'Fordlandia Brazil photographs',
      search_type: 'web',
      max_num_results: 10,
    });
    assert.equal(init?.cache, 'no-store');
    return Response.json({
      results: [
        {
          title: 'Fordlandia archive',
          url: 'https://example.com/archive',
          image_url: 'https://images.example.com/archive.jpg',
        },
      ],
    });
  }) as typeof fetch;
  const response = await POST(
    post({ projectName: 'Fordlandia', locationName: 'Brazil' }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).images.length, 1);
  assert.equal(requests, 1);
});

test('cross-site and malformed photo requests never spend research credits', async () => {
  globalThis.fetch = (async () => {
    throw new Error('Provider must not be called');
  }) as typeof fetch;
  assert.equal(
    (
      await POST(
        post({ projectName: 'Fordlandia' }, 'https://other.example.com'),
      )
    ).status,
    403,
  );
  assert.equal((await POST(post({ projectName: '' }))).status, 400);
  assert.equal(
    (await POST(post({ projectName: 'Fordlandia', report: 'private' }))).status,
    400,
  );
});

test('project-specific searches retain successful photos when another subject fails', async () => {
  const queries: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    const { query } = JSON.parse(String(init?.body));
    queries.push(query);
    if (query.startsWith('Airport')) return new Response(null, { status: 500 });
    return Response.json({
      results: [
        {
          title: 'Denver Tramway historical photograph',
          url: 'https://archive.example.com/tramway',
          image_url: 'https://archive.example.com/tramway.jpg',
        },
      ],
    });
  }) as typeof fetch;
  const response = await POST(
    post({
      projectName: 'Denver',
      locationName: 'Colorado',
      subjects: ['Denver Tramway', 'Airport Baggage System'],
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).images.length, 1);
  assert.deepEqual(queries, [
    'Denver Tramway Colorado photographs',
    'Airport Baggage System Colorado photographs',
  ]);
});

test('photo selection excludes social sharing thumbnails and icon directories', () => {
  const images = [
    'Social_Facebook_806x806.jpg',
    'Social_Twitter_440x220.jpg',
    'Images/Icons/YouTube4.png',
  ];
  assert.deepEqual(
    selectProjectImages(
      {
        results: images.map((name) => ({
          title: 'Torcetrapib trial',
          url: 'https://archive.example.com/trial',
          image_url: `https://archive.example.com/${name}`,
        })),
      },
      'Torcetrapib',
    ),
    [],
  );
});

test('photo discovery keeps provider errors private and reports empty searches honestly', async () => {
  globalThis.fetch = (async () =>
    Response.json({ results: [] })) as typeof fetch;
  assert.deepEqual(
    await (await POST(post({ projectName: 'Fordlandia' }))).json(),
    { images: [] },
  );
  globalThis.fetch = (async () =>
    Response.json(
      { private: 'secret details' },
      { status: 500 },
    )) as typeof fetch;
  const failed = await POST(post({ projectName: 'Fordlandia' }));
  assert.equal(failed.status, 502);
  assert.equal(
    JSON.stringify(await failed.json()).includes('secret details'),
    false,
  );
  globalThis.fetch = (async () =>
    Response.json({ unexpected: 'private provider response' })) as typeof fetch;
  assert.equal((await POST(post({ projectName: 'Fordlandia' }))).status, 502);
});

test('hosted photo discovery uses the existing authenticated proxy contract', async () => {
  process.env.NEXT_PUBLIC_APP_MODE = 'valyu';
  try {
    globalThis.fetch = (async (input, init) => {
      assert.equal(String(input), 'https://platform.valyu.ai/api/oauth/proxy');
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        'Bearer test-session',
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        path: '/v1/deepsearch',
        method: 'POST',
        body: { query: 'Fordlandia photographs', max_num_results: 10 },
      });
      return Response.json({ results: [] });
    }) as typeof fetch;
    await callResearch('/v1/deepsearch', 'POST', 'test-session', {
      query: 'Fordlandia photographs',
      max_num_results: 10,
    });
  } finally {
    process.env.NEXT_PUBLIC_APP_MODE = 'self-hosted';
  }
});
test('project photo queries use the named cases in a location report', async () => {
  const { projectPhotoSubjects } = await import('../src/lib/project-images');
  assert.deepEqual(
    projectPhotoSubjects(
      '## Executive Summary\n## 1. Denver Tramway System: Strategic abandonment (1872-1950)\n## 2. Airport Baggage System: Technology before its time\n## Conclusion',
      'Denver',
    ),
    ['Denver Tramway System', 'Airport Baggage System'],
  );
  assert.deepEqual(
    projectPhotoSubjects('## What happened\nText\n## Sources', 'Exubera'),
    ['Exubera'],
  );
});
