import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  buildThumbnail,
  isShareEligible,
  runCleanup,
  type CleanupShare,
} from "../../server/social/cleanup";

const now = new Date("2026-10-27T12:00:00.000Z");

function share(overrides: Partial<CleanupShare> = {}): CleanupShare {
  return {
    id: "share-1",
    image_path: "share-1.jpg",
    image_url: "https://cdn.example/shares/share-1.jpg",
    thumb_url: null,
    image_purged_at: null,
    social_posts: [
      {
        id: "post-1",
        status: "posted",
        posted_at: "2026-10-19T12:00:00.000Z",
        media_path: "posts/post-1.jpg",
      },
      {
        id: "post-2",
        status: "cancelled",
        posted_at: null,
        media_path: null,
      },
    ],
    ...overrides,
  };
}

describe("cleanup eligibility", () => {
  it("accepts shares whose successful posts are at least seven days old", () => {
    expect(isShareEligible(share(), now)).toBe(true);
  });

  it("keeps recent shares", () => {
    const recent = share({
      social_posts: [
        {
          id: "post-1",
          status: "posted",
          posted_at: "2026-10-25T12:00:00.000Z",
          media_path: null,
        },
      ],
    });
    expect(isShareEligible(recent, now)).toBe(false);
  });

  it("skips shares with pending, posting, failed, or review posts", () => {
    for (const status of ["pending", "posting", "failed", "needs_review"]) {
      const active = share({
        social_posts: [
          {
            id: "post-1",
            status: "posted",
            posted_at: "2026-10-01T12:00:00.000Z",
            media_path: null,
          },
          { id: "post-2", status, posted_at: null, media_path: null },
        ],
      });
      expect(isShareEligible(active, now)).toBe(false);
    }
  });

  it("skips already-purged shares and shares with no successful post", () => {
    expect(isShareEligible(share({ image_purged_at: now.toISOString() }), now)).toBe(false);
    expect(
      isShareEligible(
        share({
          social_posts: [
            { id: "post-1", status: "cancelled", posted_at: null, media_path: null },
          ],
        }),
        now,
      ),
    ).toBe(false);
  });
});

describe("thumbnail", () => {
  it("fits the artwork inside 640px and produces JPEG", async () => {
    const source = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();
    const thumb = await buildThumbnail(source);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });
});

function fakeClient(source: Buffer, shares: unknown[]) {
  const uploads: { bucket: string; path: string }[] = [];
  const removed: string[] = [];
  const shareUpdates: { id: string; values: Record<string, unknown> }[] = [];
  const postUpdates: { id: string; values: Record<string, unknown> }[] = [];

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async range(from: number) {
              return { data: from === 0 ? shares : [], error: null };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              if (table === "shares") shareUpdates.push({ id, values });
              if (table === "social_posts") postUpdates.push({ id, values });
              return { error: null };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async download() {
            return {
              data: {
                async arrayBuffer() {
                  return source.buffer.slice(
                    source.byteOffset,
                    source.byteOffset + source.byteLength,
                  );
                },
              },
              error: null,
            };
          },
          async upload(path: string) {
            uploads.push({ bucket, path });
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${bucket}/${path}` } };
          },
          async remove(paths: string[]) {
            removed.push(...paths.map((path) => `${bucket}/${path}`));
            return { error: null };
          },
        };
      },
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    uploads,
    removed,
    shareUpdates,
    postUpdates,
  };
}

describe("runCleanup", () => {
  it("removes variants and replaces an eligible original with a thumbnail", async () => {
    const source = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();
    const active = share({
      id: "share-2",
      image_path: "share-2.jpg",
      social_posts: [
        { id: "post-3", status: "pending", posted_at: null, media_path: null },
      ],
    });
    const purged = share({
      id: "share-3",
      image_purged_at: "2026-10-01T00:00:00.000Z",
      social_posts: [],
    });
    const fake = fakeClient(source, [share(), active, purged]);

    const summary = await runCleanup(fake.client, now);

    expect(summary).toEqual({
      variants_removed: 1,
      shares_purged: 1,
      skipped: 2,
      errors: 0,
    });
    expect(fake.removed).toEqual([
      "social-media/posts/post-1.jpg",
      "shares/share-1.jpg",
    ]);
    expect(fake.uploads).toEqual([{ bucket: "shares", path: "thumbs/share-1.jpg" }]);
    expect(fake.postUpdates).toEqual([
      { id: "post-1", values: { media_url: null, media_path: null } },
    ]);
    expect(fake.shareUpdates).toEqual([
      {
        id: "share-1",
        values: {
          image_url: "https://cdn.example/shares/thumbs/share-1.jpg",
          thumb_url: "https://cdn.example/shares/thumbs/share-1.jpg",
          image_path: "thumbs/share-1.jpg",
          image_purged_at: now.toISOString(),
        },
      },
    ]);
  });
});
