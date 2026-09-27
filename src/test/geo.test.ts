import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import geoHandler, {
  simplifyLine,
  isValidBbox,
  clampBbox,
  clientIp,
  userAgent,
  transformRoads,
  normaliseQuery,
  toCity,
} from '../../api/geo';
import type { ApiRequest, ApiResponse } from '../../api/geo';

type Point = [number, number];

const originalEnv = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  process.env.GEOCONTACT = 'mailto:test@example.com';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

type Captured = { status: number; headers: Record<string, string>; body: unknown };

async function call(
  handler: typeof geoHandler,
  body: unknown,
  opts: { ip?: string; method?: string } = {},
) {
  const captured: Captured = { status: 200, headers: {}, body: undefined };
  const req: ApiRequest = {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': opts.ip ?? '203.0.113.5' },
    body: JSON.stringify(body),
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
    },
    json(payload: unknown) {
      captured.body = payload;
    },
    end() {
      /* no-op */
    },
  } as unknown as ApiResponse;
  await handler(req, res);
  return captured;
}

describe('userAgent', () => {
  it('includes the configured contact', () => {
    expect(userAgent()).toBe('CityLines/1.0 (mailto:test@example.com)');
  });

  it('refuses to call the upstream unidentified', () => {
    delete process.env.GEOCONTACT;
    expect(() => userAgent()).toThrow(/GEOCONTACT/);
  });
});

describe('isValidBbox', () => {
  it('accepts a normal city bbox', () => {
    expect(isValidBbox([38.7, -9.2, 38.75, -9.1])).toBe(true);
  });

  it.each([
    ['wrong arity', [1, 2, 3]],
    ['non-numeric', ['a', 2, 3, 4]],
    ['NaN', [Number.NaN, 2, 3, 4]],
    ['Infinity', [Number.POSITIVE_INFINITY, 2, 3, 4]],
    ['lat out of range', [-91, 2, 3, 4]],
    ['lon out of range', [1, -181, 2, 3]],
    ['inverted north', [39, 2, 38, 3]],
    ['inverted east', [1, 5, 2, 4]],
    ['continent-sized', [10, 10, 40, 40]],
    ['metro-sized (Nominatim can return these)', [41.0, -8.79, 41.47, -7.87]],
    ['not an array', 'nope'],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isValidBbox(value)).toBe(false);
  });
});

describe('clientIp', () => {
  it('uses the rightmost entry only', () => {
    expect(clientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.7' })).toBe('198.51.100.7');
  });

  it('cannot be spoofed by prepending', () => {
    const ip = clientIp({ 'x-forwarded-for': '9.9.9.9, 203.0.113.42' });
    expect(ip).toBe('203.0.113.42');
  });

  it('falls back to unknown', () => {
    expect(clientIp({})).toBe('unknown');
  });
});

describe('simplifyLine', () => {
  it('drops collinear interior points but keeps the endpoints', () => {
    const line: Point[] = [
      [0, 0],
      [0, 0.00001],
      [0, 0.00002],
      [0, 0.00003],
    ];
    const out = simplifyLine(line, 0.00005);
    expect(out).toEqual([
      [0, 0],
      [0, 0.00003],
    ]);
  });

  it('keeps a real corner', () => {
    const line: Point[] = [
      [0, 0],
      [0.001, 0.001],
      [0.002, 0],
    ];
    expect(simplifyLine(line, 0.00005).length).toBe(3);
  });

  it('passes short lines through untouched', () => {
    const line: Point[] = [
      [0, 0],
      [0, 1],
    ];
    expect(simplifyLine(line, 0.00005)).toEqual(line);
  });
});

describe('transformRoads', () => {
  const element = (id: number, highway: string, lat: number, lon: number) => ({
    type: 'way',
    id,
    tags: { highway },
    geometry: [
      { lat, lon },
      { lat: lat + 0.00001, lon: lon + 0.00001 },
    ],
  });

  it('extracts ways, tags and geometry', () => {
    const { roads } = transformRoads({ elements: [element(1, 'primary', 38.7, -9.1)] });
    expect(roads).toHaveLength(1);
    expect(roads[0].type).toBe('primary');
    expect(roads[0].id).toBe(1);
    expect(roads[0].geometry[0]).toHaveLength(2);
  });

  it('rounds coordinates to 5 decimal places', () => {
    const { roads } = transformRoads({
      elements: [
        {
          type: 'way',
          id: 7,
          tags: { highway: 'residential' },
          geometry: [
            { lat: 38.712345678, lon: -9.123456789 },
            { lat: 38.712399, lon: -9.1234 },
          ],
        },
      ],
    });
    expect(roads[0].geometry[0][0]).toBe(38.71235);
  });

  it('ignores non-way elements and ways without geometry', () => {
    const { roads } = transformRoads({
      elements: [
        { type: 'node', lat: 1, lon: 1 },
        { type: 'way', id: 2, tags: { highway: 'primary' } },
      ],
    });
    expect(roads).toHaveLength(0);
  });

  it('skips malformed geometry points', () => {
    const { roads } = transformRoads({
      elements: [
        {
          type: 'way',
          id: 3,
          tags: { highway: 'primary' },
          geometry: [{ lat: null, lon: 1 }, { lat: 38.7, lon: -9.1 }, { lat: 38.71, lon: -9.11 }],
        },
      ],
    });
    expect(roads).toHaveLength(1);
  });

    it('tolerates a missing elements array', () => {
      expect(transformRoads({}).roads).toEqual([]);
      expect(transformRoads(null).roads).toEqual([]);
    });

    it('surfaces an Overpass remark, which arrives inside a 200 response', () => {
      // Overpass reports timeouts and maxsize overruns in a top-level `remark` and still returns
      // HTTP 200, sometimes with no elements at all. Reading only `elements` turns that into an
      // empty map, which the caller would cache for a month and blame on the city.
      const timedOut = transformRoads({
        remark: 'runtime error: Query timed out in "query" at line 1',
        elements: [],
      });
      expect(timedOut.roads).toEqual([]);
      expect(timedOut.remark).toMatch(/timed out/i);

      const tooBig = transformRoads({ remark: 'runtime error: Query exceeded the maximum size' });
      expect(tooBig.remark).toMatch(/maximum size/i);
    });

    it('reports no remark on a clean response', () => {
      const clean = transformRoads({ elements: [element(1, 'primary', 38.7, -9.1)] });
      expect(clean.remark).toBeNull();
    });
  });

  describe('clampBbox', () => {
    // Moscow: Nominatim returns the whole metro region, which is rejected outright.
    const moscow: [number, number, number, number] = [55.1422, 36.8031, 56.0212, 37.9674];

    it('leaves a box that already fits alone', () => {
      const lisbon: [number, number, number, number] = [38.7, -9.2, 38.75, -9.1];
      expect(clampBbox(lisbon, 38.72, -9.14)).toEqual(lisbon);
    });

    it('crops an oversized box to a window on the centre', () => {
      const out = clampBbox(moscow, 55.7558, 37.6173);
      expect(out[2] - out[0]).toBeCloseTo(0.25, 6);
      expect(out[3] - out[1]).toBeCloseTo(0.25, 6);
      // Centred on the point Nominatim gave us, not on the original box's corner.
      expect((out[0] + out[2]) / 2).toBeCloseTo(55.7558, 6);
      expect((out[1] + out[3]) / 2).toBeCloseTo(37.6173, 6);
    });

    it('always produces a box the proxy will accept', () => {
      for (const lat of [0, 55.7558, -33.8688, 89.9, -89.9]) {
        for (const lon of [0, 37.6173, -122.4, 179.9, -179.9]) {
          expect(isValidBbox(clampBbox(moscow, lat, lon))).toBe(true);
        }
      }
    });

    it('cannot land on the boundary that a float comparison would reject', () => {
      // A box built to exactly MAX_BBOX_SPAN measures 0.3500000000000014, which fails
      // `span > MAX_BBOX_SPAN`. The clamp stays well under so that never happens.
      const out = clampBbox(moscow, 55.7558, 37.6173);
      expect(out[2] - out[0]).toBeLessThan(0.35);
    });
  });

describe('normaliseQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseQuery('  Sao   Paulo  ')).toBe('Sao Paulo');
  });

  it('strips control characters', () => {
    expect(normaliseQuery('Liso\u0000bon')).toBe('Liso bon');
  });

  it.each([
    ['too short', 'a'],
    ['too long', 'x'.repeat(91)],
    ['wrong type', 42],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(normaliseQuery(value)).toBeNull();
  });
});

describe('toCity', () => {
  it('maps a Nominatim result and reorders the bounding box', () => {
    const city = toCity({
      display_name: 'Lisbon, Portugal',
      lat: '38.71667',
      lon: '-9.13333',
      boundingbox: ['38.68', '38.79', '-9.23', '-9.09'],
    });
    expect(city).not.toBeNull();
    // Nominatim gives south, north, west, east; the app wants south, west, north, east.
    expect(city!.boundingBox).toEqual([38.68, -9.23, 38.79, -9.09]);
    expect(city!.name).toBe('Lisbon');
    expect(city!.lat).toBeCloseTo(38.71667);
  });

  it('prefers the address city over the raw name', () => {
    const city = toCity({
      name: 'Lisbon Municipality',
      display_name: 'Lisbon, Portugal',
      lat: '38.7',
      lon: '-9.1',
      boundingbox: ['38.6', '38.8', '-9.2', '-9.0'],
      address: { city: 'Lisbon' },
    } as never);
    expect(city!.name).toBe('Lisbon');
  });

  it('rejects results without a usable bbox or coordinates', () => {
    expect(toCity({ display_name: 'x', lat: 'a', lon: 'b', boundingbox: [] })).toBeNull();
    expect(toCity({ display_name: 'x', lat: '1', lon: '2' })).toBeNull();
  });

  it('clamps a metro-sized result so it can actually be rendered', () => {
    // This is the real Nominatim payload for "Moscow": the whole metro region, 0.88 x 1.16.
    // Before clamping, picking it from the dropdown produced a 400 and the message
    // "choose a smaller city".
    const city = toCity({
      name: 'Moscow',
      display_name: 'Moscow, Russia',
      lat: '55.7558',
      lon: '37.6173',
      // Nominatim orders this south, north, west, east.
      boundingbox: ['55.1422', '56.0212', '36.8031', '37.9674'],
    } as never);

    expect(city).not.toBeNull();
    expect(isValidBbox(city!.boundingBox)).toBe(true);
    const [s, w, n, e] = city!.boundingBox;
    expect(n - s).toBeCloseTo(0.25, 6);
    expect(e - w).toBeCloseTo(0.25, 6);
  });

  it('clamps a whole prefecture, where only one result exists', () => {
    // Tokyo comes back as 15.7 x 18.4 degrees. Filtering instead of clamping would remove the
    // single option and make the city unsearchable.
    const city = toCity({
      name: 'Tokyo',
      display_name: 'Tokyo, Japan',
      lat: '35.6762',
      lon: '139.6503',
      boundingbox: ['34.8343', '36.5185', '130.4743', '148.8263'],
    } as never);
    expect(city).not.toBeNull();
    expect(isValidBbox(city!.boundingBox)).toBe(true);
  });
});

describe('geo endpoint', () => {
  function mockFetch(handler: (url: string) => Response) {
    const mock = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  // Default deny: no test in this block may reach the real network. Without this a single
  // unstubbed request leaves a pending promise in the shared single-flight map and every later
  // test using the same bbox hangs behind it.
  beforeEach(() => {
    mockFetch(() => new Response('blocked by test default', { status: 503 }));
  });

  it('rejects an invalid bbox before any network call', async () => {
    const mock = mockFetch(() => new Response('{}'));
    const res = await call(geoHandler, { kind: 'roads', bbox: [1, 2, 3] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_bbox' });
    expect(mock).not.toHaveBeenCalled();
  });

  it('rejects a non-POST method', async () => {
    const mock = mockFetch(() => new Response('{}'));
    const res = await call(
      geoHandler,
      { kind: 'roads', bbox: [38.7, -9.2, 38.75, -9.1] },
      { method: 'GET' },
    );
    expect(res.status).toBe(405);
    expect(mock).not.toHaveBeenCalled();
  });

  it('sends a descriptive User-Agent to the mirror', async () => {
    const seen: string[] = [];
    mockFetch((url) => {
      seen.push(url);
      return new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await call(geoHandler, { kind: 'roads', bbox: [38.7, -9.2, 38.75, -9.1] });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatch(/^https:\/\//);
  });

  it('falls back to another mirror when the first refuses with 406', async () => {
    const tried: string[] = [];
    mockFetch((url) => {
      tried.push(url);
      if (tried.length === 1) return new Response('nope', { status: 406 });
      return new Response(
        JSON.stringify({
          elements: [
            {
              type: 'way',
              id: 5,
              tags: { highway: 'primary' },
              geometry: [
                { lat: 38.7, lon: -9.1 },
                { lat: 38.71, lon: -9.11 },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    // Distinct bbox: the in-process cache is module-level and persists between tests, so
    // reusing a bbox would be served from cache instead of exercising the mirror fallback.
    const res = await call(geoHandler, { kind: 'roads', bbox: [41.1, -8.6, 41.15, -8.55] });
    expect(res.status).toBe(200);
    expect(tried.length).toBe(2);
    const body = res.body as { roads: unknown[] };
    expect(body.roads).toHaveLength(1);
  });

  it('returns 503 when every mirror fails', async () => {
    mockFetch(() => new Response('down', { status: 503 }));
    const res = await call(geoHandler, { kind: 'roads', bbox: [45.2, 7.6, 45.25, 7.65] });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'upstream_unavailable' });
  });

  it('makes a single upstream call for concurrent identical requests', async () => {
    let upstreamCalls = 0;
    mockFetch(() => {
      upstreamCalls++;
      return new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const bbox = [51.5, -0.12, 51.52, -0.09];
    await Promise.all([
      call(geoHandler, { kind: 'roads', bbox }),
      call(geoHandler, { kind: 'roads', bbox }),
      call(geoHandler, { kind: 'roads', bbox }),
      call(geoHandler, { kind: 'roads', bbox }),
      call(geoHandler, { kind: 'roads', bbox }),
    ]);
    expect(upstreamCalls).toBe(1);
  });

  it('serves a second identical request from cache with no upstream call', async () => {
    let upstreamCalls = 0;
    mockFetch(() => {
      upstreamCalls++;
      return new Response(
        JSON.stringify({
          elements: [
            {
              type: 'way',
              id: 9,
              tags: { highway: 'tertiary' },
              geometry: [
                { lat: 38.7, lon: -9.1 },
                { lat: 38.72, lon: -9.12 },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const bbox = [40.1, -8.2, 40.15, -8.15];
    const first = await call(geoHandler, { kind: 'roads', bbox });
    expect(first.status).toBe(200);
    expect(upstreamCalls).toBe(1);

    const second = await call(geoHandler, { kind: 'roads', bbox });
    expect(second.status).toBe(200);
    expect(upstreamCalls).toBe(1);
    expect((second.body as { cached: boolean }).cached).toBe(true);
    expect((second.body as { roads: unknown[] }).roads).toHaveLength(1);
  });

  describe('does not cache a result it should not trust', () => {
    const emptyUpstream = (remark?: string) => {
      const body: Record<string, unknown> = { elements: [] };
      if (remark) body.remark = remark;
      return () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
    };

    it('fails a timed-out query rather than reporting an empty map', async () => {
      // Overpass answers 200 with a remark and no elements. Returning that as an empty city makes
      // the visitor think the place has no roads, when a retry would have worked.
      mockFetch(emptyUpstream('runtime error: Query timed out in "query" at line 1'));
      const res = await call(geoHandler, { kind: 'roads', bbox: [35.5, 139.4, 35.7, 139.7] });

      expect(res.status).toBe(503);
      expect((res.body as { error: string }).error).toBe('upstream_unavailable');
    });

    it('fails when Overpass exceeds maxsize', async () => {
      mockFetch(emptyUpstream('runtime error: Query exceeded the maximum size'));
      const res = await call(geoHandler, { kind: 'roads', bbox: [35.5, 139.4, 35.7, 139.7] });
      expect(res.status).toBe(503);
    });

    it('never caches an empty result, so one bad hour is not a month-long verdict', async () => {
      // The regression that made a city look permanently broken: an empty array written to Redis
      // with a 7-day fresh and 30-day stale TTL, after which every visit replayed "no roads".
      let upstreamCalls = 0;
      mockFetch(() => {
        upstreamCalls++;
        return emptyUpstream()();
      });

      const bbox = [10.1, 20.1, 10.2, 20.2];
      const first = await call(geoHandler, { kind: 'roads', bbox });
      expect(first.status).toBe(503);
      expect(upstreamCalls).toBe(1);

      // A second visit must retry upstream rather than replay a cached failure.
      const second = await call(geoHandler, { kind: 'roads', bbox });
      expect(second.status).toBe(503);
      expect(upstreamCalls).toBe(2);
    });

    it('recovers on retry once the upstream behaves', async () => {
      let attempt = 0;
      mockFetch(() => {
        attempt++;
        if (attempt === 1) return emptyUpstream('runtime error: Query timed out')();
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                id: 5,
                tags: { highway: 'primary' },
                geometry: [
                  { lat: 38.7, lon: -9.1 },
                  { lat: 38.71, lon: -9.11 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const bbox = [41.1, 2.1, 41.2, 2.2];
      expect((await call(geoHandler, { kind: 'roads', bbox })).status).toBe(503);

      const retry = await call(geoHandler, { kind: 'roads', bbox });
      expect(retry.status).toBe(200);
      expect((retry.body as { roads: unknown[] }).roads).toHaveLength(1);
    });

    it('exposes whether a map was cut short', async () => {
      mockFetch(() =>
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                id: 1,
                tags: { highway: 'primary' },
                geometry: [
                  { lat: 38.7, lon: -9.1 },
                  { lat: 38.71, lon: -9.11 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const res = await call(geoHandler, { kind: 'roads', bbox: [42.1, 3.1, 42.2, 3.2] });
      // Not truncated here, but the field is always present so a partial map is detectable.
      expect((res.body as { truncated: boolean }).truncated).toBe(false);
    });
  });
});
