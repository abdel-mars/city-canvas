/**
 * Shared Printify + Upstash helpers.
 *
 * The leading underscore is load-bearing. Vercel turns every `api/*.ts` file into its own
 * serverless entrypoint and, under this project's ESM output, does NOT bundle sibling files — so
 * two routes importing each other fail at runtime with ERR_MODULE_NOT_FOUND. Files prefixed with
 * `_` are not turned into routes, so this one is emitted as a plain module both can import.
 *
 * Do not add a default export here; that is what would make it look like a handler.
 */

const PRINTIFY_BASE = 'https://api.printify.com/v1';
const USER_AGENT = 'city-lines-app';

// Blueprint 282 = "Matte Vertical Posters". The artwork is 1:1, so only square sizes are offered.
export const POSTER_BLUEPRINT_ID = 282;
export const PREFERRED_SQUARE_INCHES = [16, 20, 24];
const LARGE_SQUARE_INCHES = [28];

// Fallback costs (cents) for blueprint 282, used only when the shop has no product to learn from.
// Verified against the live catalog; refresh whenever the catalogue is re-checked.
export const FALLBACK_COST_CENTS: Record<number, number> = {
  10: 786, 12: 895, 14: 1396, 16: 1187, 18: 1187, 20: 1314, 23: 1481, 24: 1481, 28: 3060,
};
// Used when a size is unknown entirely. Deliberately high so we never sell below cost.
const ASSUMED_COST_CENTS = 3060;

const MIN_PRICE_CENTS = 1999;
const PRICE_MULTIPLIER = 2.2;

const IP_RE = /^[0-9a-f:.]{3,45}$/i;

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

export type Variant = { id: number; title: string };
export type ProductVariant = { id: number; cost?: number };

export type PrintifyProduct = {
  id: string;
  /** Present on API responses; never read, and absent on synthesised cache entries. */
  title?: string;
  blueprint_id?: number;
  tags?: string[];
  is_deleted?: boolean;
  external?: { id?: string; handle?: string };
  variants?: ProductVariant[];
};

export type ResolvedVariant = { id: number; title: string; cost: number };

export interface Env {
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

export function readEnv(): Env {
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

/**
 * The shop's display currency.
 *
 * The public API exposes no shop-currency field, and nothing in the storefront pins one, so it is
 * an explicit setting. The live Pop-Up Store renders `$`, hence the default. Override with
 * `PRINTIFY_CURRENCY` rather than editing the default, and note that a wrong value would show a
 * price the checkout disagrees with.
 */
export function shopCurrency(): string {
  const raw = (process.env.PRINTIFY_CURRENCY ?? 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : 'USD';
}

export async function printifyFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
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
export function storeConfigured(env: Env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * One Redis round trip over HTTP, returning the unwrapped values.
 *
 * Two Upstash traps, both learned the hard way in api/geo.ts and pinned here with tests:
 *  - a failed command still returns HTTP 200, with the error inside the body; and
 *  - every value arrives wrapped as `{ result }`, never bare.
 *
 * So `Number(results[i])` on a raw element yields NaN, and a `count > limit` check against NaN is
 * always false — which silently disables the limiter rather than failing loudly.
 */
export async function redisPipeline(
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

/** INCR + EXPIRE for several keys in one round trip. Returns the new counts. */
export async function bumpMany(
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

export function header(headers: ApiRequest['headers'], name: string): string | null {
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

/** Square poster variants plus the print provider Printify requires on product creation. */
export async function resolveSquareVariants(
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

/**
 * Real per-variant costs for every square poster in the shop. Read-only — creates nothing.
 *
 * Deliberately not folded into create-printify's own scan: that memo is keyed on a design tag and
 * doubles as the dedupe cache, which is meaningless to the public pricing endpoint. Both walk the
 * same pages in the same order, which is what makes the displayed price and the created price agree.
 */
export async function harvestSquareCosts(env: Env): Promise<Map<number, number>> {
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
