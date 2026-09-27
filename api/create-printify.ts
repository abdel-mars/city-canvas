/**
 * The purchase endpoint.
 *
 * Everything shared with api/printify-pricing.ts lives in ./_printify-shared, because Vercel emits
 * each api/*.ts as its own ESM entrypoint and does not bundle siblings — importing another route
 * would fail at runtime with ERR_MODULE_NOT_FOUND. The re-exports below keep the existing tests
 * importing from this path.
 */
import {
  POSTER_BLUEPRINT_ID,
  bumpMany,
  clientIp,
  header,
  priceFor,
  printifyFetch,
  readEnv,
  resolveSquareVariants,
  shopCurrency,
  squareInches,
  storeConfigured,
  type ApiRequest,
  type ApiResponse,
  type Env,
  type PrintifyProduct,
  type ResolvedVariant,
} from './_printify-shared';

export { clientIp, priceFor, squareInches, storeConfigured } from './_printify-shared';
export type { ApiRequest, ApiResponse, Env } from './_printify-shared';

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
const HASH_RE = /^[a-f0-9]{8,16}$/;

const MEMO_TTL_MS = 30_000;
const MEMO_MAX = 50;

const HOUR = 3600;
const DAY = 86400;

type ScanResult = { match: PrintifyProduct | null; costByVariantId: Map<number, number> };

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
  const env: Env = readEnv();

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
    // The authoritative prices, computed from the same harvested costs as the listing itself, so
    // the gift page can correct its estimate instead of showing a figure Printify won't charge.
    send(
      env,
      req,
      res,
      {
        product_url: handle,
        product_id: handle.split('/').pop(),
        currency: shopCurrency(),
        variants: variants.map((v) => ({
          id: v.id,
          title: v.title,
          inches: squareInches(v.title) ?? 0,
          priceCents: priceFor(v.cost),
        })),
      },
      200,
    );
  } catch (err) {
    console.error('create-printify failed:', err instanceof Error ? err.message : err);
    send(env, req, res, { error: 'Could not prepare your print. Please try again.' }, 500);
  }
}
