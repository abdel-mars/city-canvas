import { useState, useCallback } from 'react';
import { City, Road } from '@/types/artwork';
import { fetchRoads } from '@/lib/overpass';

export function useRoadData() {
  const [roads, setRoads] = useState<Road[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoads = useCallback(async (city: City) => {
    setIsLoading(true);
    setError(null);
    setRoads([]);

    try {
      const data = await fetchRoads(city.boundingBox);
      if (data.length === 0) {
        setError('No roads found for this area. Try a different city.');
      } else {
        setRoads(data);
      }
    } catch (e) {
      setError('Could not load roads. Please try again or choose a smaller city.');
      console.error('Road loading error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { roads, isLoading, error, loadRoads };
}
