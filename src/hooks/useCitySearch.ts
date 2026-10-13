import { useState, useCallback, useRef } from 'react';
import { City } from '@/types/artwork';

/**
 * Why a search failed, in terms the UI can act on.
 *
 * These used to be indistinguishable. Every failure cleared the result list and returned, so a
 * rate limit, an upstream outage, a missing API locally and "still typing" all rendered as the
 * same empty dropdown — which made a working feature look broken.
 */
export type SearchErrorKind =
  /** The response was not our JSON at all — the API is not reachable from this page. */
  | 'no_api'
  /** The proxy is refusing calls because it has no identifying contact for OpenStreetMap. */
  | 'unconfigured'
  /** 429. The proxy caps requests per IP, shared between search and road loading. */
  | 'rate_limited'
  /** 503 from Nominatim or Overpass being down or slow. */
  | 'upstream_unavailable'
  /** Any other non-OK status. */
  | 'request_failed'
  /** The query itself was rejected. */
  | 'invalid_query';

export interface SearchError {
  kind: SearchErrorKind;
  /** HTTP status, when there was one. */
  status?: number;
  message: string;
}

/** Short, specific copy. "No results" is a different situation from "the search is broken". */
export function describeSearchError(error: SearchError): string {
  switch (error.kind) {
    case 'no_api':
      return 'City search needs the API. Use npm run dev, not npm run dev:ui.';
    case 'unconfigured':
      return 'City search is not configured. Set GEOCONTACT in .env and restart.';
    case 'rate_limited':
      return 'Too many searches. Try again in a minute.';
    case 'upstream_unavailable':
      return 'The map service is not responding. Try again shortly.';
    case 'invalid_query':
      return 'Type at least two characters.';
    default:
      return 'Search failed. Try again.';
  }
}

interface GeoResponse {
  cities?: City[];
  error?: string;
}

/**
 * City search runs through our own proxy rather than hitting Nominatim from the browser.
 * Nominatim requires an identifying User-Agent (browsers cannot set one) and asks clients to
 * keep request volume low, which the proxy's cache and rate limit enforce.
 */
export function useCitySearch() {
  const [results, setResults] = useState<City[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback((status: number | undefined, kind: SearchErrorKind, message: string) => {
    setResults([]);
    setError({ kind, status, message: describeSearchError({ kind, status, message }) });
  }, []);

  const search = useCallback(
    (query: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      if (query.trim().length < 2) {
        setResults([]);
        setError(null);
        return;
      }

      timerRef.current = setTimeout(async () => {
        setIsSearching(true);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const res = await fetch('/api/geo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'search', q: query.trim() }),
            signal: controller.signal,
          });

          // Read the body once. It is needed both to classify the failure and to render results,
          // and a stream can only be consumed a single time.
          const raw = await res.text();

          let data: GeoResponse | null = null;
          try {
            data = raw ? (JSON.parse(raw) as GeoResponse) : null;
          } catch {
            data = null;
          }

          if (!data) {
            // HTML rather than JSON means something other than our function answered. Running the
            // Vite dev server alone is the usual cause: it has no /api route and returns the SPA.
            fail(res.status, 'no_api', 'response was not JSON');
            return;
          }

          if (!res.ok) {
            const code = data.error;
            // The error code is checked before the status, because several distinct failures all
            // arrive as 503 and only the code tells them apart.
            if (code === 'rate_limited') fail(res.status, 'rate_limited', code);
            else if (code === 'unconfigured') fail(res.status, 'unconfigured', code);
            else if (code === 'upstream_unavailable')
              fail(res.status, 'upstream_unavailable', code);
            else if (code === 'invalid_query') fail(res.status, 'invalid_query', code);
            else if (res.status === 429) fail(res.status, 'rate_limited', `HTTP ${res.status}`);
            else if (res.status === 503) fail(res.status, 'upstream_unavailable', `HTTP ${res.status}`);
            else fail(res.status, 'request_failed', code ?? `HTTP ${res.status}`);
            return;
          }

          setResults(Array.isArray(data.cities) ? data.cities : []);
          setError(null);
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            console.error('Search error:', e);
            setResults([]);
            setError({
              kind: 'request_failed',
              message: describeSearchError({ kind: 'request_failed', message: String(e) }),
            });
          }
        } finally {
          setIsSearching(false);
        }
      }, 400);
    },
    [fail],
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, isSearching, error, search, clearResults };
}