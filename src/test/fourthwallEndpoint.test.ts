import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler, { clientIp, isPlausibleBase64, isOversizeBase64 } from '../../api/create-fourthwall';
import type { ApiRequest, ApiResponse } from '../../api/create-fourthwall';

const originalEnv = { ...process.env };

function makeRes() {
  const rec = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { rec.status = code; return this; },
    setHeader(k: string, v: string) { rec.headers[k] = v; },
    json(body: unknown) { rec.body = body; },
    end() {},
  } as unknown as ApiResponse;
  return { rec, res };
}

beforeEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; });
afterEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, originalEnv); });

describe('clientIp', () => {
  it('uses the rightmost forwarded entry', () => {
    expect(clientIp({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.7' })).toBe('198.51.100.7');
  });
  it('falls back to unknown without usable address', () => {
    expect(clientIp({})).toBe('unknown');
  });
});

describe('isPlausibleBase64', () => {
  it('rejects empty', () => expect(isPlausibleBase64('')).toBe(false));
  it('rejects oversize', () => expect(isOversizeBase64('A'.repeat(4_000_004))).toBe(true));
});

describe('endpoint: config', () => {
  it('fails closed when Fourthwall credentials missing', async () => {
    const { res, rec } = makeRes();
    const req: ApiRequest = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
    await handler(req, res);
    expect(rec.status).toBe(500);
  });
  it('rejects GET with 405', async () => {
    Object.assign(process.env, { FOURTHWALL_API_USERNAME: 'u', FOURTHWALL_API_PASSWORD: 'p', FOURTHWALL_SHOP_DOMAIN: 'shop.fourthwall.com', UPSTASH_REDIS_REST_URL: 'https://r', UPSTASH_REDIS_REST_TOKEN: 't', APP_ORIGIN: 'http://localhost:8080' });
    const { res, rec } = makeRes();
    const req: ApiRequest = { method: 'GET', headers: { 'content-type': 'application/json' } };
    await handler(req, res);
    expect(rec.status).toBe(405);
  });
  it('answers the background trigger only when the secret matches', async () => {
    Object.assign(process.env, { FOURTHWALL_API_USERNAME: 'u', FOURTHWALL_API_PASSWORD: 'p', FOURTHWALL_SHOP_DOMAIN: 'shop.fourthwall.com', APP_ORIGIN: 'http://localhost:8080' });

    const { res: pub, rec: pubRec } = makeRes();
    await handler({ method: 'GET', headers: {} }, pub);
    expect(pubRec.status).toBe(405);

    const { res: bg, rec: bgRec } = makeRes();
    await handler({ method: 'GET', headers: { 'x-fw-bg': 'p' }, url: '/api/create-fourthwall?hash=deadbeef' }, bg);
    expect(bgRec.status).toBe(202);
  });
});
