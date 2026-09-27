import { useState, useCallback } from 'react';
import { City, Road } from '@/types/artwork';
import { fetchRoads } from '@/lib/overpass';
import { getCachedRoads, setCachedRoads } from '@/lib/roadCache';

export function useRoadData() {
  const [roads, setRoads] = useState<Road[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoads = useCallback(async (city: City) => {
    setError(null);

    // Instant re-render on repeat visits. Upstream caching now happens in the proxy; this is
    // purely a UX nicety so a known city appears without a network round trip.
    const cached = getCachedRoads(city.boundingBox);
    if (cached) {
      setRoads(cached);
      return;
    }

    setIsLoading(true);
    setRoads([]);

    try {
      const data = await fetchRoads(city.boundingBox);
      if (data.length === 0) {
        setError('No roads found for this area. Try a different city.');
      } else {
        setCachedRoads(city.boundingBox, data);
        setRoads(data);
      }
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'rate_limited') {
        setError('Too many map searches from this network. Please try again in a few minutes.');
      } else if (code === 'upstream_unavailable') {
        setError('Road data is temporarily unavailable. Please try again in a moment.');
      } else if (code === 'bbox_too_large') {
        // The proxy refused the area rather than failing. "Choose a smaller city" was useless:
        // the visitor cannot make a city smaller, and the only oversized boxes that still reach
        // here are hand-edited or pre-clamp gift links.
        setError('This map area is too large to render. Try searching for the city again.');
      } else {
        setError('Could not load roads. Please try again in a moment.');
      }
      console.error('Road loading error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { roads, isLoading, error, loadRoads };
}
