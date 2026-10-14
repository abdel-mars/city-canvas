import { useState, useCallback, useRef, useEffect } from 'react';
import { City, Road } from '@/types/artwork';
import { fetchRoads, type BBox } from '@/lib/overpass';
import { getCachedRoads, setCachedRoads, type CachedRoads } from '@/lib/roadCache';

export interface RoadData {
  roads: Road[];
  /** The city name as typed. Unrelated to the window the roads cover. */
  city: City | null;
  /**
   * The window the returned roads actually cover, which the proxy may have shrunk from the
   * requested city extent. Every projection must use this rather than `city.boundingBox`.
   */
  bbox: BBox | null;
  /** True when the proxy could not map the whole window; the artwork is a partial view. */
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Why a load failed, in terms the UI can act on.
 *
 * Thrown as a coded error by `fetchRoads` and translated here once, so every caller shows the same
 * message for the same cause.
 */
function describeRoadError(e: unknown): string {
  const code = (e as Error & { code?: string }).code;
  switch (code) {
    case 'rate_limited':
      return 'Too many map searches from this network. Please try again in a few minutes.';
    case 'upstream_unavailable':
      return 'Road data is temporarily unavailable. Please try again in a moment.';
    case 'bbox_too_large':
      // The proxy refused the area rather than failing. "Choose a smaller city" was useless:
      // the visitor cannot make a city smaller, and the only oversized boxes that still reach
      // here are hand-edited or pre-clamp gift links.
      return 'This map area is too large to render. Try searching for the city again.';
    default:
      return 'Could not load roads. Please try again in a moment.';
  }
}

const EMPTY: RoadData = {
  roads: [],
  city: null,
  bbox: null,
  truncated: false,
  isLoading: false,
  error: null,
};

export function useRoadData() {
  const [data, setData] = useState<RoadData>(EMPTY);

  /**
   * Guards against out-of-order responses.
   *
   * Without this, selecting city A and then city B while A is still in flight lets whichever
   * response happens to land last win — which renders one city's street network under another
   * city's name. The token is bumped on every load, and a response is applied only if it still
   * matches, so the newest request always owns the state. Requests are also aborted, so a
   * superseded city's payload is never even decoded.
   */
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Any in-flight load belongs to a city the user has since navigated away from.
  useEffect(() => {
    return () => {
      requestRef.current++;
      abortRef.current?.abort();
    };
  }, []);

  const loadRoads = useCallback(async (city: City) => {
    const token = ++requestRef.current;
    const isCurrent = () => token === requestRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Instant re-render on repeat visits. Upstream caching now happens in the proxy; this is
    // purely a UX nicety so a known city appears without a network round trip.
    const cached: CachedRoads | undefined = getCachedRoads(city.boundingBox);
    if (cached) {
      setData({
        roads: cached.roads,
        city,
        bbox: cached.bbox,
        truncated: cached.truncated,
        isLoading: false,
        error: null,
      });
      return;
    }

    setData({ roads: [], city, bbox: null, truncated: false, isLoading: true, error: null });

    try {
      const result = await fetchRoads(city.boundingBox, controller.signal);
      if (!isCurrent()) return;

      if (result.roads.length === 0) {
        setData({
          ...EMPTY,
          city,
          isLoading: false,
          error: 'No roads found for this area. Try a different city.',
        });
        return;
      }

      setCachedRoads(city.boundingBox, {
        roads: result.roads,
        bbox: result.bbox,
        truncated: result.truncated,
      });
      setData({
        roads: result.roads,
        city,
        bbox: result.bbox,
        truncated: result.truncated,
        isLoading: false,
        error: null,
      });
    } catch (e) {
      // A superseded request was aborted on purpose; its failure is not the user's problem.
      if ((e as Error).name === 'AbortError' || !isCurrent()) return;
      setData({
        ...EMPTY,
        city,
        isLoading: false,
        error: describeRoadError(e),
      });
      console.error('Road loading error:', e);
    }
  }, []);

  return {
    roads: data.roads,
    bbox: data.bbox,
    truncated: data.truncated,
    isLoading: data.isLoading,
    error: data.error,
    loadRoads,
  };
}