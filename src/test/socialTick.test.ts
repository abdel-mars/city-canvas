import { afterEach, describe, expect, it } from "vitest";
import socialTick from "../../api/social-tick";
import type { ApiRequest, ApiResponse } from "../../server/social/http";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

function makeRes() {
  const rec = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) {
      rec.status = code;
      return this;
    },
    setHeader(key: string, value: string) {
      rec.headers[key] = value;
    },
    json(body: unknown) {
      rec.body = body;
    },
    end() {},
  } as unknown as ApiResponse;
  return { res, rec };
}

const request = (headers: Record<string, string> = {}): ApiRequest => ({
  method: "POST",
  headers,
});

describe("social tick endpoint", () => {
  it("fails closed without a cron secret", async () => {
    const { res, rec } = makeRes();
    await socialTick(request(), res);
    expect(rec.status).toBe(503);
  });

  it("rejects the wrong secret", async () => {
    process.env.SOCIAL_CRON_SECRET = "expected";
    const { res, rec } = makeRes();
    await socialTick(request({ "x-social-secret": "wrong" }), res);
    expect(rec.status).toBe(401);
  });

  it("accepts the bearer secret but fails when Supabase is unconfigured", async () => {
    process.env.SOCIAL_CRON_SECRET = "expected";
    const { res, rec } = makeRes();
    await socialTick(request({ authorization: "Bearer expected" }), res);
    expect(rec.status).toBe(503);
    expect(rec.body).toEqual({ error: "social_worker_unconfigured" });
  });

  it("rejects unsupported methods", async () => {
    const { res, rec } = makeRes();
    await socialTick({ method: "DELETE", headers: {} }, res);
    expect(rec.status).toBe(405);
  });
});
