import { Road } from '@/types/artwork';
import type { BBox } from '@/lib/overpass';

/**
 * In-memory roads, keyed by the window the proxy actually returned.
 *
 * Keyed by the effective box rather than the requested one because that is what the roads cover.
 * Caching under the requested key would hand back a map that belongs to a different area the next
 * time the same city resolves to a different window.
 */
export interface CachedRoads {
  roads: Road[];
  bbox: BBox;
  truncated: boolean;
}

const cache = new Map<string, CachedRoads>();

export function getCacheKey(bbox: [number, number, number, number]): string {
  return bbox.map(n => n.toFixed(4)).join(',');
}

export function getCachedRoads(bbox: [number, number, number, number]): CachedRoads | undefined {
  return cache.get(getCacheKey(bbox));
}

export function setCachedRoads(bbox: [number, number, number, number], entry: CachedRoads): void {
  cache.set(getCacheKey(bbox), entry);
  // Keep cache under 20 entries
  if (cache.size > 20) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}