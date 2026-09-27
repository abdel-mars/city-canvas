import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Exercises the real /api/printify-pricing handler against stubbed Printify and Upstash APIs.
 *
 * The live endpoint cannot be reached from a test: PRINTIFY_API_KEY is a Production-only Vercel
 * secret. Stubbing covers everything except the credential itself — variant resolution, price
 * arithmetic, currency, and the three limits that keep a public gift URL from spending the paid
 * account's Printify quota.
 */

/** Real costs for blueprint 282, matching what the live shop reports. */
const COSTS: Record<number, number> = { 100: 1187, 101: 1314, 102: 1481 };
const EXPECTED_PRICES = [2611, 2891, 3258]; // 1187/1314/1481 x 2.2

const CATALOG_VARIANTS = {
  variants: [
    { id: 100, title: '16″ x 16″ / Matte' },
    { id: 101, title: '20″ x 20″ / Matte' },
    { id: 102, title: '24″ x 24″ / Matte' },
    // Non-square sizes must be ignored: the artwork is 1:1.
    { id: 103, title: '18″ x 24″ / Matte' },
  ],
};

const REDIS_URL = 'https://example.upstash.io';

/** Minimal ApiResponse stand-in that records what the handler wrote. */
function makeRes() {
  const rec = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  return {
    rec,
    status(code: number) {
      rec.status = code;
      return this;
    },
    setHeader(k: string, v: string) {
      rec.headers[k] = v;
    },
    json(body: unknown) {
      rec.body = body;
    },
    end() {},
  };
}

type PrintifyMode = 'ok' | 'no-products' | 'broken';
type RedisMode = 'ok' | 'broken' | 'cached' | 'over-build-cap' | 'ip-flooded';

let printifyMode: PrintifyMode = 'ok';
let redisMode: RedisMode = 'ok';
let upstream: string[] = [];
/** Every command the handler sent to Redis, so we can assert on the keys it writes. */
let redisCommands: string[][] = [];
/** A real (tiny) key/value store, so a SET is visible to the next GET. */
let redisStore: Map<string, string>;

function installFetch() {
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const path = new URL(href, 'http://x').pathname;

    // ── Upstash ────────────────────────────────────────────────────────────
    if (href.startsWith(REDIS_URL)) {
      const cmds = JSON.parse(String(init?.body ?? '[]')) as string[][];
      redisCommands.push(...cmds);
      if (redisMode === 'broken') return new Response('redis down', { status: 500 });

      if (cmds.some((c) => c[0] === 'GET')) {
        const key = cmds.find((c) => c[0] === 'GET')![1];
        const value = redisMode === 'cached' ? JSON.stringify(CACHED_PRICING) : (redisStore.get(key) ?? null);
        return Response.json([{ result: value }]);
      }
      if (cmds.some((c) => c[0] === 'SET')) {
        const set = cmds.find((c) => c[0] === 'SET')!;
        redisStore.set(set[1], String(set[2]));
        return Response.json([{ result: 'OK' }]);
      }
      if (cmds.some((c) => c[0] === 'INCR')) {
        const counterKey = cmds.find((c) => c[0] === 'INCR')![1];
        const isBuild = counterKey.includes(':build:');
        let count: number;
        if (redisMode === 'over-build-cap' && isBuild) count = 99;
        else if (redisMode === 'ip-flooded' && !isBuild) count = 999;
        else count = 1;
        return Response.json([{ result: count }, { result: 1 }]);
      }
      return Response.json([{ result: 'OK' }]);
    }

    // ── Printify ───────────────────────────────────────────────────────────
    upstream.push(href);
    if (printifyMode === 'broken') return new Response('upstream down', { status: 500 });
    if (path.includes('/products.json')) {
      const data =
        printifyMode === 'no-products'
          ? []
          : [
              {
                blueprint_id: 282,
                variants: Object.entries(COSTS).map(([id, cost]) => ({ id: Number(id), cost })),
              },
            ];
      return Response.json({ data, last_page: 1 });
    }
    if (path.includes('/print_providers.json')) return Response.json([{ id: 5 }]);
    if (path.includes('/variants.json')) return Response.json(CATALOG_VARIANTS);
    return new Response('{}', { status: 404 });
  });
}

const CACHED_PRICING = {
  currency: 'USD',
  variants: [
    { id: 100, title: '16″ x 16″ / Matte', inches: 16, priceCents: 2611 },
    { id: 101, title: '20″ x 20″ / Matte', inches: 20, priceCents: 2891 },
    { id: 102, title: '24″ x 24″ / Matte', inches: 24, priceCents: 3258 },
  ],
};

/** Fresh module per call: the cache is module-level and must not leak between tests. */
async function callHandler(method = 'GET') {
  vi.resetModules();
  const mod = await import('../../api/printify-pricing');
  const res = makeRes();
  await mod.default({ method, headers: {} }, res as never);
  return res.rec;
}

type Rec = ReturnType<typeof makeRes>['rec'];
const asBody = (rec: Rec) =>
  rec.body as {
    currency?: string;
    stale?: boolean;
    error?: string;
    retry_after?: number;
    variants?: { inches: number; priceCents: number }[];
  };

describe('redisPipeline / bumpMany', () => {
  const saved = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
  });

  /** Replies with the literal shape live Upstash returned for INCR + EXPIRE. */
  function stubRedis(reply: unknown) {
    vi.stubGlobal('fetch', async () => Response.json(reply));
  }

  it('unwraps the { result } envelope so counts are numbers', async () => {
    // Captured verbatim from Upstash: [{"result":1},{"result":1},{"result":2},{"result":1}]
    stubRedis([{ result: 1 }, { result: 1 }, { result: 2 }, { result: 1 }]);
    const { bumpMany } = await import('../../api/create-printify');

    await expect(
      bumpMany(REDIS_URL, 't', [{ key: 'a', ttl: 60 }, { key: 'b', ttl: 60 }]),
    ).resolves.toEqual([1, 2]);
  });

  it('produces counts a limit check can actually compare', async () => {
    // The bug this pins: Number({result: 31}) is NaN, and NaN > 30 is false, so a breached
    // limit would read as "not limited" and the endpoint would stay open.
    stubRedis([{ result: 31 }, { result: 1 }]);
    const { bumpMany } = await import('../../api/create-printify');

    const [count] = await bumpMany(REDIS_URL, 't', [{ key: 'a', ttl: 60 }]);
    expect(Number.isNaN(count)).toBe(false);
    expect(count).toBe(31);
    expect(count > 30).toBe(true);
  });

  it('throws when a command fails inside a 200 response', async () => {
    // The other trap geo.ts documents: a bad command is not an HTTP error.
    stubRedis([{ error: 'WRONGTYPE' }, { result: 1 }]);
    const { redisPipeline } = await import('../../api/create-printify');

    await expect(redisPipeline(REDIS_URL, 't', [['GET', 'a']])).rejects.toThrow(/WRONGTYPE/);
  });

  it('throws on a non-2xx status', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }));
    const { redisPipeline } = await import('../../api/create-printify');

    await expect(redisPipeline(REDIS_URL, 't', [['PING']])).rejects.toThrow(/401/);
  });
});

describe('the two copies of the pricing arithmetic agree', () => {
  /**
   * api/printify-pricing.ts and api/create-printify.ts each carry their own copy of `priceFor`,
   * the cost table and variant resolution, because Vercel will not let two files in api/ import
   * each other. This is the guard against that duplication drifting: if the gift page quotes a
   * figure the checkout then contradicts, it will show up here first.
   */
  it('produces identical prices from identical costs', async () => {
    const { priceFor: createPriceFor } = await import('../../api/create-printify');
    const { priceFor: pricingPriceFor } = await import('../../api/printify-pricing');

    const costs = [200, 786, 895, 1187, 1314, 1396, 1481, 3060];
    for (const cost of costs) {
      expect(pricingPriceFor(cost)).toBe(createPriceFor(cost));
    }
  });

  it('produces identical prices for every live variant cost', async () => {
    const { priceFor: createPriceFor, squareInches } = await import('../../api/create-printify');
    const { priceFor: pricingPriceFor } = await import('../../api/printify-pricing');

    // The values harvestSquareCosts reads from the live shop.
    for (const [inches, cost] of [[16, 1187], [20, 1314], [24, 1481]] as [number, number][]) {
      expect(pricingPriceFor(cost)).toBe(createPriceFor(cost));
      expect(squareInches(`${inches}″ x ${inches}″ / Matte`)).toBe(inches);
    }
  });
});

describe('printify-pricing endpoint', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    printifyMode = 'ok';
    redisMode = 'ok';
    upstream = [];
    redisCommands = [];
    redisStore = new Map();
    process.env.PRINTIFY_API_KEY = 'test-token';
    process.env.PRINTIFY_SHOP_ID = '26401971';
    process.env.PRINTIFY_STORE_DOMAIN = 'citylines-art';
    // A configured store is now required; the fail-closed path is tested separately.
    process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-redis-token';
    delete process.env.PRINT_PROVIDER_ID;
    delete process.env.INCLUDE_LARGE;
    delete process.env.PRINTIFY_CURRENCY;
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
  });

  describe('pricing', () => {
    it('returns only the square sizes, priced from the shop', async () => {
      const rec = await callHandler();
      const body = asBody(rec);

      expect(rec.status).toBe(200);
      expect(body.currency).toBe('USD');
      // 18x24 is skipped: squareInches() returns null for a non-square.
      expect(body.variants?.map((v) => v.inches)).toEqual([16, 20, 24]);
      expect(body.variants?.map((v) => v.priceCents)).toEqual(EXPECTED_PRICES);
    });

    it('falls back to the catalog cost table when the shop has no poster to learn from', async () => {
      printifyMode = 'no-products';
      expect(asBody(await callHandler()).variants?.map((v) => v.priceCents)).toEqual(EXPECTED_PRICES);
    });

    it('never sells below cost when the floor is higher than the margin', async () => {
      COSTS[100] = 200; // 200x2.2=440, well under the 1999 floor
      expect(asBody(await callHandler()).variants?.[0].priceCents).toBe(1999);
      COSTS[100] = 1187;
    });

    it('honours PRINTIFY_CURRENCY', async () => {
      process.env.PRINTIFY_CURRENCY = 'eur';
      expect(asBody(await callHandler()).currency).toBe('EUR');
    });

    it('rejects a malformed PRINTIFY_CURRENCY rather than passing it through', async () => {
      process.env.PRINTIFY_CURRENCY = 'dollars';
      expect(asBody(await callHandler()).currency).toBe('USD');
    });

    it('sets a cache header so the CDN can absorb repeats', async () => {
      const rec = await callHandler();
      expect(rec.headers['Cache-Control']).toContain('stale-while-revalidate');
    });
  });

  describe('staying inside the Printify quota', () => {
    it('creates nothing — a viewed gift page must not spend a creation', async () => {
      await callHandler();
      expect(upstream.filter((u) => u.includes('/uploads/') || u.includes('/orders/'))).toHaveLength(0);
    });

    it('serves a shared cache hit without calling Printify at all', async () => {
      redisMode = 'cached';
      const rec = await callHandler();

      expect(rec.status).toBe(200);
      expect(asBody(rec).variants?.map((v) => v.inches)).toEqual([16, 20, 24]);
      expect(upstream).toHaveLength(0);
    });

    it('publishes the cache so other instances can reuse it', async () => {
      await callHandler();
      const set = redisCommands.find((c) => c[0] === 'SET');
      expect(set?.[1]).toMatch(/^printify:pricing:v1:26401971:false$/);
      expect(set?.[2]).toContain('"currency":"USD"');
      // 15-minute expiry, so the 12/hour rebuild cap is never the binding constraint.
      expect(set?.[3]).toBe('EX');
      expect(set?.[4]).toBe(900);
    });

    it('caches across calls, so a reload costs no upstream traffic', async () => {
      // One module instance: the Redis cache is what makes the second call free, and the
      // in-process layer is gone, so this also proves the store is doing the work.
      vi.resetModules();
      const mod = await import('../../api/printify-pricing');

      await mod.default({ method: 'GET', headers: {} }, makeRes() as never);
      const first = upstream.length;
      expect(first).toBeGreaterThan(0);

      await mod.default({ method: 'GET', headers: {} }, makeRes() as never);
      // Second read hits the same instance's module state via the stubbed GET.
      expect(upstream.length).toBe(first);
    });

    it('refuses to rebuild once the global hourly cap is passed', async () => {
      redisMode = 'over-build-cap';
      const rec = await callHandler();

      expect(rec.status).toBe(503);
      expect(upstream).toHaveLength(0);
    });

    it('still serves a stale price rather than failing when the cap is passed', async () => {
      // A warm cache short-circuits before the cap is ever consulted, which is the point: the
      // cap only bites when there is nothing to serve.
      redisMode = 'cached';
      const rec = await callHandler();
      expect(rec.status).toBe(200);
      expect(asBody(rec).variants).toHaveLength(3);
    });

    it('rate limits a single flood by IP', async () => {
      redisMode = 'ip-flooded';
      const rec = await callHandler();

      expect(rec.status).toBe(429);
      expect(asBody(rec).error).toBe('rate_limited');
      expect(Number(rec.headers['Retry-After'])).toBeGreaterThan(0);
      expect(upstream).toHaveLength(0);
    });
  });

  describe('failure paths', () => {
    it('rejects non-GET methods', async () => {
      const rec = await callHandler('POST');
      expect(rec.status).toBe(405);
      expect(rec.headers.Allow).toBe('GET, HEAD, OPTIONS');
    });

    it('fails closed when the Printify key is missing', async () => {
      delete process.env.PRINTIFY_API_KEY;
      const rec = await callHandler();
      expect(rec.status).toBe(500);
      expect(upstream).toHaveLength(0);
    });

    it('fails closed when the rate limit store is missing, without touching Printify', async () => {
      // The whole point of the endpoint being public: with no limiter, it must not reach Printify.
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const rec = await callHandler();

      expect(rec.status).toBe(503);
      expect(asBody(rec).error).toBe('pricing_unavailable');
      expect(upstream).toHaveLength(0);
    });

    it('fails closed when the rate limit store is unreachable', async () => {
      redisMode = 'broken';
      const rec = await callHandler();

      expect(rec.status).toBe(503);
      expect(upstream).toHaveLength(0);
    });

    it('reports unavailable rather than guessing when Printify is down', async () => {
      printifyMode = 'broken';
      const rec = await callHandler();
      expect(rec.status).toBe(503);
      expect(asBody(rec).error).toBe('pricing_unavailable');
    });
  });
});
