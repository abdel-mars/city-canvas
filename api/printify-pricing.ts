/**
 * Read-only poster pricing for the gift page.
 *
 * ── Why this file duplicates helpers from api/create-printify.ts ─────────────
 * Every file in api/ must be completely self-contained. Vercel compiles each one to its own ESM
 * entrypoint and neither bundles nor traces sibling imports, so `import … from './create-printify'`
 * survives into the output as an unresolved specifier and the function dies at cold start with
 * ERR_MODULE_NOT_FOUND. An `api/package.json` with `"type": "commonjs"` does NOT fix this — it only
 * changes how Node reads the file, turning the same problem into "Cannot use import statement
 * outside a module". Please do not extract a shared module; that has been tried and it broke all
 * three endpoints in production.
 *
 * The duplication is a platform constraint, not laziness. The risk is that the two copies of the
 * pricing arithmetic drift and the gift page quotes a price the checkout contradicts, so
 * `src/test/pricingEndpoint.test.ts` asserts both implementations return identical figures.
 *
 * Creates nothing. A gift link is public and may be opened by anyone at any time, so charging a
 * Printify product creation against a page merely being *viewed* would burn the anonymous budget
 * the create endpoint protects (5 creations/hour/IP) for people who never intended to buy. The
 * purchase path stays a deliberate click on the gift page.
 *
 * That makes this a public door onto the paid Printify account, so it is bounded three ways: a
 * shared Redis cache every lambda reads, a cap on rebuilds against Printify, and a per-IP limit.
 * All three live in Redis rather than process memory precisely because a cold start is the
 * expensive case. With no rate limit store it fails closed, matching create-printify: the gift page
 * degrades to placeholder prices, but the paid account is never left reachable.
 */

const PRINTIFY_BASE = 'https://api.printify.com/v1';
const USER_AGENT = 'city-lines-app';

// Blueprint 282 = "Matte Vertical Posters". The artwork is 1:1, so only square sizes are offered.
const POSTER_BLUEPRINT_ID = 282;
const PREFERRED_SQUARE_INCHES = [16, 20, 24];

// Kept in step with create-printify.ts — see the note at the top of this file.
const FALLBACK_COST_CENTS: Record<number, number> = {
  10: 786, 12: 895, 14: 1396, 16: 1187, 18: 1187, 20: 1314, 23: 1481, 24: 1481, 28: 3060,
};
const ASSUMED_COST_CENTS = 3060;
const MIN_PRICE_CENTS = 1999;
const PRICE_MULTIPLIER = 2.2;

const HOUR = 3600;
const CACHE_TTL_SECONDS = 900; // 15 minutes
/** Rebuilds allowed per hour, globally. ~7 Printify calls each, so ~84/hour at worst. */
const BUILDS_PER_HOUR = 12;
/** Generous for a human reloading a page; exists to blunt a single flood. */
const REQUESTS_PER_HOUR_PER_IP = 120;

const IP_RE = /^[0-9a-f:.]{3,45}$/i;
/** Square-only match. Titles mix the ″, " and ' characters, e.g. `16″ x 16″ / Matte`. */
const SIZE_RE = /^(\d+(?:\.\d+)?)\s*["″'′]?\s*x\s*(\d+(?:\.\d+)?)\s*["″'′]?/i;

// Exported so the tests can prove these two copies have not drifted apart. Named exports are
// harmless here; Vercel only looks at the default.
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

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
}

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

type Variant = { id: number; title: string };
type ProductVariant = { id: number; cost?: number };
type ResolvedVariant = { id: number; title: string; cost: number };
type PrintifyProduct = {
  id: string;
  blueprint_id?: number;
  tags?: string[];
  is_deleted?: boolean;
  external?: { id?: string; handle?: string };
  variants?: ProductVariant[];
};

type PricingVariant = { id: number; title: string; inches: number; priceCents: number };
type Pricing = { currency: string; variants: PricingVariant[] };

// ── Helpers (mirrored from create-printify.ts) ────────────────────────────────

function readEnv(): Env {
  return {
    PRINTIFY_API_KEY: process.env.PRINTIFY_API_KEY ?? '',
    PRINTIFY_SHOP_ID: process.env.PRINTIFY_SHOP_ID ?? '',
    PRINTIFY_STORE_DOMAIN: process.env.PRINTIFY_STORE_DOMAIN ?? 'citylines-art',
    APP_ORIGIN: process.env.APP_ORIGIN ?? '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    PRINT_PROVIDER_ID: process.env.PRINT_PROVIDER_ID,
    INCLUDE_LARGE: process.env.INCLUDE_LARGE,
  };
}

/** The storefront renders `$`, and the public API exposes no shop-currency field. */
function shopCurrency(): string {
  const raw = (process.env.PRINTIFY_CURRENCY ?? 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : 'USD';
}

async function printifyFetch<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${env.PRINTIFY_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Printify ${path} -> [${res.status}]: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function storeConfigured(env: Env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * One Redis round trip over HTTP, returning the unwrapped values.
 *
 * Two Upstash traps, both documented in api/geo.ts and pinned by tests: a failed command still
 * returns HTTP 200 with the error inside the body, and every value arrives wrapped as `{ result }`.
 * So `Number(results[i])` on a raw element is NaN, and `count > limit` against NaN is always false —
 * which silently disables a limiter instead of failing loudly.
 */
async function redisPipeline(
  url: string,
  token: string,
  commands: (string | number)[][],
): Promise<unknown[]> {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`rate limit store -> [${res.status}]`);

  const parsed = (await res.json()) as unknown;
  if (!Array.isArray(parsed)) throw new Error('rate limit store -> malformed response');

  return parsed.map((entry, i) => {
    if (entry === null || typeof entry !== 'object') return entry;
    const record = entry as { result?: unknown; error?: unknown };
    if (record.error !== undefined && record.error !== null) {
      throw new Error(`rate limit store -> command ${i} failed: ${String(record.error)}`);
    }
    return 'result' in record ? record.result : entry;
  });
}

async function bumpMany(
  url: string,
  token: string,
  entries: { key: string; ttl: number }[],
): Promise<number[]> {
  const results = await redisPipeline(
    url,
    token,
    entries.flatMap((e) => [['INCR', e.key], ['EXPIRE', e.key, e.ttl]]),
  );
  const counts: number[] = [];
  for (let i = 0; i < results.length; i += 2) counts.push(Number(results[i]));
  return counts;
}

function header(headers: ApiRequest['headers'], name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Only the RIGHTMOST forwarded entry is Vercel's; everything left of it is client-supplied. */
function clientIp(headers: ApiRequest['headers']): string {
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

/** Real per-variant costs for every square poster in the shop. Read-only — creates nothing. */
async function harvestSquareCosts(env: Env): Promise<Map<number, number>> {
  const costByVariantId = new Map<number, number>();
  let page = 1;
  for (let i = 0; i < 5; i++) {
    const body = await printifyFetch<{ data?: PrintifyProduct[]; last_page?: number }>(
      env,
      `/shops/${env.PRINTIFY_SHOP_ID}/products.json?limit=50&page=${page}`,
    );
    for (const p of body.data ?? []) {
      if (p.blueprint_id !== POSTER_BLUEPRINT_ID) continue;
      for (const v of p.variants ?? []) {
        if (typeof v.cost === 'number' && !costByVariantId.has(v.id)) costByVariantId.set(v.id, v.cost);
      }
    }
    if (!body.last_page || page >= body.last_page) break;
    page++;
  }
  return costByVariantId;
}

async function resolveSquareVariants(
  env: Env,
  costByVariantId: Map<number, number>,
): Promise<ResolvedVariant[]> {
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

  const variants: ResolvedVariant[] = [];
  for (const inches of PREFERRED_SQUARE_INCHES) {
    const v = bySize.get(inches);
    if (!v) continue;
    const cost = costByVariantId.get(v.id) ?? FALLBACK_COST_CENTS[inches] ?? ASSUMED_COST_CENTS;
    variants.push({ id: v.id, title: v.title, cost });
  }
  if (variants.length === 0) throw new Error('no square poster variants found in the catalog');
  return variants;
}

// ── Cache plumbing ───────────────────────────────────────────────────────────

const cacheKey = (env: Env) =>
  `printify:pricing:v1:${env.PRINTIFY_SHOP_ID}:${env.INCLUDE_LARGE === 'true'}`;
const buildKey = () => `printify:pricing:build:${new Date().toISOString().slice(0, 13)}`;
const ipKey = (ip: string) =>
  `printify:pricing:rl:h:${ip}:${new Date().toISOString().slice(0, 13)}`;

const secondsIntoHour = () => HOUR - (Date.now() % (HOUR * 1000)) / 1000;

async function readCache(env: Env): Promise<Pricing | null> {
  const [hit] = await redisPipeline(env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!, [
    ['GET', cacheKey(env)],
  ]);
  if (typeof hit !== 'string') return null;
  try {
    const parsed = JSON.parse(hit) as Pricing;
    return Array.isArray(parsed.variants) && parsed.variants.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(env: Env, value: Pricing): Promise<void> {
  await redisPipeline(env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!, [
    ['SET', cacheKey(env), JSON.stringify(value), 'EX', CACHE_TTL_SECONDS],
  ]);
}

async function buildPricing(env: Env): Promise<Pricing> {
  const costs = await harvestSquareCosts(env);
  const variants = await resolveSquareVariants(env, costs);
  return {
    currency: shopCurrency(),
    variants: variants.map((v) => ({
      id: v.id,
      title: v.title,
      inches: squareInches(v.title) ?? 0,
      priceCents: priceFor(v.cost),
    })),
  };
}

function json(
  res: ApiResponse,
  body: unknown,
  status: number,
  extra?: Record<string, string>,
): void {
  for (const [k, v] of Object.entries(extra ?? {})) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.status(status).json(body);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env: Env = readEnv();

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, { error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
    return;
  }
  if (!env.PRINTIFY_API_KEY || !env.PRINTIFY_SHOP_ID) {
    json(res, { error: 'pricing_unavailable' }, 500);
    return;
  }
  if (!storeConfigured(env)) {
    console.error('rate limit store not configured; refusing to touch Printify');
    json(res, { error: 'pricing_unavailable' }, 503);
    return;
  }

  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const ip = clientIp(req.headers);

  let cached: Pricing | null = null;
  try {
    cached = await readCache(env);
  } catch (err) {
    console.error('pricing cache read failed:', err instanceof Error ? err.message : err);
  }
  if (cached) return json(res, { ...cached, stale: false }, 200);

  try {
    const [requests] = await bumpMany(url, token, [{ key: ipKey(ip), ttl: HOUR * 2 }]);
    if (requests > REQUESTS_PER_HOUR_PER_IP) {
      const retry = Math.ceil(secondsIntoHour());
      json(res, { error: 'rate_limited', retry_after: retry }, 429, { 'Retry-After': String(retry) });
      return;
    }
  } catch (err) {
    console.error('pricing rate limit unavailable:', err instanceof Error ? err.message : err);
    json(res, { error: 'pricing_unavailable' }, 503);
    return;
  }

  try {
    const [builds] = await bumpMany(url, token, [{ key: buildKey(), ttl: HOUR * 2 }]);
    if (builds > BUILDS_PER_HOUR) {
      console.warn(`pricing rebuild cap reached (${builds}/${BUILDS_PER_HOUR}); serving 503`);
      json(res, { error: 'pricing_unavailable' }, 503);
      return;
    }
    const pricing = await buildPricing(env);
    await writeCache(env, pricing);
    json(res, { ...pricing, stale: false }, 200);
  } catch (err) {
    console.error('printify-pricing failed:', err instanceof Error ? err.message : err);
    try {
      const recovered = await readCache(env);
      if (recovered) return json(res, { ...recovered, stale: true }, 200);
    } catch {
      /* fall through */
    }
    json(res, { error: 'pricing_unavailable' }, 503);
  }
}
