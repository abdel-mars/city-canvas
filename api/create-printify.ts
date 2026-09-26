const PRINTIFY_BASE = 'https://api.printify.com/v1';
const USER_AGENT = 'city-lines-app';

// Blueprint 282 = "Matte Vertical Posters". The artwork is 1:1, so only square sizes are offered.
const POSTER_BLUEPRINT_ID = 282;
const PREFERRED_SQUARE_INCHES = [16, 20, 24];
const LARGE_SQUARE_INCHES = [28];

// Fallback costs (cents) for blueprint 282, used only when the shop has no product to learn from.
// Verified against the live catalog; refresh whenever the catalogue is re-checked.
const FALLBACK_COST_CENTS: Record<number, number> = {
  10: 786, 12: 895, 14: 1396, 16: 1187, 18: 1187, 20: 1314, 23: 1481, 24: 1481, 28: 3060,
};
// Used when a size is unknown entirely. Deliberately high so we never sell below cost.
const ASSUMED_COST_CENTS = 3060;

const MIN_PRICE_CENTS = 1999;
const PRICE_MULTIPLIER = 2.2;

// The storefront URL must come from product.external.handle.
// product.id is a Mongo ObjectId; the Pop-Up Store needs the numeric id in external.id.
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 10;

// Real payloads measure ~0.41 MB of base64. Vercel rejects bodies over 4.5 MB at the platform
// level, so this sits below that to keep the check ours and the limit honest.
const MAX_BODY_BYTES = 4_000_000;
const MAX_BASE64_CHARS = 4_000_000;

/**
 * Tiered limits. Tier 1 caps how much Printify traffic we can generate at all; tier 4 caps how
 * much money we can spend. A repeat click for the same design is served from the dedupe cache and
 * is deliberately charged to neither.
 */
const LIMITS = {
  requestsPerHourPerIp: 30,
  requestsPerHourGlobal: 300,
  createsPerHourPerIp: 5,
  createsPerDayPerIp: 30,
  createsPerDayGlobal: 200,
};

const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const IP_RE = /^[0-9a-f:.]{3,45}$/i;
const HASH_RE = /^[a-f0-9]{8,16}$/;

const MEMO_TTL_MS = 30_000;
const MEMO_MAX = 50;

const HOUR = 3600;
const DAY = 86400;

/** Minimal structural types for Vercel's Node runtime, avoiding an extra dependency. */
export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
}

type Variant = { id: number; title: string };
type ProductVariant = { id: number; cost?: number };

type PrintifyProduct = {
  id: string;
  /** Present on API responses; never read, and absent on synthesised cache entries. */
  title?: string;
  blueprint_id?: number;
  tags?: string[];
  is_deleted?: boolean;
  external?: { id?: string; handle?: string };
  variants?: ProductVariant[];
};

type ScanResult = { match: PrintifyProduct | null; costByVariantId: Map<number, number> };
type ResolvedVariant = { id: number; title: string; cost: number };

interface Env {
  PRINTIFY_API_KEY: string;
  PRINTIFY_SHOP_ID: string;
  PRINTIFY_STORE_DOMAIN: string;
  APP_ORIGIN: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  PRINT_PROVIDER_ID?: string;
  INCLUDE_LARGE?: string;
}

/** Square-only match. Titles mix the ″, " and ' characters, e.g. `16″ x 16″ / Matte`. */
const SIZE_RE = /^(\d+(?:\.\d+)?)\s*["″'′]?\s*x\s*(\d+(?:\.\d+)?)\s*["″'′]?/i;

export function squareInches(title: string): number | null {
  const m = SIZE_RE.exec(title ?? '');
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return Number.isFinite(w) && Number.isFinite(h) && w === h ? w : null;
}

export function priceFor(cost: number): number {
  return Math.max(MIN_PRICE_CENTS, Math.round(cost * PRICE_MULTIPLIER));
}

function header(headers: ApiRequest['headers'], name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Resolve the caller's address for rate limiting.
 *
 * Vercel appends the address it actually observed to `x-forwarded-for`, so only the RIGHTMOST
 * entry is trustworthy — everything to its left is client-supplied. Using the leftmost entry
 * would let anyone mint a fresh rate-limit bucket with a single header.
 */
export function clientIp(headers: ApiRequest['headers']): string {
  const rightmost = (raw: string | null): string | null => {
    if (!raw) return null;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const value = parts[parts.length - 1];
    return IP_RE.test(value) ? value : null;
  };

  return (
    rightmost(header(headers, 'x-vercel-forwarded-for')) ??
    rightmost(header(headers, 'x-forwarded-for')) ??
    rightmost(header(headers, 'x-real-ip')) ??
    'unknown'
  );
}

export function isPlausibleBase64(value: string): boolean {
  if (!value) return false;
  if (value.length > MAX_BASE64_CHARS || value.length % 4 !== 0) return false;
  // Sampled rather than matched whole, to keep the check cheap on multi-MB strings.
  return B64_RE.test(value.slice(0, 256)) && B64_RE.test(value.slice(-256));
}

/** Only ever hand the client a URL on our own storefront. */
function handleForStore(env: Env, product: PrintifyProduct | null): string | null {
  const handle = product?.external?.handle;
  if (!handle) return null;
  if (!handle.startsWith(`https://${env.PRINTIFY_STORE_DOMAIN}.printify.me/`)) {
    console.warn('ignoring external.handle on unexpected host:', handle.slice(0, 80));
    return null;
  }
  return handle;
}

function corsHeaders(env: Env, req: ApiRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (env.APP_ORIGIN) {
    // Same-origin browser calls ignore CORS entirely; this only matters for cross-origin use.
    headers['Access-Control-Allow-Origin'] = env.APP_ORIGIN;
  }
  void req;
  return headers;
}

function send(
  env: Env,
  req: ApiRequest,
  res: ApiResponse,
  body: unknown,
  status: number,
  extra?: Record<string, string>,
): void {
  for (const [k, v] of Object.entries({ ...corsHeaders(env, req), ...(extra ?? {}) })) {
    res.setHeader(k, v);
  }
  res.status(status).json(body);
}

function tooMany(env: Env, req: ApiRequest, res: ApiResponse, retryAfter: number) {
  const seconds = Math.max(1, Math.ceil(retryAfter));
  send(env, req, res, { error: 'rate_limited', retry_after: seconds }, 429, {
    'Retry-After': String(seconds),
  });
}

async function printifyFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PRINTIFY_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Printify ${path} -> [${res.status}]: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

/** Missing store config must fail closed rather than leave the paid account unprotected. */
function storeConfigured(env: Env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/** INCR + EXPIRE for several keys in one round trip. Returns the new counts. */
async function bumpMany(
  url: string,
  token: string,
  entries: { key: string; ttl: number }[],
): Promise<number[]> {
  const pipeline = entries.flatMap((e) => [['INCR', e.key], ['EXPIRE', e.key, e.ttl]]);
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline),
  });
  if (!res.ok) throw new Error(`rate limit store -> [${res.status}]`);
  const results = (await res.json()) as unknown[];
  const counts: number[] = [];
  for (let i = 0; i < results.length; i += 2) counts.push(Number(results[i]));
  return counts;
}

function hourKey(prefix: string, ip: string): string {
  return `${prefix}:rl:h:${ip}:${new Date().toISOString().slice(0, 13)}`;
}
function dayKey(prefix: string, ip: string): string {
  return `${prefix}:rl:d:${ip}:${new Date().toISOString().slice(0, 10)}`;
}
function globalHourKey(): string {
  return `printify:rl:g:h:${new Date().toISOString().slice(0, 13)}`;
}
function globalDayKey(): string {
  return `printify:rl:g:d:${new Date().toISOString().slice(0, 10)}`;
}

function secondsIntoHour(): number {
  return HOUR - (Date.now() % (HOUR * 1000)) / 1000;
}
function secondsIntoDay(): number {
  return DAY - (Date.now() % (DAY * 1000)) / 1000;
}

/** Tier 1 — runs before any Printify call, so it bounds Printify traffic. */
async function limitRequests(env: Env, ip: string): Promise<{ limited: boolean; retryAfter: number }> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const [perIp, global] = await bumpMany(url, token, [
    { key: hourKey('printify', ip), ttl: HOUR * 2 },
    { key: globalHourKey(), ttl: HOUR * 2 },
  ]);
  if (perIp > LIMITS.requestsPerHourPerIp) return { limited: true, retryAfter: secondsIntoHour() };
  if (global > LIMITS.requestsPerHourGlobal) return { limited: true, retryAfter: secondsIntoHour() };
  return { limited: false, retryAfter: 0 };
}

/** Tier 4 — only genuine creations are charged here. */
async function limitCreations(env: Env, ip: string): Promise<{ limited: boolean; retryAfter: number }> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const [perHour, perDay, globalDay] = await bumpMany(url, token, [
    { key: `printify:create:h:${ip}:${new Date().toISOString().slice(0, 13)}`, ttl: HOUR * 2 },
    { key: dayKey('printify:create', ip), ttl: DAY * 2 },
    { key: globalDayKey(), ttl: DAY * 2 },
  ]);
  if (perHour > LIMITS.createsPerHourPerIp) return { limited: true, retryAfter: secondsIntoHour() };
  if (perDay > LIMITS.createsPerDayPerIp) return { limited: true, retryAfter: secondsIntoDay() };
  if (globalDay > LIMITS.createsPerDayGlobal) return { limited: true, retryAfter: secondsIntoDay() };
  return { limited: false, retryAfter: 0 };
}

const memo = new Map<string, { at: number; result: ScanResult }>();

function rememberScan(tag: string, result: ScanResult) {
  if (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(tag, { at: Date.now(), result });
}

/**
 * One pass over the shop's products that does double duty:
 *  - finds an existing listing for this design (dedupe), and
 *  - harvests real per-variant costs, which the catalog endpoint does not expose.
 *
 * Only positive matches are memoised. Caching a miss would let a rapid second request
 * (a double click, or the client's 202 retry) skip the dedupe and create a duplicate
 * product — which is precisely what the retry path is supposed to prevent.
 */
async function scanShop(env: Env, tag: string): Promise<ScanResult> {
  const cached = memo.get(tag);
  if (cached && Date.now() - cached.at < MEMO_TTL_MS) return cached.result;

  const costByVariantId = new Map<number, number>();
  let match: PrintifyProduct | null = null;
  let page = 1;

  for (let i = 0; i < 5; i++) {
    const body = await printifyFetch<{ data?: PrintifyProduct[]; last_page?: number }>(
      env,
      `/shops/${env.PRINTIFY_SHOP_ID}/products.json?limit=50&page=${page}`,
    );
    for (const p of body.data ?? []) {
      if (p.blueprint_id === POSTER_BLUEPRINT_ID) {
        for (const v of p.variants ?? []) {
          if (typeof v.cost === 'number' && !costByVariantId.has(v.id)) costByVariantId.set(v.id, v.cost);
        }
      }
      if (!match && !p.is_deleted && (p.tags ?? []).includes(tag)) match = p;
    }
    if (!body.last_page || page >= body.last_page) break;
    page++;
  }

  const result: ScanResult = { match, costByVariantId };
  if (match) rememberScan(tag, result);
  return result;
}

/** Square poster variants plus the print provider Printify requires on product creation. */
async function resolveSquareVariants(
  env: Env,
  costByVariantId: Map<number, number>,
): Promise<{ providerId: number; variants: ResolvedVariant[] }> {
  const providers = await printifyFetch<{ id: number }[]>(
    env,
    `/catalog/blueprints/${POSTER_BLUEPRINT_ID}/print_providers.json`,
  );
  const providerId = env.PRINT_PROVIDER_ID ? Number(env.PRINT_PROVIDER_ID) : providers[0]?.id;
  if (!providerId) throw new Error('no print provider available for the poster blueprint');

  const res = await printifyFetch<{ variants?: Variant[] }>(
    env,
    `/catalog/blueprints/${POSTER_BLUEPRINT_ID}/print_providers/${providerId}/variants.json`,
  );

  const bySize = new Map<number, Variant>();
  for (const v of Array.isArray(res.variants) ? res.variants : []) {
    const inches = squareInches(v.title);
    if (inches !== null && !bySize.has(inches)) bySize.set(inches, v);
  }

  const wanted =
    env.INCLUDE_LARGE === 'true'
      ? [...PREFERRED_SQUARE_INCHES, ...LARGE_SQUARE_INCHES]
      : PREFERRED_SQUARE_INCHES;

  const variants: ResolvedVariant[] = [];
  for (const inches of wanted) {
    const v = bySize.get(inches);
    if (!v) continue;
    const cost = costByVariantId.get(v.id) ?? FALLBACK_COST_CENTS[inches] ?? ASSUMED_COST_CENTS;
    variants.push({ id: v.id, title: v.title, cost });
  }
  if (variants.length === 0) throw new Error('no square poster variants found in the catalog');
  return { providerId, variants };
}

async function createAndPublish(
  env: Env,
  opts: {
    tag: string;
    title: string;
    description: string;
    imageBase64: string;
    providerId: number;
    variants: ResolvedVariant[];
  },
): Promise<{ productId: string; handle: string | null }> {
  const upload = await printifyFetch<{ id: string }>(env, '/uploads/images.json', {
    method: 'POST',
    body: JSON.stringify({
      file_name: `citylines-${opts.tag.replace(/^cl-/, '')}.png`,
      contents: opts.imageBase64,
    }),
  });

  const created = await printifyFetch<PrintifyProduct>(
    env,
    `/shops/${env.PRINTIFY_SHOP_ID}/products.json`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: opts.title,
        description: opts.description,
        blueprint_id: POSTER_BLUEPRINT_ID,
        print_provider_id: opts.providerId,
        tags: [opts.tag],
        variants: opts.variants.map((v) => ({ id: v.id, price: priceFor(v.cost), is_enabled: true })),
        print_areas: [
          {
            variant_ids: opts.variants.map((v) => v.id),
            placeholders: [
              { position: 'front', images: [{ id: upload.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] },
            ],
          },
        ],
      }),
    },
  );

  try {
    await printifyFetch(env, `/shops/${env.PRINTIFY_SHOP_ID}/products/${created.id}/publish.json`, {
      method: 'POST',
      body: JSON.stringify({
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
        keyFeatures: true,
      }),
    });
  } catch (err) {
    console.warn('publish step failed, will still poll:', err instanceof Error ? err.message : err);
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const product = await printifyFetch<PrintifyProduct>(
      env,
      `/shops/${env.PRINTIFY_SHOP_ID}/products/${created.id}.json`,
    );
    const handle = handleForStore(env, product);
    if (handle) return { productId: created.id, handle };
    if (attempt < POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return { productId: created.id, handle: null };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env: Env = {
    PRINTIFY_API_KEY: process.env.PRINTIFY_API_KEY ?? '',
    PRINTIFY_SHOP_ID: process.env.PRINTIFY_SHOP_ID ?? '',
    PRINTIFY_STORE_DOMAIN: process.env.PRINTIFY_STORE_DOMAIN ?? 'citylines-art',
    APP_ORIGIN: process.env.APP_ORIGIN ?? '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    PRINT_PROVIDER_ID: process.env.PRINT_PROVIDER_ID,
    INCLUDE_LARGE: process.env.INCLUDE_LARGE,
  };

  if (req.method === 'OPTIONS') {
    for (const [k, v] of Object.entries(corsHeaders(env, req))) res.setHeader(k, v);
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    send(env, req, res, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
    return;
  }
  if (!env.PRINTIFY_API_KEY || !env.PRINTIFY_SHOP_ID) {
    send(env, req, res, { error: 'printing_unavailable' }, 500);
    return;
  }

  // ── Tier 0: validate. No Redis, no Printify. ──────────────────────────
  const declared = Number(header(req.headers, 'content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    send(env, req, res, { error: 'payload_too_large' }, 413);
    return;
  }

  let body: { image_base64?: string; city_name?: string; design_hash?: string };
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) {
      send(env, req, res, { error: 'payload_too_large' }, 413);
      return;
    }
    try {
      body = JSON.parse(req.body) as typeof body;
    } catch {
      send(env, req, res, { error: 'invalid_json' }, 400);
      return;
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as typeof body;
  } else {
    send(env, req, res, { error: 'invalid_json' }, 400);
    return;
  }

  if (!body.design_hash || !HASH_RE.test(body.design_hash)) {
    send(env, req, res, { error: 'design_hash is required (8-16 hex chars)' }, 400);
    return;
  }
  // The city name is the only user-supplied text that reaches Printify. It is pattern-checked,
  // then interpolated into a server-built title/description.
  const city = (body.city_name ?? '').trim();
  if (!CITY_RE.test(city)) {
    send(env, req, res, { error: 'city_name is required (letters, numbers and spaces, max 60)' }, 400);
    return;
  }
  if (!body.image_base64 || !isPlausibleBase64(body.image_base64)) {
    send(env, req, res, { error: 'image_base64 is required and must be valid base64' }, 400);
    return;
  }

  // ── Tier 1: coarse limits. Must precede every Printify call. ─────────
  if (!storeConfigured(env)) {
    console.error('rate limit store not configured; refusing to touch Printify');
    send(env, req, res, { error: 'printing_unavailable' }, 503);
    return;
  }
  const ip = clientIp(req.headers);
  try {
    const rl = await limitRequests(env, ip);
    if (rl.limited) return tooMany(env, req, res, rl.retryAfter);
  } catch (err) {
    console.error('rate limiting unavailable:', err instanceof Error ? err.message : err);
    send(env, req, res, { error: 'printing_unavailable' }, 503);
    return;
  }

  const tag = `cl-${body.design_hash}`;

  // ── Tier 2/3: dedupe. A repeat click is served here and is never charged a creation.
  let scan: ScanResult = { match: null, costByVariantId: new Map() };
  try {
    scan = await scanShop(env, tag);
  } catch (err) {
    console.error('shop scan failed:', err instanceof Error ? err.message : err);
  }

  if (scan.match) {
    const known = handleForStore(env, scan.match);
    if (known) {
      send(env, req, res, { product_url: known, product_id: scan.match.external?.id, reused: true }, 200);
      return;
    }
    // An earlier attempt created the product but the storefront never returned a URL.
    const refreshed = await printifyFetch<PrintifyProduct>(
      env,
      `/shops/${env.PRINTIFY_SHOP_ID}/products/${scan.match.id}.json`,
    ).catch(() => null);
    const handle = handleForStore(env, refreshed);
    if (handle) {
      send(env, req, res, { product_url: handle, product_id: refreshed?.external?.id, reused: true }, 200);
      return;
    }
    send(env, req, res, { pending: true }, 202, { 'Retry-After': '3' });
    return;
  }

  // ── Tier 4: creations only.
  try {
    const rl = await limitCreations(env, ip);
    if (rl.limited) return tooMany(env, req, res, rl.retryAfter);
  } catch (err) {
    console.error('rate limiting unavailable:', err instanceof Error ? err.message : err);
    send(env, req, res, { error: 'printing_unavailable' }, 503);
    return;
  }

  // ── Tier 5: create, publish, resolve the storefront URL. ─────────────
  try {
    const { providerId, variants } = await resolveSquareVariants(env, scan.costByVariantId);
    const { productId, handle } = await createAndPublish(env, {
      tag,
      title: `${city} — City Lines Art Poster`,
      description: `A minimal road-network artwork of ${city}, printed on museum-grade matte paper.`,
      imageBase64: body.image_base64,
      providerId,
      variants,
    });

    if (!handle) {
      // Retrying is safe: the tag makes the retry idempotent, so it will only re-poll.
      send(env, req, res, { pending: true }, 202, { 'Retry-After': '3' });
      return;
    }
    // Warm the positive cache so an immediate repeat click costs no Printify call.
    rememberScan(tag, {
      match: { id: productId, external: { handle } },
      costByVariantId: scan.costByVariantId,
    });
    send(env, req, res, { product_url: handle, product_id: handle.split('/').pop() }, 200);
  } catch (err) {
    console.error('create-printify failed:', err instanceof Error ? err.message : err);
    send(env, req, res, { error: 'Could not prepare your print. Please try again.' }, 500);
  }
}
