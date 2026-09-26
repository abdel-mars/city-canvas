import { useState, useCallback, useRef } from 'react';
import { City } from '@/types/artwork';

/**
 * City search runs through our own proxy rather than hitting Nominatim from the browser.
 * Nominatim requires an identifying User-Agent (browsers cannot set one) and asks clients to
 * keep request volume low, which the proxy's cache and rate limit enforce.
 */
export function useCitySearch() {
  const [results, setResults] = useState<City[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/geo-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query.trim() }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setResults([]);
          return;
        }

        const data = (await res.json()) as { cities?: City[] };
        setResults(Array.isArray(data.cities) ? data.cities : []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Search error:', e);
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  const clearResults = useCallback(() => setResults([]), []);

  return { results, isSearching, search, clearResults };
}
