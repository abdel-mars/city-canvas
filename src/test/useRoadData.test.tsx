import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoadData } from '@/hooks/useRoadData';
import type { City } from '@/types/artwork';

/**
 * The failure this suite exists for: loadRoads used to apply whichever response landed last, so
 * picking city A and then city B while A was still in flight could render A's street network under
 * B's name — and, because the poster carries that name, it could be printed and sold that way.
 */

const city = (name: string, lon: number): City => ({
  name,
  displayName: `${name}, Somewhere`,
  lat: 0,
  lon,
  boundingBox: [-0.05, lon - 0.05, 0.05, lon + 0.05],
});

const LISBON = city('Lisbon', -9.14);
const PORTO = city('Porto', -8.61);

const roadsFor = (lon: number) => [
  {
    id: 1,
    type: 'primary',
    geometry: [
      [0, lon],
      [0.01, lon + 0.01],
    ] as [number, number][],
  },
];

/** A response whose body is only delivered when the test says so. */
function deferredRoadResponse(lon: number) {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const body = JSON.stringify({ roads: roadsFor(lon), bbox: [-0.05, lon - 0.05, 0.05, lon + 0.05], truncated: false });
  const response = new Promise<Response>((resolve) => {
    void gate.then(() =>
      resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
  });
  return {
    promise: response,
    release: () => release?.(),
  };
}

beforeEach(() => {
  // Each test gets a clean module-level road cache, keyed by bounding box.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRoadData', () => {
  it('keeps the newest city when an earlier request resolves last', async () => {
    const lisbon = deferredRoadResponse(LISBON.lon);
    const porto = deferredRoadResponse(PORTO.lon);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String((init?.body as string) ?? '{}')) as { bbox: number[] };
        return body.bbox[1] < -9 ? lisbon.promise : porto.promise;
      }),
    );

    const { result } = renderHook(() => useRoadData());

    // Lisbon first, Porto second — the classic "picked the wrong one and hit back" flow.
    await act(async () => {
      void result.current.loadRoads(LISBON);
      void result.current.loadRoads(PORTO);
    });

    // Porto answers first, then the stale Lisbon response arrives and must be ignored.
    await act(async () => {
      porto.release();
      await Promise.resolve();
    });
    await act(async () => {
      lisbon.release();
      await Promise.resolve();
    });

    // The artwork must be Porto's, not the late arrival from Lisbon.
    expect(result.current.bbox?.[1]).toBeCloseTo(PORTO.lon - 0.05, 6);
    expect(result.current.roads[0]?.geometry[0][1]).toBeCloseTo(PORTO.lon, 6);
  });

  it('reports the window the proxy actually used, not the one requested', async () => {
    // Tokyo asked for at its own extent, answered at the floor Overpass could carry. The caller
    // projects with this, so it has to be the effective box.
    const effective = [35.6512, 139.6253, 35.7012, 139.6753];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ roads: roadsFor(139.65), bbox: effective, truncated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { result } = renderHook(() => useRoadData());
    await act(async () => {
      await result.current.loadRoads({
        name: 'Tokyo',
        displayName: 'Tokyo, Japan',
        lat: 35.6762,
        lon: 139.6503,
        boundingBox: [35.5012, 139.4753, 35.8512, 139.8253],
      });
    });

    expect(result.current.bbox).toEqual(effective);
    expect(result.current.roads).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces truncation rather than passing off a partial map as complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ roads: roadsFor(2.35), truncated: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { result } = renderHook(() => useRoadData());
    await act(async () => {
      await result.current.loadRoads(city('Paris', 2.35));
    });

    expect(result.current.truncated).toBe(true);
  });

  it('does not let a superseded request overwrite a cached city with an error', async () => {
    // Porto is cached from an earlier visit, so selecting it resolves synchronously. A slower
    // Lisbon request must not then clobber it with its own failure.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String((init?.body as string) ?? '{}')) as { bbox: number[] };
        if (body.bbox[1] < -9) {
          return new Response(JSON.stringify({ error: 'upstream_unavailable' }), { status: 503 });
        }
        return new Response(
          JSON.stringify({ roads: roadsFor(PORTO.lon), bbox: PORTO.boundingBox, truncated: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const { result } = renderHook(() => useRoadData());
    await act(async () => {
      await result.current.loadRoads(PORTO);
    });
    expect(result.current.roads).toHaveLength(1);

    await act(async () => {
      void result.current.loadRoads(LISBON);
      void result.current.loadRoads(PORTO);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.roads).toHaveLength(1);
    expect(result.current.roads[0]?.geometry[0][1]).toBeCloseTo(PORTO.lon, 6);
  });
});