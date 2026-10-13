import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCitySearch, describeSearchError } from '@/hooks/useCitySearch';

/**
 * The point of this suite is that a broken search is never again indistinguishable from a
 * working one that found nothing. Every failure mode has to surface as a distinct error kind.
 */

function stubFetch(response: Response | (() => Response)) {
  const impl = typeof response === 'function' ? response : () => response;
  const mock = vi.fn(async () => impl());
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Type a query and let the 400ms debounce fire. */
async function type(hook: { search: (q: string) => void }, query: string) {
  await act(async () => {
    hook.search(query);
    vi.advanceTimersByTime(500);
  });
}

describe('describeSearchError', () => {
  it('tells the user how to fix a missing local API', () => {
    expect(describeSearchError({ kind: 'no_api', message: '' })).toMatch(/npm run dev/);
  });

  it('names the variable that is missing when unconfigured', () => {
    expect(describeSearchError({ kind: 'unconfigured', message: '' })).toMatch(/GEOCONTACT/);
  });

  it('distinguishes a rate limit from an outage', () => {
    const limited = describeSearchError({ kind: 'rate_limited', message: '' });
    const outage = describeSearchError({ kind: 'upstream_unavailable', message: '' });
    expect(limited).not.toBe(outage);
    expect(limited).toMatch(/too many/i);
  });
});

describe('useCitySearch', () => {
  it('reports cities on a successful response', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          cities: [
            {
              name: 'Lisbon',
              displayName: 'Lisbon, Portugal',
              lat: 38.7,
              lon: -9.1,
              boundingBox: [38.6, -9.2, 38.8, -9.0],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'lisbon');

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.results[0].name).toBe('Lisbon');
  });

  /**
   * The local-development trap this replaces: `npm run dev:ui` serves no /api route, so the
   * response is the SPA's HTML. Previously that produced a blank dropdown with no explanation.
   */
  it('flags a non-JSON response as a missing API', async () => {
    stubFetch(new Response('<!doctype html><html></html>', { status: 200 }));
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'lisbon');

    await waitFor(() => expect(result.current.error?.kind).toBe('no_api'));
    expect(result.current.results).toEqual([]);
  });

  it('flags a rate limit', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'rate_limited', retry_after: 42 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'lisbon');

    await waitFor(() => expect(result.current.error?.kind).toBe('rate_limited'));
    expect(result.current.error?.status).toBe(429);
  });

  it('flags a missing GEOCONTACT separately from an upstream outage', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'unconfigured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'lisbon');

    await waitFor(() => expect(result.current.error?.kind).toBe('unconfigured'));
  });

  it('flags an upstream outage', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'lisbon');

    await waitFor(() => expect(result.current.error?.kind).toBe('upstream_unavailable'));
  });

  it('treats an empty result list as success, not an error', async () => {
    stubFetch(
      new Response(JSON.stringify({ cities: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'zzzzzz');

    await waitFor(() => expect(result.current.results).toEqual([]));
    // "Nothing matched" is a valid answer and must not be dressed up as a failure.
    expect(result.current.error).toBeNull();
  });

  it('does not search a single character', async () => {
    const mock = stubFetch(new Response(JSON.stringify({ cities: [] }), { status: 200 }));
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'a');

    expect(mock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('clears results and error on demand', async () => {
    stubFetch(
      new Response(JSON.stringify({ cities: [{ name: 'Porto', displayName: 'Porto', lat: 41, lon: -8, boundingBox: [40.9, -8.2, 41.2, -7.9] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useCitySearch());
    await type(result.current, 'porto');
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    act(() => result.current.clearResults());
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});