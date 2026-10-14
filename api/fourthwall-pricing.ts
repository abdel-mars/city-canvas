const FW_BASE = 'https://api.fourthwall.com';

const HOUR = 3600;
const CACHE_TTL_SECONDS = 900;
const BUILDS_PER_HOUR = 12;
const REQUESTS_PER_HOUR_PER_IP = 120;

const IP_RE = /^[0-9a-f:.]{3,45}$/i;

const FOURTHWALL_TEMPLATE_ID = (process.env.FOURTHWALL_TEMPLATE_ID ?? 'pro_kRSsoYjwSoyyTEmWko5o0A').trim();
const PROFIT_MARGIN_USD = 12;

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
}
export interface Env {
  FOURTHWALL_API_USERNAME: string;
  FOURTHWALL_API_PASSWORD: string;
  FOURTHWALL_SHOP_DOMAIN: string;
  FOURTHWALL_TEMPLATE_ID?: string;
  APP_ORIGIN: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export interface PosterVariant {
  id: string;
  title: string;
  inches: number;
  priceCents: number;
}
export interface PosterPricing {
  currency: string;
  variants: PosterVariant[];
}

export function priceFor(baseUsd: number): number {
  return Math.round((baseUsd + PROFIT_MARGIN_USD) * 100);
}

function readEnv(): Env {
  return {
    FOURTHWALL_API_USERNAME: process.env.FOURTHWALL_API_USERNAME ?? '',
    FOURTHWALL_API_PASSWORD: process.env.FOURTHWALL_API_PASSWORD ?? '',
    FOURTHWALL_SHOP_DOMAIN: process.env.FOURTHWALL_SHOP_DOMAIN ?? '',
    APP_ORIGIN: process.env.APP_ORIGIN ?? '',
    FOURTHWALL_TEMPLATE_ID: (process.env.FOURTHWALL_TEMPLATE_ID ?? 'pro_kRSsoYjwSoyyTEmWko5o0A').trim(),
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function credentials(env: Env): string {
  return Buffer.from(`${env.FOURTHWALL_API_USERNAME}:${env.FOURTHWALL_API_PASSWORD}`).toString('base64');
}

async function fwFetch<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${FW_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${credentials(env)}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fourthwall ${path} -> [${res.status}]: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function clientIp(headers: ApiRequest['headers']): string {
  const raw = headers['x-vercel-forwarded-for'] ?? headers['x-forwarded-for'] ?? headers['x-real-ip'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && IP_RE.test(value.trim())) return value.trim();
  return 'unknown';
}

async function redisPipeline(url: string, token: string, commands: (string | number)[][]): Promise<unknown[]> {
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
    const r = entry as { result?: unknown; error?: unknown };
    if (r.error !== undefined && r.error !== null) throw new Error(`rate limit store -> command ${i} failed: ${String(r.error)}`);
    return 'result' in r ? r.result : entry;
  });
}

async function bumpOne(url: string, token: string, key: string, ttl: number): Promise<number> {
  const res = await redisPipeline(url, token, [['INCR', key], ['EXPIRE', key, ttl]]);
  return Number(res[0]);
}

function storeConfigured(env: Env): boolean {
  return Boolean(env.FOURTHWALL_API_USERNAME && env.FOURTHWALL_API_PASSWORD && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

const SIZE_RE = /^(\d+(?:\.\d+)?)\s*["″'′]?\s*x\s*(\d+(?:\.\d+)?)\s*["″'′]?/i;
function squareInches(title: string): number | null {
  const m = SIZE_RE.exec(title ?? '');
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return Number.isFinite(w) && Number.isFinite(h) && w === h ? w : null;
}

interface FourthwallSizeVariant {
  variantId: string;
  size: string;
  price: { amount: number; currency: string };
  available: boolean;
}
interface FourthwallColorVariant {
  color: { name: string; hex: string };
  sizeVariants: FourthwallSizeVariant[];
}
interface FourthwallTemplateDetail {
  name: string;
  priceFrom: { amount: number; currency: string };
  colorVariants: FourthwallColorVariant[];
}

const ALLOWED_SQUARES = new Set([10, 14, 18]);

async function harvestSizes(env: Env): Promise<{ currency: string; variants: PosterVariant[] }> {
  const tpl = await fwFetch<FourthwallTemplateDetail>(env, `/open-api/v1.0/product-templates/${FOURTHWALL_TEMPLATE_ID}`);
  const currency = tpl.priceFrom?.currency ?? 'USD';
  const bySize = new Map<string, FourthwallSizeVariant>();
  for (const cv of tpl.colorVariants ?? []) {
    if (!cv) continue;
    for (const sv of cv.sizeVariants ?? []) {
      const inches = squareInches(sv.size);
      if (inches === null || !ALLOWED_SQUARES.has(inches)) continue;
      if (!bySize.has(sv.size)) bySize.set(sv.size, sv);
    }
  }
  const variants: PosterVariant[] = [];
  for (const [size, sv] of bySize.entries()) {
    const inches = squareInches(size)!;
    variants.push({
      id: sv.variantId,
      title: sv.size,
      inches,
      priceCents: priceFor(sv.price.amount),
    });
  }
  variants.sort((a, b) => a.inches - b.inches);
  if (variants.length === 0) throw new Error('no qualifying square poster sizes found');
  return { currency, variants };
}

const cacheKey = (env: Env) => `fourthwall:pricing:v1:${env.FOURTHWALL_TEMPLATE_ID}`;
const buildKey = () => `fourthwall:pricing:build:${new Date().toISOString().slice(0, 13)}`;
const ipKey = (ip: string) => `fourthwall:pricing:rl:h:${ip}:${new Date().toISOString().slice(0, 13)}`;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readEnv();
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!env.FOURTHWALL_API_USERNAME || !env.FOURTHWALL_API_PASSWORD) {
    res.status(500).json({ error: 'fourthwall_unconfigured' });
    return;
  }
  if (!storeConfigured(env)) {
    res.status(503).json({ error: 'pricing_unavailable' });
    return;
  }
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;

  // read cache
  const r1 = await redisPipeline(url, token, [['GET', cacheKey(env)]]);
  let cached: { currency: string; variants: PosterVariant[] } | null = null;
  if (typeof r1[0] === 'string') {
    try {
      const parsed = JSON.parse(r1[0]) as { currency?: string; variants?: PosterVariant[] };
      if (Array.isArray(parsed.variants) && parsed.variants.length > 0) cached = parsed as { currency: string; variants: PosterVariant[] };
    } catch { cached = null; }
  }
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.status(200).json({ ...cached, stale: false });
    return;
  }

  const ip = clientIp(req.headers);
  try {
    const requests = await bumpOne(url, token, ipKey(ip), HOUR * 2);
    if (requests > REQUESTS_PER_HOUR_PER_IP) {
      const retry = Math.ceil(HOUR - (Date.now() % (HOUR * 1000)) / 1000);
      res.status(429).json({ error: 'rate_limited', retry_after: retry });
      return;
    }
  } catch (err) {
    console.error('rate limiting unavailable:', err);
    res.status(503).json({ error: 'pricing_unavailable' });
    return;
  }

  try {
    const builds = await bumpOne(url, token, buildKey(), HOUR * 2);
    if (builds > BUILDS_PER_HOUR) {
      res.status(503).json({ error: 'pricing_unavailable' });
      return;
    }
    const pricing = await harvestSizes(env);
    await redisPipeline(url, token, [['SET', cacheKey(env), JSON.stringify(pricing), 'EX', CACHE_TTL_SECONDS]]);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.status(200).json({ ...pricing, stale: false });
  } catch (err) {
    console.error('fourthwall-pricing failed:', err);
    res.status(503).json({ error: 'pricing_unavailable' });
  }
}
