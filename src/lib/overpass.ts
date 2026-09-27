import { Road } from '@/types/artwork';

export type BBox = [number, number, number, number];

/**
 * Road geometry is fetched from our own serverless proxy rather than Overpass directly.
 *
 * Overpass refuses browser clients (its front end returns a 406 whose error page carries no CORS
 * headers, which surfaces in the console as a misleading CORS error), and it requires a
 * descriptive User-Agent that browsers are forbidden from setting. The proxy also caches, so a
 * given city is fetched upstream once rather than once per visitor.
 */
export async function fetchRoads(bbox: BBox): Promise<Road[]> {
  const res = await fetch('/api/geo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'roads', bbox }),
  });

  if (!res.ok) {
    const error = new Error('Failed to fetch road data') as Error & { code?: string };
    if (res.status === 429) error.code = 'rate_limited';
    else if (res.status === 503) error.code = 'upstream_unavailable';
    else if (res.status === 400) error.code = 'bbox_too_large';
    else error.code = 'bad_request';
    throw error;
  }

  const data = (await res.json()) as { roads?: Road[] };
  return data.roads ?? [];
}
