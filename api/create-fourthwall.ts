const FW_BASE = 'https://api.fourthwall.com';

const MAX_BODY_BYTES = 4_000_000;
const MAX_BASE64_CHARS = 4_000_000;
const HOUR = 3600;
const DAY = 86400;
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

const POSTER_TEMPLATE_ID = (process.env.FOURTHWALL_TEMPLATE_ID ?? 'pro_kRSsoYjwSoyyTEmWko5o0A').trim();
const STICKER_TEMPLATE_ID = (process.env.FOURTHWALL_STICKER_TEMPLATE_ID ?? 'pro_358').trim();
const STICKER_SHEET_TEMPLATE_ID = (process.env.FOURTHWALL_STICKER_SHEET_TEMPLATE_ID ?? 'pro_6a8bdd4fd14d4cf687').trim();
const POSTER_MARGIN_USD = 12;
const STICKER_MARGIN_USD = 6;
const STICKER_SHEET_MARGIN_USD = 6;
const POSTER_COLORS = ['Black', 'Red Oak'];
const STICKER_COLORS = ['White'];
const STICKER_SHEET_COLORS = ['White'];

/** Poster shapes are a pure function of the city's window, so the client tells us which one it drew. */
type PosterShape = 'square' | 'horizontal' | 'vertical';
const POSTER_SIZES_BY_SHAPE: Record<PosterShape, string[]> = {
  square: ['10" x 10"', '14" x 14"', '18" x 18"'],
  // A landscape design is a portrait frame hung on its side, so both non-square shapes use the
  // same 3:4 frames.
  horizontal: ['12" x 16"', '18" x 24"'],
  vertical: ['12" x 16"', '18" x 24"'],
};
function isPosterShape(value: unknown): value is PosterShape {
  return value === 'square' || value === 'horizontal' || value === 'vertical';
}
const STICKER_SIZES = ['3" x 3"', '4" x 4"', '5.5" x 5.5"'];


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
export interface Env {
  FOURTHWALL_API_USERNAME: string;
  FOURTHWALL_API_PASSWORD: string;
  FOURTHWALL_SHOP_DOMAIN: string;
  APP_ORIGIN: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

function readEnv(): Env {
  return {
    FOURTHWALL_API_USERNAME: process.env.FOURTHWALL_API_USERNAME ?? '',
    FOURTHWALL_API_PASSWORD: process.env.FOURTHWALL_API_PASSWORD ?? '',
    FOURTHWALL_SHOP_DOMAIN: process.env.FOURTHWALL_SHOP_DOMAIN ?? '',
    APP_ORIGIN: process.env.APP_ORIGIN ?? '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function credentials(env: Env): string {
  return Buffer.from(`${env.FOURTHWALL_API_USERNAME}:${env.FOURTHWALL_API_PASSWORD}`).toString('base64');
}

async function fwFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FW_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials(env)}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fourthwall ${path} -> [${res.status}]: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function header(headers: ApiRequest['headers'], name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

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
  if (isOversizeBase64(value) || value.length % 4 !== 0) return false;
  return B64_RE.test(value.slice(0, 256)) && B64_RE.test(value.slice(-256));
}
export function isOversizeBase64(value: string): boolean {
  return value.length > MAX_BASE64_CHARS;
}

function storeConfigured(env: Env): boolean {
  return Boolean(env.FOURTHWALL_API_USERNAME && env.FOURTHWALL_API_PASSWORD && env.FOURTHWALL_SHOP_DOMAIN && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
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

async function bumpMany(url: string, token: string, entries: { key: string; ttl: number }[]): Promise<number[]> {
  const results = await redisPipeline(url, token, entries.flatMap((e) => [['INCR', e.key], ['EXPIRE', e.key, e.ttl]]));
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
  return `fw:rl:g:h:${new Date().toISOString().slice(0, 13)}`;
}
function globalDayKey(): string {
  return `fw:rl:g:d:${new Date().toISOString().slice(0, 10)}`;
}

async function limitRequests(env: Env, ip: string): Promise<{ limited: boolean; retryAfter: number }> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const [perIp, global] = await bumpMany(url, token, [
    { key: hourKey('fw', ip), ttl: HOUR * 2 },
    { key: globalHourKey(), ttl: HOUR * 2 },
  ]);
  if (perIp > LIMITS.requestsPerHourPerIp) return { limited: true, retryAfter: secondsIntoHour() };
  if (global > LIMITS.requestsPerHourGlobal) return { limited: true, retryAfter: secondsIntoHour() };
  return { limited: false, retryAfter: 0 };
}
async function limitCreations(env: Env, ip: string): Promise<{ limited: boolean; retryAfter: number }> {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const [perHour, perDay, globalDay] = await bumpMany(url, token, [
    { key: `fw:create:h:${ip}:${new Date().toISOString().slice(0, 13)}`, ttl: HOUR * 2 },
    { key: dayKey('fw:create', ip), ttl: DAY * 2 },
    { key: globalDayKey(), ttl: DAY * 2 },
  ]);
  if (perHour > LIMITS.createsPerHourPerIp) return { limited: true, retryAfter: secondsIntoHour() };
  if (perDay > LIMITS.createsPerDayPerIp) return { limited: true, retryAfter: secondsIntoDay() };
  if (globalDay > LIMITS.createsPerDayGlobal) return { limited: true, retryAfter: secondsIntoDay() };
  return { limited: false, retryAfter: 0 };
}
function secondsIntoHour(): number { return HOUR - (Date.now() % (HOUR * 1000)) / 1000; }
function secondsIntoDay(): number { return DAY - (Date.now() % (DAY * 1000)) / 1000; }

function send(env: Env, req: ApiRequest, res: ApiResponse, body: unknown, status: number, extra?: Record<string, string>) {
  void req;
  const headers: Record<string, string> = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
  if (env.APP_ORIGIN) headers['Access-Control-Allow-Origin'] = env.APP_ORIGIN;
  void req;
  for (const [k, v] of Object.entries({ ...headers, ...(extra ?? {}) })) res.setHeader(k, v);
  res.status(status).json(body);
}
function tooMany(env: Env, req: ApiRequest, res: ApiResponse, retryAfter: number) {
  send(env, req, res, { error: "rate_limited", retry_after: Math.max(1, Math.ceil(retryAfter)) }, 429, { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) });
}

/** JPEG SOF dimensions (no native deps). */
function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      if (width > 0 && height > 0) return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

interface UploadUrlResponse { uploadUrl: string; fileUrl: string }
interface MediaImageResponse { id: string; uri?: string }
interface CreateProductResponse { productId: string; customizationId?: string; images?: unknown[] }
interface ProductDetail { id: string; slug: string; name?: string; variants?: { id: string; name: string; unitPrice?: { value: number; currency: string } }[] }
interface CreatedProduct { productId: string; slug: string; variants: { id: string; title: string; inches: number; width: number; height: number; priceCents: number; color?: string }[] }

async function uploadImage(env: Env, imageBase64: string, size: number, dims: { width: number; height: number }) {
  const meta = await fwFetch<UploadUrlResponse>(env, '/open-api/v1.0/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: 'citylines.jpg', contentType: 'image/jpeg', size }),
  });
  const bytes = Buffer.from(imageBase64, 'base64');
  const gcs = await fetch(meta.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
      'x-goog-content-length-range': `0,${size}`,
    },
    body: bytes,
  });
  if (!gcs.ok) throw new Error(`Fourthwall upload -> [${gcs.status}]`);
  const saved = await fwFetch<MediaImageResponse>(env, '/open-api/v1.0/media/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl: meta.fileUrl, width: dims.width, height: dims.height }),
  });
  if (!saved.id) throw new Error('Fourthwall media register returned no id');
  return saved.id;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface ProductSpec {
  templateId: string;
  colors: string[];
  sizes?: string[];
  profitMargin: number;
  kind: 'poster' | 'sticker' | 'sticker-sheet';
  city: string;
  country: string;
  designHash: string;
}

function productTitle(spec: ProductSpec): string {
  const city = esc(spec.city);
  const country = esc(spec.country);
  let kind = 'City Lines Art Sticker';
  if (spec.kind === 'poster') kind = 'City Lines Art Framed Poster';
  else if (spec.kind === 'sticker-sheet') kind = 'City Lines Art Sticker Sheet';
  if (country) return `${city} | ${country} | ${kind}`;
  return `${city} | ${kind}`;
}

function productDescription(spec: ProductSpec): string {
  const city = esc(spec.city);
  const country = esc(spec.country) || city;
  const token = `<!-- citylines:${spec.designHash} -->`;
  if (spec.kind === 'poster') {
    return [
      `<p><strong>${city}</strong>, drawn through its streets.</p>`,
      `<p>A study of the city's urban rhythm, where intersecting roads, geometric patterns, and the movement of everyday life form a map of modern ${country}.</p>`,
      `<p>Part of <em>City Lines</em>, a visual collection exploring the identity of cities around the world through minimalist line art.</p>`,
      `<p>One city. Countless lines. A place worth framing.</p>`,
      token,
    ].join('\\n');
  }
  const stickerIntro = spec.kind === 'sticker-sheet'
    ? 'presented as a sheet of kiss-cut stickers of varying sizes.'
    : 'designed for stickers.';
  return [
    `<p><strong>${city}</strong>, drawn through its streets.</p>`,
    `<p>A study of the city's urban rhythm, transformed into minimalist line art ${stickerIntro} Intersecting roads, geometric patterns, and the movement of everyday life become a unique visual representation of ${city}, ready to accompany you wherever you go.</p>`,
    `<p>Part of <em>City Lines</em>, a visual collection exploring the identity of cities around the world through minimalist line art.</p>`,
    `<p>One city. Countless lines. Take your city with you.</p>`,
    token,
  ].join('\\n');
}

async function createDesignProduct(env: Env, imageId: string, spec: ProductSpec): Promise<CreatedProduct> {
  const created = await fwFetch<CreateProductResponse>(env, '/open-api/v1.0/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'design',
      productTemplateId: spec.templateId,
      name: productTitle(spec),
      description: productDescription(spec),
      regions: [{ region: 'default', imageId, placementStrategy: spec.kind === 'sticker-sheet' ? 'FILL_ALL' : 'AUTO' }],
      colors: spec.colors,
      sizes: spec.sizes,
      profitMargin: spec.profitMargin,
      publishOnCreate: true,
    }),
  });
  if (!created.productId) throw new Error('Fourthwall create returned no productId');
  const detail = await fwFetch<ProductDetail>(env, `/open-api/v1.0/products/${created.productId}`);
  if (!detail.slug) throw new Error('Fourthwall product has no slug');
  const sizeRe = /(\d+(?:\.\d+)?)\s*["″'′]?\s*x\s*(\d+(?:\.\d+)?)\s*["″'′]?/i;
  const variants = (detail.variants ?? []).map((v) => {
    const m = sizeRe.exec(v.name ?? '');
    const width = m ? Number(m[1]) : 0;
    const height = m ? Number(m[2]) : 0;
    const inches = width > 0 && height > 0 ? Math.min(width, height) : 0;
    const color = spec.colors.find((c) => (v.name ?? '').toLowerCase().includes(c.toLowerCase()));
    const priceCents = Math.round((v.unitPrice?.value ?? 0) * 100);
    return { id: v.id, title: v.name ?? '', inches, width, height, color, priceCents };
  }).filter((v) => v.inches > 0);
  return { productId: created.productId, slug: detail.slug, variants };
}

function productUrl(env: Env, slug: string) {
  const domain = env.FOURTHWALL_SHOP_DOMAIN.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${domain}/products/${slug}`;
}

const memo = new Map<string, { at: number; value: { productId: string; slug: string } }>();
const MEMO_TTL_MS = 30_000;

async function resolveExisting(env: Env, hash: string, type: 'poster' | 'sticker' | 'sticker-sheet'): Promise<{ productId: string; slug: string } | null> {
  const cached = memo.get(`${type}:${hash}`);
  if (cached && Date.now() - cached.at < MEMO_TTL_MS) return cached.value;

  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const key = `fw:design:${type}:${hash}`;
  const r = await redisPipeline(url, token, [['GET', key]]);
  if (typeof r[0] === 'string') {
    try {
      const parsed = JSON.parse(r[0]) as { productId?: string; slug?: string };
      if (parsed.productId && parsed.slug) {
        const v = { productId: parsed.productId, slug: parsed.slug };
        memo.set(`${type}:${hash}`, { at: Date.now(), value: v });
        return v;
      }
    } catch { /* fall through */ }
  }

  const marker = type === 'poster' ? 'Framed Poster' : type === 'sticker' ? 'Stickers' : 'Sticker Sheet';
  for (let page = 0; page < 5; page++) {
    try {
      const body = await fwFetch<{ results?: { id: string; name?: string; slug?: string }[] }>(
        env,
        `/open-api/v1.0/products?page=${page}&size=100`,
      );
      for (const p of body.results ?? []) {
        if (p.name && p.name.includes(marker) && p.name.includes(hash)) {
          if (p.slug) {
            const v = { productId: p.id, slug: p.slug };
            try { await redisPipeline(url, token, [['SET', key, JSON.stringify(v), 'EX', DAY * 90]]); } catch { /* ignore */ }
            memo.set(`${type}:${hash}`, { at: Date.now(), value: v });
            return v;
          }
        }
      }
      if (!body.results || body.results.length < 100) break;
    } catch { break; }
  }
  return null;
}

async function persistDesign(env: Env, hash: string, type: 'poster' | 'sticker' | 'sticker-sheet', value: { productId: string; slug: string }) {
  const url = env.UPSTASH_REDIS_REST_URL!;
  const token = env.UPSTASH_REDIS_REST_TOKEN!;
  const key = `fw:design:${type}:${hash}`;
  try { await redisPipeline(url, token, [['SET', key, JSON.stringify(value), 'EX', DAY * 90]]); } catch { /* non-fatal */ }
  memo.set(`${type}:${hash}`, { at: Date.now(), value });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readEnv();

  if (req.method === 'OPTIONS') {
    void req;
  const headers: Record<string, string> = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
    if (env.APP_ORIGIN) headers['Access-Control-Allow-Origin'] = env.APP_ORIGIN;
  void req;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    send(env, req, res, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
    return;
  }
  if (!env.FOURTHWALL_API_USERNAME || !env.FOURTHWALL_API_PASSWORD || !env.FOURTHWALL_SHOP_DOMAIN) {
    send(env, req, res, { error: 'printing_unavailable' }, 500);
    return;
  }
  if (!storeConfigured(env)) {
    send(env, req, res, { error: 'printing_unavailable' }, 503);
    return;
  }

  const declared = Number(header(req.headers, 'content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    send(env, req, res, { error: 'payload_too_large' }, 413);
    return;
  }
  let body: { image_base64?: string; city_name?: string; city_country?: string; design_hash?: string; shape?: string };
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) { send(env, req, res, { error: 'payload_too_large' }, 413); return; }
    try { body = JSON.parse(req.body) as typeof body; } catch { send(env, req, res, { error: 'invalid_json' }, 400); return; }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as typeof body;
  } else {
    send(env, req, res, { error: 'invalid_json' }, 400); return;
  }

  if (!body.design_hash || !HASH_RE.test(body.design_hash)) {
    send(env, req, res, { error: 'design_hash is required (8-16 hex chars)' }, 400);
    return;
  }
  const city = (body.city_name ?? '').trim();
  if (!CITY_RE.test(city)) {
    send(env, req, res, { error: 'city_name is required (letters, numbers and spaces, max 60)' }, 400);
    return;
  }
  const country = (body.city_country ?? '').trim();
  if (country && !CITY_RE.test(country)) {
    send(env, req, res, { error: 'city_country must be letters and spaces (max 60)' }, 400);
    return;
  }
  if (body.image_base64 && isOversizeBase64(body.image_base64)) {
    send(env, req, res, { error: 'payload_too_large' }, 413);
    return;
  }
  if (!body.image_base64 || !isPlausibleBase64(body.image_base64)) {
    send(env, req, res, { error: 'image_base64 is required and must be valid base64' }, 400);
    return;
  }

  const ip = clientIp(req.headers);
  try {
    const rl = await limitRequests(env, ip);
    if (rl.limited) return tooMany(env, req, res, rl.retryAfter);
  } catch (err) {
    console.error('rate limiting unavailable:', err);
    send(env, req, res, { error: 'printing_unavailable' }, 503);
    return;
  }

  const hash = body.design_hash;
  // The shape only decides which frame sizes are offered; an unknown value falls back to square,
  // which is what every pre-existing design was.
  const posterSizes = POSTER_SIZES_BY_SHAPE[isPosterShape(body.shape) ? body.shape : 'square'];
  const existingPoster = await resolveExisting(env, hash, 'poster');
  let poster: { productId: string; slug: string };
  let needUpload = !existingPoster;
  const existingSticker = await resolveExisting(env, hash, 'sticker');
  const existingStickerSheet = await resolveExisting(env, hash, 'sticker-sheet');

  if (!existingPoster || !existingSticker || !existingStickerSheet) needUpload = true;

  let imageId: string | null = null;
  if (needUpload) {
    try {
      const rl = await limitCreations(env, ip);
      if (rl.limited) return tooMany(env, req, res, rl.retryAfter);
    } catch (err) {
      console.error('rate limiting unavailable:', err);
      send(env, req, res, { error: 'printing_unavailable' }, 503);
      return;
    }
  }

  try {
    const size = Buffer.from(body.image_base64, 'base64').byteLength;
    const dims = jpegDimensions(Buffer.from(body.image_base64, 'base64')) ?? { width: 800, height: 800 };

    let posterVariants: CreatedProduct['variants'] | undefined = existingPoster ? undefined : undefined;
    if (existingPoster) {
      poster = existingPoster;
    } else {
      if (imageId === null) imageId = await uploadImage(env, body.image_base64, size, dims);
      const created = await createDesignProduct(env, imageId, {
        templateId: POSTER_TEMPLATE_ID,
        colors: POSTER_COLORS,
        sizes: posterSizes,
        profitMargin: POSTER_MARGIN_USD,
        kind: 'poster',
        city,
        country,
        designHash: hash,
      });
      await persistDesign(env, hash, 'poster', { productId: created.productId, slug: created.slug });
      poster = { productId: created.productId, slug: created.slug };
      posterVariants = created.variants;
    }

    // Always ensure the sticker product exists so it shows up in the shop catalog.
    const needStickerUpload = !existingSticker;
    if (needStickerUpload && imageId === null) imageId = await uploadImage(env, body.image_base64, size, dims);
    if (!existingSticker) {
      try {
        if (imageId === null) imageId = await uploadImage(env, body.image_base64, size, dims);
        const createdSticker = await createDesignProduct(env, imageId!, {
          templateId: STICKER_TEMPLATE_ID,
          colors: STICKER_COLORS,
          sizes: STICKER_SIZES,
          profitMargin: STICKER_MARGIN_USD,
          kind: 'sticker',
          city,
          country,
          designHash: hash,
        });
        await persistDesign(env, hash, 'sticker', { productId: createdSticker.productId, slug: createdSticker.slug });
      } catch (err) {
        console.error('create-fourthwall sticker failed (poster still created):', err);
      }
    }

    // Sticker sheet (multiple stickers, varying sizes) — auto-create so the
    // same artwork surfaces in the shop catalog as a sticker sheet.
    const needSheetUpload = !existingStickerSheet;
    if (needSheetUpload && imageId === null) imageId = await uploadImage(env, body.image_base64, size, dims);
    if (!existingStickerSheet) {
      try {
        if (imageId === null) imageId = await uploadImage(env, body.image_base64, size, dims);
        const createdSheet = await createDesignProduct(env, imageId!, {
          templateId: STICKER_SHEET_TEMPLATE_ID,
          colors: STICKER_SHEET_COLORS,
          profitMargin: STICKER_SHEET_MARGIN_USD,
          kind: 'sticker-sheet',
          city,
          country,
          designHash: hash,
        });
        await persistDesign(env, hash, 'sticker-sheet', { productId: createdSheet.productId, slug: createdSheet.slug });
      } catch (err) {
        console.error('create-fourthwall sticker sheet failed (poster still created):', err);
      }
    }

    // Only return poster variants when freshly created.
    send(env, req, res, {
      product_url: productUrl(env, poster.slug),
      product_id: poster.productId,
      currency: 'USD',
      reused: Boolean(existingPoster),
      variants: posterVariants,
    }, 200);
  } catch (err) {
    console.error('create-fourthwall failed:', err);
    send(env, req, res, { error: 'Could not prepare your print. Please try again.' }, 500);
  }
}
