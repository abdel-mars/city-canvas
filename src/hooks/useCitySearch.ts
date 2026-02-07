import { useState, useCallback, useRef } from 'react';
import { City } from '@/types/artwork';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export function useCitySearch() {
  const [results, setResults] = useState<City[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (query.length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({
          q: query,
          format: 'json',
          limit: '5',
          addressdetails: '1',
        });

        const response = await fetch(`${NOMINATIM_URL}?${params}`, {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en' },
        });

        const data = await response.json();

        const cities: City[] = data
          .filter((r: any) => r.boundingbox)
          .map((r: any) => ({
            name:
              r.address?.city ||
              r.address?.town ||
              r.address?.village ||
              r.name ||
              r.display_name.split(',')[0],
            displayName: r.display_name,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            boundingBox: [
              parseFloat(r.boundingbox[0]),
              parseFloat(r.boundingbox[2]),
              parseFloat(r.boundingbox[1]),
              parseFloat(r.boundingbox[3]),
            ] as [number, number, number, number],
          }));

        setResults(cities);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Search error:', e);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const clearResults = useCallback(() => setResults([]), []);

  return { results, isSearching, search, clearResults };
}
