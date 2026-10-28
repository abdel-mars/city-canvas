import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  QueueError,
  buildQueueRows,
  parseQueuePayload,
  queueArtwork,
} from "../../server/social/queue";
import type { SocialEnv } from "../../server/social/env";
import type { ApiResponse } from "../../server/social/http";
import socialQueue from "../../api/social-queue";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  vi.restoreAllMocks();
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

const JPEG = "/9j/4AAQSkZJRg==";

const payload = parseQueuePayload({
  image_base64: JPEG,
  city_name: "Casablanca",
  city_country: "Morocco",
  settings: { background: "#111111" },
  shape: "square",
});

const env: SocialEnv = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
  appOrigin: "https://citylines.example",
  shopUrl: "https://shop.example/",
  trackingEnabled: true,
  cronSecret: "",
  batchSize: 2,
  instagramAccessToken: "",
  instagramUserId: "",
  pinterestAccessToken: "",
  pinterestBoardId: "",
  pinterestBoardSectionId: "",
};

describe("queue payload validation", () => {
  it("accepts a JPEG and optional country", () => {
    expect(payload.cityName).toBe("Casablanca");
    expect(payload.cityCountry).toBe("Morocco");
    expect(payload.shape).toBe("square");
  });

  it("rejects non-JPEG payloads", () => {
    expect(() =>
      parseQueuePayload({
        image_base64: "iVBORw0KGgo=",
        city_name: "Lisbon",
        settings: {},
      }),
    ).toThrow(QueueError);
  });

  it("rejects invalid cities", () => {
    expect(() =>
      parseQueuePayload({
        image_base64: JPEG,
        city_name: "<script>",
        settings: {},
      }),
    ).toThrow(QueueError);
  });
});

describe("queue rows", () => {
  it("schedules one post per platform with tracked links", () => {
    const rows = buildQueueRows(
      payload,
      "share-1",
      "https://cdn.example/art.jpg",
      "https://citylines.example",
      new Date("2026-10-27T10:00:00.000Z"),
      new Set(),
      env,
    );
    expect(rows).toHaveLength(2);
    const instagram = rows.find((row) => row.platform === "instagram")!;
    const pinterest = rows.find((row) => row.platform === "pinterest")!;
    expect(instagram.scheduled_at).toBe("2026-10-28T11:00:00.000Z");
    expect(pinterest.scheduled_at).toBe("2026-10-28T08:00:00.000Z");
    expect(instagram.link_url).toBe("https://citylines.example/api/social-click?c=instagram-bio");
    expect(pinterest.link_url).toContain(
      `https://citylines.example/api/social-click?p=${pinterest.id}`,
    );
    expect(pinterest.title).toContain("Casablanca");
    expect(instagram.caption).toContain("Casablanca, Morocco");
  });

  it("uses direct shop links when tracking is disabled", () => {
    const rows = buildQueueRows(
      payload,
      "share-1",
      "https://cdn.example/art.jpg",
      "https://citylines.example",
      new Date("2026-10-27T10:00:00.000Z"),
      new Set(),
      { ...env, trackingEnabled: false },
    );
    expect(rows.every((row) => row.link_url === env.shopUrl)).toBe(true);
  });
});

function fakeClient(overrides: { postInsertError?: { code: string; message: string } } = {}) {
  const removed: string[] = [];
  const shareDeletes: string[] = [];
  const client = {
    storage: {
      from() {
        return {
          async upload() {
            return { error: null };
          },
          getPublicUrl() {
            return { data: { publicUrl: "https://cdn.example/art.jpg" } };
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            return { error: null };
          },
        };
      },
    },
    from(table: string) {
      if (table === "shares") {
        return {
          async insert() {
            return { error: null };
          },
          delete() {
            return {
              async eq(_column: string, value: string) {
                shareDeletes.push(value);
                return { error: null };
              },
            };
          },
        };
      }
      return {
        select() {
          const chain = {
            neq() {
              return chain;
            },
            gte() {
              return chain;
            },
            async limit() {
              return { data: [], error: null };
            },
          };
          return chain;
        },
        async insert() {
          return {
            error: overrides.postInsertError ?? null,
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, removed, shareDeletes };
}

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "elmahmoudiabderrahmane@gmail.com",
  user_metadata: {},
} as unknown as User;

describe("queue rollback", () => {
  it("removes the share and uploaded image when posts cannot be inserted", async () => {
    const fake = fakeClient({ postInsertError: { code: "XX000", message: "boom" } });
    await expect(
      queueArtwork(
        fake.client,
        env,
        user,
        payload,
        "https://citylines.example",
      ),
    ).rejects.toThrow("social post insert failed");
    expect(fake.shareDeletes).toHaveLength(1);
    expect(fake.removed).toHaveLength(1);
  });
});

describe("queue endpoint", () => {
  it("fails closed when Supabase storage is not configured", async () => {
    const { res, rec } = makeRes();
    await socialQueue({ method: "POST", headers: {}, body: "{}" }, res);
    expect(rec.status).toBe(503);
  });

  it("rejects a non-admin token", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: false,
          status: 401,
          headers: { get: () => null },
          async json() {
            return {};
          },
          async text() {
            return "";
          },
        }) as unknown as Response,
      ),
    );
    const { res, rec } = makeRes();
    await socialQueue(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          image_base64: JPEG,
          city_name: "Lisbon",
          settings: {},
          shape: "square",
        },
      },
      res,
    );
    expect(rec.status).toBe(401);
  });
});
