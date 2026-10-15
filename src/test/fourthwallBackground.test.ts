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
let collections: { id: string; name: string; offerIds: string[] }[];
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
        const created = { id: `col_${collections.length + 1}`, name: body.name, offerIds: [...(body.offerIds ?? [])] };
        collections.push(created);
        return resp(200, { id: created.id });
      }
      if (method === 'GET' && path.startsWith('/open-api/v1.0/collections?')) {
        return resp(200, { results: collections.map((c) => ({ id: c.id, name: c.name })) });
      }
      if (method === 'GET' && /^\/open-api\/v1\.0\/collections\/[^/]+$/.test(path)) {
        const id = path.split('/').pop();
        const c = collections.find((x) => x.id === id);
        return resp(200, { offerIds: c ? [...c.offerIds] : [] });
      }
      if (method === 'PUT' && path.endsWith('/products')) {
        const id = path.split('/').slice(-2)[0];
        const c = collections.find((x) => x.id === id);
        if (c) c.offerIds = [...(body.offerIds ?? [])];
        return resp(200, {});
      }
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
  collections = [];
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
  it('makes the cross-sell products: city collection gets all, country gets only the poster', async () => {
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
    expect(collections.map((c) => c.name)).toEqual(['Qatown, Qastan', 'Qastan']);
    expect(collections[0].offerIds).toEqual(['p_1', 'p_2', 'p_3', 'p_4']);
    expect(collections[1].offerIds).toEqual(['p_1']);
    expect(store.has(`fw:job:${hash}`)).toBe(false);
    expect(selfChains).toHaveLength(0);
  });

  it('reuses everything on a repeat visit and does no new work', async () => {
    const hash = 'dd44ee55';
    store.set(`fw:design:image:${hash}`, 'img_1');
    await handler(post(hash, 'Qaville', 'Qadia'), makeRes().res);
    await drainBackground();
    const afterFirst = productPosts.length;

    const { res, rec } = makeRes();
    await handler(post(hash, 'Qaville', 'Qadia'), res);
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
    await handler(post(hash, 'Qaburg', 'Qaland'), res);
    await drainBackground();

    expect(productPosts.map((p) => p.productTemplateId)).toEqual([expect.any(String), STICKER_TEMPLATE]);
    expect(collections).toHaveLength(0);
    expect(store.has(`fw:job:${hash}`)).toBe(true);
    expect(selfChains).toHaveLength(1);
    expect(selfChains[0]).toContain(`hash=${hash}`);
  });

  it('adds only the new poster to a country collection that already exists', async () => {
    collections.push({ id: 'col_old', name: 'Qarealm', offerIds: ['p_old'] });
    const hash = 'c0ffee12';
    store.set(`fw:design:image:${hash}`, 'img_1');
    await handler(post(hash, 'Qacity', 'Qarealm'), makeRes().res);
    await drainBackground();

    const country = collections.find((c) => c.name === 'Qarealm')!;
    expect(country.offerIds).toEqual(['p_old', 'p_1']);
    const city = collections.find((c) => c.name === 'Qacity, Qarealm')!;
    expect(city.offerIds).toEqual(['p_1', 'p_2', 'p_3', 'p_4']);
  });
});
