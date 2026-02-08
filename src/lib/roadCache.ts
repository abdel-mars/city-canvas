import { Road } from '@/types/artwork';

const cache = new Map<string, Road[]>();

export function getCacheKey(bbox: [number, number, number, number]): string {
  return bbox.map(n => n.toFixed(4)).join(',');
}

export function getCachedRoads(bbox: [number, number, number, number]): Road[] | undefined {
  return cache.get(getCacheKey(bbox));
}

export function setCachedRoads(bbox: [number, number, number, number], roads: Road[]): void {
  cache.set(getCacheKey(bbox), roads);
  // Keep cache under 20 entries
  if (cache.size > 20) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}
