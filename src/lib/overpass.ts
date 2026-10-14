import { Road } from '@/types/artwork';

export type BBox = [number, number, number, number];

export interface RoadResponse {
  roads: Road[];
  /**
   * The window these roads actually cover.
   *
   * Not necessarily the one that was asked for. The proxy starts from the city's own extent and
   * shrinks only when Overpass cannot carry it, so a megacity can legitimately come back smaller
   * than requested. Projecting with the requested box instead would shrink the artwork into a
   * corner of the canvas and misrepresent where the roads are — the caller must use this one.
   */
  bbox: BBox;
  /** The network hit our own way/point ceiling, so the map is a partial view of the window. */
  truncated: boolean;
}

/**
 * Road geometry is fetched from our own serverless proxy rather than Overpass directly.
 *
 * Overpass refuses browser clients (its front end returns a 406 whose error page carries no CORS
 * headers, which surfaces in the console as a misleading CORS error), and it requires a
 * descriptive User-Agent that browsers are forbidden from setting. The proxy also caches, so a
 * given city is fetched upstream once rather than once per visitor.
 */
export async function fetchRoads(bbox: BBox, signal?: AbortSignal): Promise<RoadResponse> {
  const res = await fetch('/api/geo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'roads', bbox }),
    signal,
  });

  if (!res.ok) {
    const error = new Error('Failed to fetch road data') as Error & { code?: string };
    if (res.status === 429) error.code = 'rate_limited';
    else if (res.status === 503) error.code = 'upstream_unavailable';
    else if (res.status === 400) error.code = 'bbox_too_large';
    else error.code = 'bad_request';
    throw error;
  }

  const data = (await res.json()) as Partial<RoadResponse>;

  // Fall back to the requested box so a proxy that has not yet learned to report its window still
  // renders correctly — a wrong-but-plausible box beats a crash.
  const effective: BBox = Array.isArray(data.bbox) && data.bbox.length === 4
    ? (data.bbox as BBox)
    : bbox;

  return {
    roads: data.roads ?? [],
    bbox: effective,
    truncated: data.truncated === true,
  };
}