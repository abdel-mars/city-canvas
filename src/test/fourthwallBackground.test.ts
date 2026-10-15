import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const bgTasks: Promise<unknown>[] = [];
vi.mock('@vercel/functions', () => ({
  waitUntil: (promise: Promise<unknown>) => { bgTasks.push(promise); },
}));

import handler from '../../api/create-fourthwall';
import type { ApiRequest, ApiResponse } from '../../api/create-fourthwall';

const REDIS = 'https://redis.test';
const ORIGIN = 'http://localhost:8080';
const SHOP = 'citylinesart-shop.fourthwall.com';

const STICKER_TEMPLATE = 'pro_358';
const STICKER_SHEET_TEMPLATE = 'pro_6a8bdd4fd14d4cf687';
const MUG_TEMPLATE = 'pro_4v5OfYhyRx62KW5b7Oj6Uw';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let productPosts: { name: string; productTemplateId: string }[];
let collectionPosts: { name: string; offerIds: string[] }[];
let collectionOffers: string[];
let selfChains: string[];
let failStickerSheet: boolean;

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body); },
    async json() { return body; },
  } as unknown as Response;
}

function redisExec(cmds: (string | number)[][]): { result: unknown }[] {
  return cmds.map((cmd) => {
    const op = String(cmd[0]).toUpperCase();
    const key = String(cmd[1]);
    if (op === 'SET') { store.set(key, String(cmd[2])); return { result: 'OK' }; }
    if (op === 'GET') return { result: store.has(key) ? store.get(key)! : null };
    if (op === 'DEL') return { result: store.delete(key) ? 1 : 0 };
    if (op === 'INCR') { const v = Number(store.get(key) ?? 0) + 1; store.set(key, String(v)); return { result: v }; }
    if (op === 'EXPIRE') return { result: 1 };
    return { result: null };
  });
}

function installFetch() {
  globalThis.fetch = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith(REDIS)) return resp(200, redisExec(JSON.parse(init?.body ?? '[]')));

    if (url.startsWith('https://api.fourthwall.com')) {
      const path = url.slice('https://api.fourthwall.com'.length);
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (method === 'POST' && path === '/open-api/v1.0/products') {
        if (failStickerSheet && String(body?.name).includes('Sticker Sheet')) return resp(429, { title: 'rate limited' });
        productPosts.push({ name: body.name, productTemplateId: body.productTemplateId });
        return resp(200, { productId: `p_${productPosts.length}` });
      }
      if (method === 'GET' && /^\/open-api\/v1\.0\/products\/[^/]+$/.test(path)) {
        return resp(200, { slug: `slug${path.split('/').pop()}`, variants: [] });
      }
      if (method === 'GET' && path.startsWith('/open-api/v1.0/products?')) return resp(200, { results: [] });
      if (method === 'POST' && path === '/open-api/v1.0/collections') {
        collectionPosts.push({ name: body.name, offerIds: body.offerIds });
        collectionOffers = [...(body.offerIds ?? [])];
        return resp(200, { id: 'col_1' });
      }
      if (method === 'GET' && path.startsWith('/open-api/v1.0/collections?')) return resp(200, { results: [] });
      if (method === 'GET' && /^\/open-api\/v1\.0\/collections\/[^/]+$/.test(path)) return resp(200, { offerIds: collectionOffers });
      if (method === 'PUT' && path.endsWith('/products')) { collectionOffers = [...(body.offerIds ?? [])]; return resp(200, {}); }
      throw new Error(`unmocked Fourthwall call ${method} ${path}`);
    }

    if (url.startsWith(ORIGIN)) { selfChains.push(url); return resp(202, { ok: true }); }
    throw new Error(`unmocked fetch ${method} ${url}`);
  }) as unknown as typeof fetch;
}

function makeRes() {
  const rec = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) { rec.status = code; return this; },
    setHeader() {},
    json(body: unknown) { rec.body = body; },
    end() {},
  } as unknown as ApiResponse;
  return { rec, res };
}

function post(hash: string, city: string, country: string): ApiRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_base64: 'aGVsbG8=', city_name: city, city_country: country, design_hash: hash, shape: 'square' }),
  };
}

async function drainBackground() { await Promise.all(bgTasks.splice(0)); }

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, {
    FOURTHWALL_API_USERNAME: 'u',
    FOURTHWALL_API_PASSWORD: 'p',
    FOURTHWALL_SHOP_DOMAIN: SHOP,
    UPSTASH_REDIS_REST_URL: REDIS,
    UPSTASH_REDIS_REST_TOKEN: 't',
    APP_ORIGIN: ORIGIN,
    FOURTHWALL_BG_GAP_MS: '0',
  });
  store = new Map();
  productPosts = [];
  collectionPosts = [];
  collectionOffers = [];
  selfChains = [];
  failStickerSheet = false;
  bgTasks.length = 0;
  installFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe('background catalog', () => {
  it('makes the cross-sell products and files them under the country collection', async () => {
    const hash = 'aa11bb22';
    store.set(`fw:design:image:${hash}`, 'img_1');
    const { res, rec } = makeRes();
    await handler(post(hash, 'Qatown', 'Qastan'), res);

    expect(rec.status).toBe(200);
    expect((rec.body as { product_url: string }).product_url).toBe(`https://${SHOP}/products/slugp_1`);
    await drainBackground();

    expect(productPosts.map((p) => p.productTemplateId)).toEqual([
      expect.any(String), STICKER_TEMPLATE, STICKER_SHEET_TEMPLATE, MUG_TEMPLATE,
    ]);
    expect(collectionPosts).toHaveLength(1);
    expect(collectionPosts[0].name).toBe('Qastan');
    expect(collectionPosts[0].offerIds).toEqual(['p_1', 'p_2', 'p_3', 'p_4']);
    expect(store.has(`fw:job:${hash}`)).toBe(false);
    expect(selfChains).toHaveLength(0);
  });

  it('reuses everything on a repeat visit and does no new work', async () => {
    const hash = 'dd44ee55';
    store.set(`fw:design:image:${hash}`, 'img_1');
    await handler(post(hash, 'Qaville', 'Qastan'), makeRes().res);
    await drainBackground();
    const afterFirst = productPosts.length;

    const { res, rec } = makeRes();
    await handler(post(hash, 'Qaville', 'Qastan'), res);
    await drainBackground();

    expect(rec.status).toBe(200);
    expect((rec.body as { reused: boolean }).reused).toBe(true);
    expect(productPosts.length).toBe(afterFirst);
    expect(store.has(`fw:job:${hash}`)).toBe(false);
  });

  it('leaves a rate-limited product queued and hands the rest to a fresh invocation', async () => {
    const hash = 'ff66aa77';
    store.set(`fw:design:image:${hash}`, 'img_1');
    failStickerSheet = true;
    const { res } = makeRes();
    await handler(post(hash, 'Qaburg', 'Qastan'), res);
    await drainBackground();

    expect(productPosts.map((p) => p.productTemplateId)).toEqual([expect.any(String), STICKER_TEMPLATE]);
    expect(collectionPosts).toHaveLength(0);
    expect(store.has(`fw:job:${hash}`)).toBe(true);
    expect(selfChains).toHaveLength(1);
    expect(selfChains[0]).toContain(`hash=${hash}`);
  });
});
