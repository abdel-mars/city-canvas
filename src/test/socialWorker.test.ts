import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialEnv } from "../../server/social/env";
import type { SocialCredentials } from "../../server/social/credentials";
import { PublishError, type Publisher } from "../../server/social/publishers/types";
import {
  processClaimedPosts,
  retryDelayMs,
  type ClaimedPost,
  type WorkerDeps,
} from "../../server/social/worker";

const env: SocialEnv = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
  appOrigin: "https://citylines.example",
  shopUrl: "https://shop.example/",
  trackingEnabled: true,
  cronSecret: "secret",
  batchSize: 2,
  instagramAccessToken: "",
  instagramUserId: "",
  pinterestAccessToken: "",
  pinterestBoardId: "",
  pinterestBoardSectionId: "",
};

const credentials: SocialCredentials = {
  platform: "instagram",
  accessToken: "token",
  userId: "user",
};

const post = (overrides: Partial<ClaimedPost> = {}): ClaimedPost => ({
  id: "post-1",
  share_id: "share-1",
  platform: "instagram",
  status: "posting",
  attempts: 1,
  title: null,
  description: null,
  caption: "Caption",
  alt_text: "Alt",
  link_url: "https://shop.example/",
  image_url: "https://cdn.example/master.jpg",
  media_url: "https://cdn.example/variant.jpg",
  media_path: "posts/post-1.jpg",
  external_id: null,
  provider_state: {},
  ...overrides,
});

function fakeClient() {
  const updates: { id: string; values: Record<string, unknown> }[] = [];
  const client = {
    from() {
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              updates.push({ id, values });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

function deps(publisher: Publisher, now = new Date("2026-10-27T12:00:00.000Z")): WorkerDeps {
  return {
    publisherFor: () => publisher,
    loadCredentials: async () => credentials,
    now: () => now,
  };
}

const successPublisher: Publisher = {
  async publish() {
    return {
      externalId: "ig-1",
      externalUrl: "https://instagram.com/p/ig-1",
    };
  },
};

describe("worker retry timing", () => {
  it("backs off by attempt number", () => {
    expect(retryDelayMs(1)).toBe(5 * 60_000);
    expect(retryDelayMs(2)).toBe(15 * 60_000);
    expect(retryDelayMs(3)).toBe(60 * 60_000);
    expect(retryDelayMs(4)).toBe(180 * 60_000);
  });
});

describe("worker", () => {
  it("marks a successful post as published", async () => {
    const fake = fakeClient();
    const summary = await processClaimedPosts(
      fake.client,
      env,
      [post()],
      deps(successPublisher),
    );
    expect(summary).toMatchObject({ claimed: 1, posted: 1 });
    expect(fake.updates[0].values).toMatchObject({
      status: "posted",
      external_id: "ig-1",
      external_url: "https://instagram.com/p/ig-1",
      last_error: null,
    });
  });

  it("reschedules a retryable failure with backoff", async () => {
    const fake = fakeClient();
    const publisher: Publisher = {
      async publish() {
        throw new PublishError("rate_limited", "Slow down", { retryable: true });
      },
    };
    const summary = await processClaimedPosts(
      fake.client,
      env,
      [post()],
      deps(publisher),
    );
    expect(summary).toMatchObject({ retried: 1 });
    expect(fake.updates[0].values.status).toBe("pending");
    expect(fake.updates[0].values.next_attempt_at).toBe("2026-10-27T12:05:00.000Z");
  });

  it("flags terminal failures for review", async () => {
    const fake = fakeClient();
    const publisher: Publisher = {
      async publish() {
        throw new PublishError("invalid_media", "Bad aspect ratio", {
          needsReview: true,
        });
      },
    };
    const summary = await processClaimedPosts(
      fake.client,
      env,
      [post()],
      deps(publisher),
    );
    expect(summary).toMatchObject({ needs_review: 1 });
    expect(fake.updates[0].values.status).toBe("needs_review");
  });

  it("stops retrying after the attempt limit", async () => {
    const fake = fakeClient();
    const publisher: Publisher = {
      async publish() {
        throw new PublishError("timeout", "Timed out", { retryable: true });
      },
    };
    const summary = await processClaimedPosts(
      fake.client,
      env,
      [post({ attempts: 4 })],
      deps(publisher),
    );
    expect(summary).toMatchObject({ failed: 1 });
    expect(fake.updates[0].values.status).toBe("failed");
  });

  it("asks for review when credentials are missing", async () => {
    const fake = fakeClient();
    const summary = await processClaimedPosts(fake.client, env, [post()], {
      ...deps(successPublisher),
      loadCredentials: async () => null,
    });
    expect(summary).toMatchObject({ needs_review: 1 });
    expect(String(fake.updates[0].values.last_error)).toContain("credentials_missing");
  });
});
