import {
  bumpMany,
  clientIp,
  harvestSquareCosts,
  priceFor,
  readEnv,
  redisPipeline,
  resolveSquareVariants,
  shopCurrency,
  squareInches,
  storeConfigured,
  type ApiRequest,
  type ApiResponse,
  type Env,
} from './create-printify';

/**
 * Read-only poster pricing for the gift page.
 *
 * Creates nothing. A gift link is public and may be opened by anyone at any time, so charging a
 * Printify product creation against a page merely being *viewed* would burn the anonymous budget
 * the create endpoint protects (5 creations/hour/IP) for people who never intended to buy. The
 * purchase path stays a deliberate click on the gift page.
 *
 * That makes this endpoint a public door onto the paid Printify account, so it is bounded three
 * ways. It shares one Redis cache with every other lambda instance, it caps how often the cache
 * may be rebuilt against Printify at all, and it rate limits per IP. All three live in Redis rather
 * than process memory precisely because a cold start is the expensive case.
 *
 * With no rate limit store it fails closed, matching `api/create-printify.ts`: the gift page
 * degrades to placeholder prices, but the paid account is never left reachable.
 */

const HOUR = 3600;
const CACHE_TTL_SECONDS = 900; // 15 minutes
/**
 * Rebuilds allowed per hour, globally. A rebuild costs ~7 Printify calls, so this caps spend at
 * roughly 84 calls/hour no matter how much traffic arrives. The 15-minute TTL only needs 4.
 */
const BUILDS_PER_HOUR = 12;
/** Generous for a human reloading a page; exists to blunt a single flood. */
const REQUESTS_PER_HOUR_PER_IP = 120;

type Variant = { id: number; title: string; inches: number; priceCents: number };
type Pricing = { currency: string; variants: Variant[] };

const cacheKey = (env: Env) =>
  `printify:pricing:v1:${env.PRINTIFY_SHOP_ID}:${env.INCLUDE_LARGE === 'true'}`;
const buildKey = () => `printify:pricing:build:${new Date().toISOString().slice(0, 13)}`;
const ipKey = (ip: string) =>
  `printify:pricing:rl:h:${ip}:${new Date().toISOString().slice(0, 13)}`;

function secondsIntoHour(): number {
  return HOUR - (Date.now() % (HOUR * 1000)) / 1000;
}

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
  const { variants } = await resolveSquareVariants(env, costs);
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
  // The CDN sits in front of the shared Redis cache, so this is the cheap first line of defence.
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

  // A stale read is better than an error, and better still is not spending a rebuild.
  let stale: Pricing | null = null;
  try {
    stale = await readCache(env);
  } catch (err) {
    console.error('pricing cache read failed:', err instanceof Error ? err.message : err);
  }
  if (stale) return json(res, { ...stale, stale: false }, 200);

  try {
    const [requests] = await bumpMany(url, token, [{ key: ipKey(ip), ttl: HOUR * 2 }]);
    if (requests > REQUESTS_PER_HOUR_PER_IP) {
      json(res, { error: 'rate_limited', retry_after: Math.ceil(secondsIntoHour()) }, 429, {
        'Retry-After': String(Math.ceil(secondsIntoHour())),
      });
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
      // Over budget: skip Printify entirely. Nothing cached, so the page shows placeholders.
      console.warn(`pricing rebuild cap reached (${builds}/${BUILDS_PER_HOUR}); serving 503`);
      json(res, { error: 'pricing_unavailable' }, 503);
      return;
    }

    const pricing = await buildPricing(env);
    await writeCache(env, pricing);
    json(res, { ...pricing, stale: false }, 200);
  } catch (err) {
    console.error('printify-pricing failed:', err instanceof Error ? err.message : err);
    // Re-read rather than trusting the earlier value: the failure may have been transient, and
    // another instance may have populated the cache while this one was failing.
    try {
      const recovered = await readCache(env);
      if (recovered) return json(res, { ...recovered, stale: true }, 200);
    } catch {
      /* fall through to 503 */
    }
    json(res, { error: 'pricing_unavailable' }, 503);
  }
}
