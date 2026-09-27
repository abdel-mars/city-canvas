/**
 * Geo proxy for OpenStreetMap data: road networks (Overpass) and place search (Nominatim).
 *
 * Why server-side rather than straight from the browser:
 *  - `User-Agent` is a forbidden header name in the Fetch spec, so browsers silently drop it.
 *    Overpass blocks browser clients by design, replying with a 406 whose error page carries no
 *    CORS headers, so the failure surfaces in the console as a misleading CORS error.
 *  - `overpass-api.de` is frequently overloaded and increasingly refuses whole client ranges, so
 *    a single endpoint is not a dependency we can trust. We fan out across mirrors.
 *  - Caching here means a given city is fetched upstream once, for everyone.
 *
 * This is deliberately one self-contained function with no relative imports: Vercel's function
 * build resolves relative specifiers under node16 semantics (package.json is
 * "type": "module"), which rejects extensionless relative paths at runtime.
 *
 * POST /api/geo  { kind: 'roads',  bbox: [south, west, north, east] }
 * POST /api/geo  { kind: 'search', q: string }
 */

import { Redis } from '@upstash/redis';

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

/** Compact point: [lat, lon]. Much smaller on the wire than { lat, lon } objects. */
type Point = [number, number];

interface CompactRoad {
  id: number;
  type: string;
  geometry: Point[];
}

interface City {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  boundingBox: [number, number, number, number]; // south, west, north, east
}

const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Overpass is often saturated. Measured worst case was 42s because a busy mirror consumed the
// full 25s before failing over. A busy mirror is still busy 8s later, so fail over quickly.
const UPSTREAM_TIMEOUT_MS = 8_000;
const NOMINATIM_TIMEOUT_MS = 12_000;

const EPSILON = 0.00005; // ~5 m at the equator
const MAX_WAYS = 12_000;
const MAX_POINTS = 400_000;

const ROADS_FRESH_TTL = 7 * 24 * 60 * 60;
const ROADS_STALE_TTL = 30 * 24 * 60 * 60;
const SEARCH_FRESH_TTL = 30 * 24 * 60 * 60;
const SEARCH_STALE_TTL = 90 * 24 * 60 * 60;

const REQUESTS_PER_HOUR = 60;

/** Largest accepted bounding-box span, in degrees. Roughly a large metropolitan area. */
const MAX_BBOX_SPAN = 0.35;

/**
 * Span used when a Nominatim box is too big.
 *
 * Measured, not guessed. Central Tokyo answers 0.05° with ~4,000 ways but runs out of memory at
 * 0.07°, and central Moscow behaves the same way — that is Overpass's own ceiling, reached long
 * before our MAX_WAYS/MAX_POINTS truncation ever applies. So the clamp is set just under the
 * observed limit rather than just under MAX_BBOX_SPAN: a wider window produces a prettier crop but
 * fails on exactly the megacities people most want to print, and it now fails honestly (503) rather
 * than being blamed on the city.
 *
 * 0.05° is roughly 5.5 km — a dense city-centre district. Only cities whose Nominatim box is
 * oversized get it; ordinary cities keep their natural, much larger extent.
 */
const CLAMP_SPAN = 0.05;

/**
 * Slip roads (`*_link`) are excluded on purpose: they are short motorway ramps that dominate
 * the way count while adding visual clutter rather than readable structure.
 */
const HIGHWAY_RE =
  '^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$';

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * Overpass's operators permanently ban clients that do not identify themselves, and require a
 * contact address. There is deliberately no default.
 */
export function userAgent(): string {
  const contact = (process.env.GEOCONTACT ?? '').trim();
  if (!contact) {
    throw new Error('GEOCONTACT is not configured; refusing to call Overpass unidentified');
  }
  return `CityLines/1.0 (${contact})`;
}

// ── Validation ──────────────────────────────────────────────────────────────

export function isValidBbox(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const south = value[0] as number;
  const west = value[1] as number;
  const north = value[2] as number;
  const east = value[3] as number;
  if (south < -90 || north > 90 || west < -180 || east > 180) return false;
  if (south >= north || west >= east) return false;
  // Nominatim returns administrative areas, some of which are metro-sized (a Porto result was
  // 0.47 x 0.91 degrees). Those produce queries big enough to time out, so they are rejected
  // rather than silently taking 30s+ and returning a partial result.
  if (north - south > MAX_BBOX_SPAN || east - west > MAX_BBOX_SPAN) return false;
  return true;
}

/** Strips control characters and collapses whitespace before the query leaves our server. */
export function normaliseQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // The character class is intentional: search input is untrusted and must not carry control
  // bytes into the upstream query string.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > 90) return null;
  return cleaned;
}

/** Extracts the caller's IP, trusting only the entry Vercel appended on the right. */
export function clientIp(headers: ApiRequest['headers']): string {
  const pick = (name: string): string | null => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  const rightmost = (raw: string | null): string | null => {
    if (!raw) return null;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const value = parts[parts.length - 1];
    return /^[0-9a-f:.]{3,45}$/i.test(value) ? value : null;
  };
  return (
    rightmost(pick('x-vercel-forwarded-for')) ??
    rightmost(pick('x-forwarded-for')) ??
    rightmost(pick('x-real-ip')) ??
    'unknown'
  );
}

// ── Upstream ────────────────────────────────────────────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Remembers the mirror that last worked so we stop re-probing known-dead hosts every request. */
let preferredMirror: string | null = null;

function mirrorOrder(): string[] {
  if (!preferredMirror) return OVERPASS_MIRRORS;
  return [preferredMirror, ...OVERPASS_MIRRORS.filter((m) => m !== preferredMirror)];
}

async function fetchOverpass(query: string): Promise<unknown> {
  const failures: string[] = [];

  for (const mirror of mirrorOrder()) {
    try {
      const res = await fetchWithTimeout(
        mirror,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': userAgent(),
          },
          body: `data=${encodeURIComponent(query)}`,
        },
        UPSTREAM_TIMEOUT_MS,
      );

      if (!res.ok) {
        failures.push(`${hostOf(mirror)}=${res.status}`);
        continue;
      }

      const data = (await res.json()) as unknown;
      if (preferredMirror !== mirror) {
        console.log(`overpass: preferred mirror is now ${hostOf(mirror)}`);
      }
      preferredMirror = mirror;
      return data;
    } catch (err) {
      failures.push(`${hostOf(mirror)}=${err instanceof Error ? err.message : 'error'}`);
    }
  }

  throw new Error(`all Overpass mirrors failed: ${failures.join(' ')}`);
}

async function fetchNominatim(query: string): Promise<unknown> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  }).toString()}`;

  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'en' } },
    NOMINATIM_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`nominatim=${res.status}`);
  return res.json();
}

// ── Simplification ──────────────────────────────────────────────────────────

/** Douglas-Peucker line simplification. */
function perpendicularDist(p: Point, a: Point, b: Point): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[1] - a[1], p[0] - a[0]);
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lenSq));
  return Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy));
}

export function simplifyLine(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDist(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyLine(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyLine(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

interface OverpassWay {
  type: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** Simplifies and compacts the raw Overpass payload. */
export interface TransformedRoads {
  roads: CompactRoad[];
  truncated: boolean;
  /**
   * Overpass's own diagnosis, present when the query timed out or blew past `maxsize`.
   *
   * Overpass reports these in a top-level `remark` while still returning HTTP 200, sometimes with
   * no `elements` at all. Reading only `elements` turns a transient upstream failure into an empty
   * result, which is indistinguishable from "this area genuinely has no roads".
   */
  remark: string | null;
}

export function transformRoads(data: unknown): TransformedRoads {
  const body = (data ?? {}) as { elements?: unknown[]; remark?: unknown };
  const elements = (Array.isArray(body.elements) ? body.elements : []) as OverpassWay[];
  const remark = typeof body.remark === 'string' && body.remark.trim() ? body.remark.trim() : null;
  const roads: CompactRoad[] = [];
  let points = 0;
  let truncated = false;

  for (const el of elements) {
    if (roads.length >= MAX_WAYS || points >= MAX_POINTS) {
      truncated = true;
      break;
    }
    if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;

    const raw: Point[] = [];
    for (const g of el.geometry) {
      if (g && Number.isFinite(g.lat) && Number.isFinite(g.lon)) raw.push([g.lat, g.lon]);
    }
    if (raw.length < 2) continue;

    const simple = simplifyLine(raw, EPSILON);
    if (simple.length < 2) continue;

    roads.push({
      id: typeof el.id === 'number' ? el.id : 0,
      type: el.tags?.highway ?? 'unknown',
      geometry: simple.map(([lat, lon]) => [round5(lat), round5(lon)] as Point),
    });
    points += simple.length;
  }

  if (truncated) console.warn(`transformRoads: truncated at ${roads.length} ways / ${points} points`);
  return { roads, truncated, remark };
}

interface NominatimResult {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
  address?: Record<string, string>;
}

/**
 * Clamp a Nominatim box down to something Overpass can actually answer.
 *
 * Nominatim frequently returns an administrative area rather than the city: Tokyo comes back as
 * the whole prefecture at 15.7° x 18.4°, Berlin as 0.34° x 0.67°. Those are rejected outright by
 * isValidBbox, so before this the user could pick a city straight from the dropdown and be met
 * with a 400 and "choose a smaller city" — advice they cannot act on.
 *
 * A centred crop is far better than a refusal: 0.25° is roughly 28 km, which frames a dense city
 * centre rather nicely, and it keeps the three biggest metro names usable. Deliberately under
 * MAX_BBOX_SPAN so the arithmetic cannot land on the boundary — a box built to exactly 0.35
 * measures 0.3500000000000014 in floating point and would be rejected anyway.
 */
export function clampBbox(bbox: [number, number, number, number], lat: number, lon: number): [number, number, number, number] {
  const [south, west, north, east] = bbox;
  if (north - south <= MAX_BBOX_SPAN && east - west <= MAX_BBOX_SPAN) return bbox;

  const half = CLAMP_SPAN / 2;
  // Clamp the centre into valid coordinate space so a box near a pole or the antimeridian cannot
  // wrap or invert.
  const cLat = Math.min(Math.max(lat, -90 + half), 90 - half);
  const cLon = Math.min(Math.max(lon, -180 + half), 180 - half);
  return [cLat - half, cLon - half, cLat + half, cLon + half];
}

/** Maps a Nominatim result onto the app's own City shape, server-side. */
export function toCity(r: NominatimResult): City | null {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!Array.isArray(r.boundingbox) || r.boundingbox.length !== 4) return null;

  const bb = r.boundingbox.map(Number);
  if (bb.some((n) => !Number.isFinite(n))) return null;

  const displayName = r.display_name ?? '';
  const name =
    r.address?.city || r.address?.town || r.address?.village || r.name || displayName.split(',')[0] || '';

  return {
    name,
    displayName,
    lat,
    lon,
    // Nominatim orders boundingbox as south, north, west, east.
    boundingBox: clampBbox([bb[0], bb[2], bb[1], bb[3]], lat, lon),
  };
}

// ── Cache ───────────────────────────────────────────────────────────────────

interface CacheHit<T> {
  value: T;
  fresh: boolean;
}

const memory = new Map<string, { value: string; freshUntil: number; staleUntil: number }>();
const MEMORY_MAX = 200;

/**
 * Redis client, created lazily and memoised. Uses the official SDK rather than hand-rolled REST
 * calls: Upstash answers HTTP 200 even when a command fails (the error is inside the result
 * array), which made hand-rolled calls fail silently.
 */
let redisClient: Redis | null | undefined;

function redis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

/**
 * Single key, long TTL, freshness decided by the embedded timestamp.
 *
 * The SDK serialises and deserialises JSON itself, so the value is stored and read as a plain
 * object. Wrapping it in JSON.stringify here and parsing on read was the original bug: the SDK
 * had already parsed it, so JSON.parse received an object and threw.
 */
async function cacheGet<T>(key: string, freshTtlSec: number): Promise<CacheHit<T> | null> {
  const r = redis();
  if (r) {
    try {
      const parsed = (await r.get<{ t: number; v: T }>(key)) ?? null;
      if (!parsed) return null;
      return { value: parsed.v, fresh: Math.floor(Date.now() / 1000) - parsed.t < freshTtlSec };
    } catch (err) {
      console.warn('cache read failed, continuing without it:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  const hit = memory.get(key);
  if (!hit || Date.now() > hit.staleUntil) {
    memory.delete(key);
    return null;
  }
  const parsed = JSON.parse(hit.value) as { t: number; v: T };
  return { value: parsed.v, fresh: Date.now() < hit.freshUntil };
}

async function cacheSet(
  key: string,
  value: unknown,
  freshTtlSec: number,
  staleTtlSec: number,
): Promise<void> {
  const r = redis();
  if (r) {
    try {
      await r.set(key, { t: Math.floor(Date.now() / 1000), v: value }, { ex: staleTtlSec });
      return;
    } catch (err) {
      console.warn('cache write failed, continuing without it:', err instanceof Error ? err.message : err);
      return;
    }
  }

  const now = Date.now();
  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  const payload = JSON.stringify({ t: Math.floor(Date.now() / 1000), v: value });
  memory.set(key, { value: payload, freshUntil: now + freshTtlSec * 1000, staleUntil: now + staleTtlSec * 1000 });
}

// ── Rate limiting ───────────────────────────────────────────────────────────

async function rateLimited(
  key: string,
  limit: number,
): Promise<{ limited: boolean; retryAfter: number }> {
  const r = redis();
  // Fail open. The cache is the real load protection, and a Redis outage must not take the
  // site's core feature down with it.
  if (!r) return { limited: false, retryAfter: 0 };

  try {
    const window = new Date().toISOString().slice(0, 13);
    const redisKey = `geo:rl:${key}:${window}`;
    const count = await r.incr(redisKey);
    if (count === 1) await r.expire(redisKey, 7200);
    if (count > limit) {
      return { limited: true, retryAfter: 3600 - (Date.now() % 3_600_000) / 1000 };
    }
    return { limited: false, retryAfter: 0 };
  } catch (err) {
    console.warn('rate limiter unavailable, failing open:', err instanceof Error ? err.message : err);
    return { limited: false, retryAfter: 0 };
  }
}

// ── Single-flight ───────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

/** Collapses concurrent identical requests into a single upstream call. */
function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Handlers ────────────────────────────────────────────────────────────────

function buildRoadsQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  return `[out:json][timeout:7][maxsize:8388608];(way["highway"~"${HIGHWAY_RE}"](${south},${west},${north},${east}););out geom;`;
}

function roadsCacheKey(bbox: [number, number, number, number]): string {
  return `geo:roads:v3:${bbox.map((n) => n.toFixed(4)).join(',')}`;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function handleRoads(
  res: ApiResponse,
  rawBbox: unknown,
  ip: string,
): Promise<void> {
  if (!isValidBbox(rawBbox)) {
    res.status(400).json({ error: 'invalid_bbox' });
    return;
  }
  const bbox = rawBbox as [number, number, number, number];
  const key = roadsCacheKey(bbox);

  const cached = await cacheGet<CompactRoad[]>(key, ROADS_FRESH_TTL);
  if (cached?.fresh) {
    res.status(200).json({ roads: cached.value, cached: true });
    return;
  }

  const rl = await rateLimited(ip, REQUESTS_PER_HOUR);
  if (rl.limited) {
    // Serve a stale copy rather than breaking the core feature for a returning visitor.
    if (cached) {
      res.setHeader('Retry-After', String(Math.ceil(rl.retryAfter)));
      res.status(200).json({ roads: cached.value, cached: true, stale: true });
      return;
    }
    res.setHeader('Retry-After', String(Math.ceil(rl.retryAfter)));
    res.status(429).json({ error: 'rate_limited', retry_after: Math.ceil(rl.retryAfter) });
    return;
  }

  try {
    let truncated = false;
    const roads = await singleFlight(key, async () => {
      const again = await cacheGet<CompactRoad[]>(key, ROADS_FRESH_TTL);
      if (again?.fresh) return again.value;
      const data = await fetchOverpass(buildRoadsQuery(bbox));
      const { roads: list, truncated: cut, remark } = transformRoads(data);

      // A query Overpass could not finish is not a city with no roads. Caching either would poison
      // the entry for 7 days fresh and 30 days stale, and the visitor is told to pick a different
      // city when in fact a retry would have worked. Only a clean, non-empty result is cacheable.
      if (remark) throw new Error(`overpass: ${remark}`);
      if (list.length === 0) throw new Error('overpass: no road elements in this area');
      if (cut) {
        truncated = true;
        console.warn(`geo: truncated map at ${list.length} ways for bbox ${bbox.join(',')}`);
      }

      await cacheSet(key, list, ROADS_FRESH_TTL, ROADS_STALE_TTL);
      return list;
    });
    res.status(200).json({ roads, cached: false, truncated });
  } catch (err) {
    console.error('geo roads failed:', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'upstream_unavailable' });
  }
}

async function handleSearch(
  res: ApiResponse,
  rawQuery: unknown,
  ip: string,
): Promise<void> {
  const q = normaliseQuery(rawQuery);
  if (!q) {
    res.status(400).json({ error: 'invalid_query' });
    return;
  }

  const key = `geo:search:v2:${q.toLowerCase()}`;
  const cached = await cacheGet<City[]>(key, SEARCH_FRESH_TTL);
  if (cached?.fresh) {
    res.status(200).json({ cities: cached.value, cached: true });
    return;
  }

  const rl = await rateLimited(ip, REQUESTS_PER_HOUR);
  if (rl.limited) {
    if (cached) {
      res.setHeader('Retry-After', String(Math.ceil(rl.retryAfter)));
      res.status(200).json({ cities: cached.value, cached: true, stale: true });
      return;
    }
    res.setHeader('Retry-After', String(Math.ceil(rl.retryAfter)));
    res.status(429).json({ error: 'rate_limited', retry_after: Math.ceil(rl.retryAfter) });
    return;
  }

  try {
    const cities = await singleFlight(key, async () => {
      const again = await cacheGet<City[]>(key, SEARCH_FRESH_TTL);
      if (again?.fresh) return again.value;
      const data = (await fetchNominatim(q)) as NominatimResult[];
      const list = (Array.isArray(data) ? data : [])
        .map(toCity)
        .filter((c): c is City => c !== null && c.name.length > 0);
      await cacheSet(key, list, SEARCH_FRESH_TTL, SEARCH_STALE_TTL);
      return list;
    });
    res.status(200).json({ cities, cached: false });
  } catch (err) {
    console.error('geo search failed:', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'upstream_unavailable' });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as
    | { kind?: string; bbox?: unknown; q?: unknown }
    | null;

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  const ip = clientIp(req.headers);

  if (body.kind === 'roads') {
    await handleRoads(res, body.bbox, ip);
    return;
  }
  if (body.kind === 'search') {
    await handleSearch(res, body.q, ip);
    return;
  }

  res.status(400).json({ error: 'unknown_kind' });
}
