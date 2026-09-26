import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler, { clientIp, isPlausibleBase64 } from '../../api/create-printify';

const APP_ORIGIN = 'https://citylines.test';
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const ENV = {
  APP_ORIGIN,
  PRINTIFY_API_KEY: 'test-key',
  PRINTIFY_SHOP_ID: '26401971',
  PRINTIFY_STORE_DOMAIN: 'citylines-art',
  UPSTASH_REDIS_REST_URL: 'https://mock-redis.test',
  UPSTASH_REDIS_REST_TOKEN: 'test-token',
};

function post(body: unknown, headers: Record<string, string> = {}, ip = '203.0.113.9') {
  return new Request('https://citylines.test/api/create-printify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = { image_base64: B64, city_name: 'Lisbon', design_hash: 'a1b2c3d4e5' };

/** Counts calls per upstream and serves canned JSON. */
function mockUpstream(opts: { ipCount?: number; globalCount?: number } = {}) {
  const calls = { printify: 0, redis: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input);
    if (url.includes('mock-redis.test')) {
      calls.redis++;
      // /pipeline replies [count, 'OK', count, 'OK', ...]
      const count = opts.ipCount ?? 1;
      const global = opts.globalCount ?? 1;
      return new Response(JSON.stringify([count, 'OK', global, 'OK']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('api.printify.com')) {
      calls.printify++;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ENV);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe('clientIp', () => {
  const mk = (headers: Record<string, string>) =>
    new Request('https://x.test/', { headers });

  it('uses the RIGHTMOST x-forwarded-for entry, not a spoofed leftmost one', () => {
    const req = mk({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.7' });
    expect(clientIp(req)).toBe('198.51.100.7');
  });

  it('cannot be bypassed by prepending fake addresses', () => {
    const req = mk({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 203.0.113.42' });
    expect(clientIp(req)).not.toBe('9.9.9.9');
    expect(clientIp(req)).not.toBe('8.8.8.8');
    expect(clientIp(req)).toBe('203.0.113.42');
  });

  it('prefers x-vercel-forwarded-for when present', () => {
    const req = mk({ 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '1.1.1.1' });
    expect(clientIp(req)).toBe('198.51.100.7');
  });

  it('falls back to a single shared bucket when no usable address exists', () => {
    expect(clientIp(mk({}))).toBe('unknown');
    expect(clientIp(mk({ 'x-forwarded-for': 'not-an-ip-at-all' }))).toBe('unknown');
  });

  it('ignores an untrustworthy rightmost value rather than using it as a key', () => {
    const req = mk({ 'x-forwarded-for': '198.51.100.7, garbage!!' });
    expect(clientIp(req)).toBe('unknown');
  });
});

describe('isPlausibleBase64', () => {
  it('accepts real base64', () => {
    expect(isPlausibleBase64(B64)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isPlausibleBase64('')).toBe(false);
  });

  it('rejects a length that is not a multiple of four', () => {
    expect(isPlausibleBase64('AAA')).toBe(false);
  });

  it('rejects characters outside the base64 alphabet', () => {
    expect(isPlausibleBase64('AA!A')).toBe(false);
  });

  it('rejects payloads beyond the cap', () => {
    expect(isPlausibleBase64('A'.repeat(4_500_004))).toBe(false);
  });
});

describe('endpoint: validation (no upstream calls)', () => {
  it('rejects a missing design_hash', async () => {
    const { calls } = mockUpstream();
    const res = await handler(post({ image_base64: B64, city_name: 'Lisbon' }));
    expect(res.status).toBe(400);
    expect(calls.printify).toBe(0);
  });

  it.each([
    ['script injection', '<script>alert(1)</script>'],
    ['a very long name', 'x'.repeat(200)],
    ['a NUL byte', 'Lis\u0000bon'],
    ['a newline', 'Lis\u000abon'],
    ['a leading dash', '-Lisbon'],
    ['empty', ''],
  ])('rejects %s in city_name', async (_label, city_name) => {
    const { calls } = mockUpstream();
    const res = await handler(post({ ...validBody, city_name }));
    expect(res.status).toBe(400);
    expect(calls.printify).toBe(0);
  });

  it('rejects an image that is not valid base64', async () => {
    const { calls } = mockUpstream();
    const res = await handler(post({ ...validBody, image_base64: 'not base64!!' }));
    expect(res.status).toBe(400);
    expect(calls.printify).toBe(0);
  });

  it('rejects malformed JSON', async () => {
    mockUpstream();
    const res = await handler(post('{not json'));
    expect(res.status).toBe(400);
  });

  it('rejects a non-POST method', async () => {
    mockUpstream();
    const res = await handler(
      new Request('https://citylines.test/api/create-printify', { method: 'GET' }),
    );
    expect(res.status).toBe(405);
  });
});

describe('endpoint: request body cap', () => {
  it('rejects an oversized body with 413 and never calls Printify', async () => {
    const { calls } = mockUpstream();
    const res = await handler(
      post({ ...validBody, image_base64: 'A'.repeat(6_000_001) }),
    );
    expect(res.status).toBe(413);
    expect(calls.printify).toBe(0);
    expect(calls.redis).toBe(0);
  });
});

describe('endpoint: rate limiting happens before any Printify call', () => {
  it('returns 429 and makes zero Printify requests when the per-IP tier is exceeded', async () => {
    const { calls } = mockUpstream({ ipCount: 31, globalCount: 1 });
    const res = await handler(post(validBody));
    expect(res.status).toBe(429);
    expect(calls.printify).toBe(0);
    expect(calls.redis).toBeGreaterThan(0);
  });

  it('returns 429 when the global tier is exceeded even for a fresh IP', async () => {
    const { calls } = mockUpstream({ ipCount: 1, globalCount: 301 });
    const res = await handler(post(validBody, {}, '198.51.100.99'));
    expect(res.status).toBe(429);
    expect(calls.printify).toBe(0);
  });

  it('sets Retry-After when limiting', async () => {
    mockUpstream({ ipCount: 31, globalCount: 1 });
    const res = await handler(post(validBody));
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('fails closed when the rate limit store is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { calls } = mockUpstream();
    const res = await handler(post(validBody));
    expect(res.status).toBe(503);
    expect(calls.printify).toBe(0);
  });
});

describe('endpoint: dedupe', () => {
  it('returns an existing storefront URL without creating a product', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('mock-redis.test')) {
        return new Response(JSON.stringify([1, 'OK', 1, 'OK']), { status: 200 });
      }
      if (url.includes('/products.json')) {
        return new Response(
          JSON.stringify({
            last_page: 1,
            data: [
              {
                id: '6a21115ff75ca55a1a00c27f',
                title: 'Lisbon — City Lines Art Poster',
                blueprint_id: 282,
                tags: ['cl-a1b2c3d4e5'],
                external: { id: '29074930', handle: 'https://citylines-art.printify.me/product/29074930' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await handler(post(validBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { product_url: string; reused: boolean };
    // Must be the numeric storefront URL, never the ObjectId.
    expect(data.product_url).toBe('https://citylines-art.printify.me/product/29074930');
    expect(data.product_url).not.toContain('6a21115ff75ca55a1a00c27f');
    expect(data.reused).toBe(true);
  });

  it('ignores an external.handle pointing at another host', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('mock-redis.test')) {
        return new Response(JSON.stringify([1, 'OK', 1, 'OK']), { status: 200 });
      }
      if (url.includes('/products.json')) {
        return new Response(
          JSON.stringify({
            last_page: 1,
            data: [
              {
                id: '6a21115ff75ca55a1a00c27f',
                blueprint_id: 282,
                // Distinct tag from the test above so the in-module memo cannot leak between them.
                tags: ['cl-ffff000011'],
                external: { id: '1', handle: 'https://evil.example.com/product/1' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/products/6a21115ff75ca55a1a00c27f.json')) {
        return new Response(
          JSON.stringify({ id: '6a21115ff75ca55a1a00c27f', external: { handle: 'https://evil.example.com/x' } }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await handler(post({ ...validBody, design_hash: 'ffff000011' }));
    // Falls through to "pending" rather than handing over a foreign URL.
    expect(res.status).toBe(202);
  });
});

describe('endpoint: miss results are never cached', () => {
  /** Full happy-path upstream. `page=` marks the product *list*; bare products.json is the create call. */
  const makeUpstream = (opts: {
    listCalls: () => number;
    uploadFails?: () => boolean;
  }) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const productId = '6a21115ff75ca55a1a00c27f';
      const ok = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

      if (url.includes('mock-redis.test')) return ok([1, 'OK', 1, 'OK']);
      if (url.includes('/uploads/images.json')) {
        return opts.uploadFails?.() ? new Response('{}', { status: 500 }) : ok({ id: 'img1' });
      }
      if (url.includes('/print_providers.json')) return ok([{ id: 2 }]);
      if (url.includes('/variants.json')) {
        return ok({
          variants: [
            { id: 101120, title: '16″ x 16″ / Matte' },
            { id: 101121, title: '20″ x 20″ / Matte' },
            { id: 101140, title: '24″ x 24″ / Matte' },
          ],
        });
      }
      if (url.includes('/publish.json')) return ok({});
      if (url.includes(`/${productId}.json`)) {
        return ok({
          id: productId,
          external: { id: '29074930', handle: 'https://citylines-art.printify.me/product/29074930' },
        });
      }
      // Bare create endpoint must be matched before the paginated list.
      if (url.includes('/products.json') && !url.includes('page=')) {
        return ok({ id: productId, title: 'Lisbon — City Lines Art Poster' });
      }
      if (url.includes('/products.json')) {
        opts.listCalls();
        return ok({ last_page: 1, data: [] }); // never finds a match
      }
      return ok({});
    });

  it('re-scans the shop after a failed attempt, so a retry cannot create a duplicate product', async () => {
    let listCalls = 0;
    let uploadFails = true;
    vi.stubGlobal(
      'fetch',
      makeUpstream({ listCalls: () => listCalls++, uploadFails: () => uploadFails }),
    );

    // First attempt fails before anything is created, so no positive cache entry exists.
    const first = await handler(post({ ...validBody, design_hash: 'aaaabbbb11' }));
    expect(first.status).toBe(500);
    expect(listCalls).toBe(1);

    // The miss must NOT have been cached: the retry has to consult the shop again.
    uploadFails = false;
    const second = await handler(post({ ...validBody, design_hash: 'aaaabbbb11' }));
    expect(second.status).toBe(200);
    expect(listCalls).toBe(2);
  });

  it('serves an immediate repeat from the positive cache without re-scanning', async () => {
    let listCalls = 0;
    vi.stubGlobal('fetch', makeUpstream({ listCalls: () => listCalls++ }));

    const first = await handler(post({ ...validBody, design_hash: 'ccccdddd22' }));
    expect(first.status).toBe(200);
    expect(listCalls).toBe(1);

    // The successful create warms the cache, so this costs no Printify call at all.
    const second = await handler(post({ ...validBody, design_hash: 'ccccdddd22' }));
    expect(second.status).toBe(200);
    const data = (await second.json()) as { reused?: boolean };
    expect(data.reused).toBe(true);
    expect(listCalls).toBe(1);
  });
});
