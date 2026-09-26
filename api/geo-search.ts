import {
  fetchNominatim,
  cacheGet,
  cacheSet,
  rateLimited,
  singleFlight,
  clientIp,
  type City,
} from '../server/geo-upstream';

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

const FRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const STALE_TTL_SEC = 90 * 24 * 60 * 60;

const REQUESTS_PER_HOUR = 60;

interface NominatimResult {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
}

/** Strips control characters and collapses whitespace before the query leaves our server. */
export function normaliseQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > 90) return null;
  return cleaned;
}

/** Maps a Nominatim result onto the app's own City shape, server-side. */
export function toCity(r: NominatimResult): City | null {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!Array.isArray(r.boundingbox) || r.boundingbox.length !== 4) return null;

  const bb = r.boundingbox.map(Number);
  if (!bb.every(Number.isFinite)) return null;

  const displayName = r.display_name ?? '';
  const addr = (r as { address?: Record<string, string> }).address;
  const name = addr?.city || addr?.town || addr?.village || r.name || displayName.split(',')[0] || '';

  return {
    name,
    displayName,
    lat,
    lon,
    // Nominatim orders boundingbox as south, north, west, east.
    boundingBox: [bb[0], bb[2], bb[1], bb[3]],
  };
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

  const raw = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const q = normaliseQuery((raw as { q?: unknown } | null)?.q);

  if (!q) {
    res.status(400).json({ error: 'invalid_query' });
    return;
  }

  const key = `geo:search:v2:${q.toLowerCase()}`;
  const cached = await cacheGet<City[]>(key);
  if (cached?.fresh) {
    res.status(200).json({ cities: cached.value, cached: true });
    return;
  }

  const ip = clientIp(req.headers);
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
      const again = await cacheGet<City[]>(key);
      if (again?.fresh) return again.value;

      const data = (await fetchNominatim(q)) as NominatimResult[];
      const list = (Array.isArray(data) ? data : [])
        .map(toCity)
        .filter((c): c is City => c !== null && c.name.length > 0);

      await cacheSet(key, list, FRESH_TTL_SEC, STALE_TTL_SEC);
      return list;
    });

    res.status(200).json({ cities, cached: false });
  } catch (err) {
    console.error('geo-search failed:', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'upstream_unavailable' });
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
