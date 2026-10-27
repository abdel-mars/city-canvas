import { afterEach, describe, expect, it } from "vitest";
import {
  parseClickValues,
  recordSocialClick,
} from "../../server/social/click";
import socialClick from "../../api/social-click";
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

describe("click values", () => {
  it("accepts a post UUID", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseClickValues(id, null)).toEqual({ postId: id, campaign: null });
  });

  it("accepts a campaign", () => {
    expect(parseClickValues(null, "instagram-bio")).toEqual({
      postId: null,
      campaign: "instagram-bio",
    });
  });

  it("ignores malformed values", () => {
    expect(parseClickValues("not-a-uuid", "<script>")).toEqual({
      postId: null,
      campaign: null,
    });
  });
});

describe("click recording", () => {
  it("inserts the post id without retaining request metadata", async () => {
    const inserted: unknown[] = [];
    const client = {
      from() {
        return {
          async insert(row: unknown) {
            inserted.push(row);
            return { error: null };
          },
        };
      },
    };
    await recordSocialClick(client as never, {
      postId: "123e4567-e89b-42d3-a456-426614174000",
      campaign: null,
    });
    expect(inserted).toEqual([
      {
        social_post_id: "123e4567-e89b-42d3-a456-426614174000",
        campaign: null,
        platform: null,
      },
    ]);
  });
});

describe("click endpoint", () => {
  it("redirects to the shop even when tracking storage is not configured", async () => {
    const { res, rec } = makeRes();
    const req: ApiRequest = {
      method: "GET",
      headers: {},
      url: "/api/social-click?p=123e4567-e89b-42d3-a456-426614174000",
    };
    await socialClick(req, res);
    expect(rec.status).toBe(302);
    expect(rec.headers.Location).toBe("https://citylinesart-shop.fourthwall.com/");
    expect(rec.headers["Cache-Control"]).toBe("no-store");
  });

  it("rejects unsupported methods", async () => {
    const { res, rec } = makeRes();
    await socialClick({ method: "POST", headers: {} }, res);
    expect(rec.status).toBe(405);
  });
});
