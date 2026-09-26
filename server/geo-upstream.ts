/**
 * Shared upstream plumbing for the geo endpoints (Overpass + Nominatim).
 *
 * Why this exists in a serverless function rather than the browser:
 *  - `User-Agent` is a forbidden header name in the Fetch spec, so browsers silently drop it.
 *    Overpass requires a descriptive UA and blocks real browser UA strings outright, so direct
 *    browser access to the interpreter is refused with a 406 whose error page carries no CORS
 *    headers (which is why it surfaces as a bogus CORS error).
 *  - `overpass-api.de` is overloaded and increasingly bans whole client ranges, so a single
 *    endpoint is not a dependency we can trust.
 *  - Caching server-side means each city is fetched from the upstream exactly once, for everyone.
 *
 * Lives outside `api/` because Vercel routes every file directly under `api/` as a function.
 */

/** Compact point: [lat, lon]. Much smaller on the wire than { lat, lon } objects. */
export type Point = [number, number];

export interface CompactRoad {
  id: number;
  type: string;
  geometry: Point[];
}

export interface City {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  boundingBox: [number, number, number, number]; // south, west, north, east
}

/**
 * Ordered by observed health. `overpass-api.de` is last because it is the one that refuses
 * browser clients and the most likely to be rate-limiting.
 */
export const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Overpass's operators require an identifiable client and permanently ban ones that are not
 * contacted. There is deliberately no default: an anonymous client is what gets ranges banned.
 */
export function userAgent(): string {
  const contact = (process.env.GEOCONTACT ?? '').trim();
  if (!contact) {
    throw new Error('GEOCONTACT is not configured; refusing to call Overpass unidentified');
  }
  return `CityLines/1.0 (${contact})`;
}

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

/** Tries each mirror in turn; throws with a per-mirror breakdown if all of them fail. */
export async function fetchOverpass(query: string): Promise<unknown> {
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
        REQUEST_TIMEOUT_MS,
      );

      if (!res.ok) {
        failures.push(`${hostOf(mirror)}=${res.status}`);
        continue;
      }

      const data = (await res.json()) as unknown;
      if (preferredMirror !== mirror) {
        console.log(`overpass: switching preferred mirror to ${hostOf(mirror)}`);
      }
      preferredMirror = mirror;
      return data;
    } catch (err) {
      failures.push(`${hostOf(mirror)}=${err instanceof Error ? err.message : 'error'}`);
    }
  }

  throw new Error(`all Overpass mirrors failed: ${failures.join(' ')}`);
}

/** Nominatim also demands a descriptive User-Agent and a max of ~1 request/second. */
export async function fetchNominatim(query: string): Promise<unknown> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  }).toString()}`;

  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'en' } },
    REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`nominatim=${res.status}`);
  return res.json();
}

// ── Simplification ──────────────────────────────────────────────────────────

/** Douglas-Peucker. Epsilon is roughly 5 m at the equator, matching the previous client value. */
function perpendicularDist(p: Point, a: Point, b: Point): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[1] - a[1], p[0] - a[0]);
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lenSq));
  const projLon = a[1] + t * dx;
  const projLat = a[0] + t * dy;
  return Math.hypot(p[1] - projLon, p[0] - projLat);
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

// ── Cache ───────────────────────────────────────────────────────────────────

interface CacheHit<T> {
  value: T;
  fresh: boolean;
}

interface CacheBackend {
  get<T>(key: string): Promise<CacheHit<T> | null>;
  set(key: string, value: string, freshTtlSec: number, staleTtlSec: number): Promise<void>;
}

/** Falls back to an in-process Map. Road loading must not fail closed because Redis is down. */
const memory = new Map<string, { value: string; freshUntil: number; staleUntil: number }>();
const MEMORY_MAX = 200;

const memoryBackend: CacheBackend = {
  async get<T>(key: string) {
    const hit = memory.get(key);
    if (!hit || Date.now() > hit.staleUntil) {
      memory.delete(key);
      return null;
    }
    return { value: JSON.parse(hit.value) as T, fresh: Date.now() < hit.freshUntil };
  },
  async set(key, value, freshTtlSec, staleTtlSec) {
    const now = Date.now();
    if (memory.size >= MEMORY_MAX) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    memory.set(key, {
      value,
      freshUntil: now + freshTtlSec * 1000,
      staleUntil: now + staleTtlSec * 1000,
    });
  },
};

/** Two Upstash keys give a fresh tier and a longer stale tier that a rate-limited request can use. */
const redisBackend: CacheBackend = {
  async get<T>(key: string) {
    const url = process.env.UPSTASH_REDIS_REST_URL!;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    const auth = { Authorization: `Bearer ${token}` };

    const freshRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: auth,
      signal: AbortSignal.timeout(4000),
    });
    if (freshRes.ok) {
      const body = (await freshRes.json()) as { result: string | null };
      if (body.result) return { value: JSON.parse(body.result) as T, fresh: true };
    }

    const staleRes = await fetch(`${url}/get/${encodeURIComponent(`${key}:stale`)}`, {
      headers: auth,
      signal: AbortSignal.timeout(4000),
    });
    if (staleRes.ok) {
      const body = (await staleRes.json()) as { result: string | null };
      if (body.result) return { value: JSON.parse(body.result) as T, fresh: false };
    }
    return null;
  },

  async set(key, value, freshTtlSec, staleTtlSec) {
    const url = process.env.UPSTASH_REDIS_REST_URL!;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    const auth = { Authorization: `Bearer ${token}` };
    const staleKey = `${key}:stale`;

    const results = await Promise.all([
      fetch(`${url}/set/${encodeURIComponent(key)}/ex/${freshTtlSec}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: value,
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`${url}/set/${encodeURIComponent(staleKey)}/ex/${staleTtlSec}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: value,
        signal: AbortSignal.timeout(4000),
      }),
    ]);
    for (const r of results) {
      if (!r.ok) throw new Error(`cache write failed [${r.status}]`);
    }
  },
};

function backend(): CacheBackend {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? redisBackend
    : memoryBackend;
}

export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    return await backend().get<T>(key);
  } catch (err) {
    console.warn('cache read failed, continuing without it:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  freshTtlSec: number,
  staleTtlSec: number,
): Promise<void> {
  try {
    await backend().set(key, JSON.stringify(value), freshTtlSec, staleTtlSec);
  } catch (err) {
    console.warn('cache write failed, continuing without it:', err instanceof Error ? err.message : err);
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────

/** Fixed window per IP. Returns true when the caller is over budget. */
export async function rateLimited(key: string, limit: number): Promise<{ limited: boolean; retryAfter: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Fail open. The cache is the real load protection; a Redis outage must not take the site down.
    return { limited: false, retryAfter: 0 };
  }

  try {
    const window = new Date().toISOString().slice(0, 13);
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `geo:rl:${key}:${window}`],
        ['EXPIRE', `geo:rl:${key}:${window}`, 7200],
      ]),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`[${res.status}]`);

    const results = (await res.json()) as [number, unknown];
    const count = Number(results[0]);
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

/** Collapses concurrent identical requests into one upstream call. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Validation helpers ──────────────────────────────────────────────────────

export function isValidBbox(value: unknown): value is [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const [south, west, north, east] = value as number[];
  if (south < -90 || north > 90 || west < -180 || east > 180) return false;
  if (south >= north || west >= east) return false;
  // A continent-sized query would hammer the upstream; no real city needs more than this.
  if (north - south > 1.5 || east - west > 1.5) return false;
  return true;
}

/** Extracts the caller's IP, trusting only the entry Vercel appended. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const rightmost = (raw: string | null): string | null => {
    if (!raw) return null;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const value = parts[parts.length - 1];
    return /^[0-9a-f:.]{3,45}$/i.test(value) ? value : null;
  };
  const pick = (name: string): string | null => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  return (
    rightmost(pick('x-vercel-forwarded-for')) ??
    rightmost(pick('x-forwarded-for')) ??
    rightmost(pick('x-real-ip')) ??
    'unknown'
  );
}
