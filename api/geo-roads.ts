import {
  fetchOverpass,
  simplifyLine,
  cacheGet,
  cacheSet,
  rateLimited,
  singleFlight,
  isValidBbox,
  clientIp,
  type CompactRoad,
  type Point,
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

const EPSILON = 0.00005; // ~5 m at the equator, unchanged from the old client value
const MAX_WAYS = 3000;
const MAX_POINTS = 200_000;

const FRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const STALE_TTL_SEC = 30 * 24 * 60 * 60; // 30 days, used only when rate-limited

const REQUESTS_PER_HOUR = 60;

const HIGHWAY_RE =
  '^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$';

interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function buildQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  return `[out:json][timeout:20][maxsize:8388608];(way["highway"~"${HIGHWAY_RE}"](${south},${west},${north},${east}););out geom;`;
}

function cacheKey(bbox: [number, number, number, number]): string {
  return `geo:roads:v2:${bbox.map((n) => n.toFixed(4)).join(',')}`;
}

/** Simplifies and compacts the raw Overpass payload. */
export function transformRoads(data: unknown): { roads: CompactRoad[]; truncated: boolean } {
  const elements = ((data as { elements?: unknown[] } | null)?.elements ?? []) as OverpassWay[];
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

  if (truncated) {
    console.warn(`transformRoads: truncated at ${roads.length} ways / ${points} points`);
  }
  return { roads, truncated };
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

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as { bbox?: unknown } | null;
  const bbox = body?.bbox;

  if (!isValidBbox(bbox)) {
    res.status(400).json({ error: 'invalid_bbox' });
    return;
  }

  const key = cacheKey(bbox);
  const cached = await cacheGet<CompactRoad[]>(key);
  if (cached?.fresh) {
    res.status(200).json({ roads: cached.value, cached: true });
    return;
  }

  const ip = clientIp(req.headers);
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
    const roads = await singleFlight(key, async () => {
      // Another request may have filled the cache while we waited on the limiter.
      const again = await cacheGet<CompactRoad[]>(key);
      if (again?.fresh) return again.value;

      const data = await fetchOverpass(buildQuery(bbox));
      const { roads: list } = transformRoads(data);
      await cacheSet(key, list, FRESH_TTL_SEC, STALE_TTL_SEC);
      return list;
    });

    res.status(200).json({ roads, cached: false });
  } catch (err) {
    console.error('geo-roads failed:', err instanceof Error ? err.message : err);
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
