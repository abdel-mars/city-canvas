import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialEnv } from "../../server/social/env";
import { instagramPublisher } from "../../server/social/publishers/instagram";
import { PublishError, type PublishContext } from "../../server/social/publishers/types";

const env: SocialEnv = {
  supabaseUrl: "",
  serviceRoleKey: "",
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

function context(providerState: Record<string, unknown> = {}): PublishContext {
  return {
    post: {
      id: "post-1",
      share_id: "share-1",
      platform: "instagram",
      title: null,
      description: null,
      caption: "A city, reduced to its lines.",
      alt_text: "Line art of Lisbon.",
      link_url: "https://citylines.example/api/social-click?c=instagram-bio",
      image_url: "https://cdn.example/master.jpg",
      external_id: null,
      provider_state: providerState,
    },
    imageUrl: "https://cdn.example/posts/post-1.jpg",
    credentials: {
      platform: "instagram",
      accessToken: "token",
      userId: "17841400000000000",
    },
    env,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = { url: string; init?: RequestInit };

function stubFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

async function publishError(promise: Promise<unknown>): Promise<PublishError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PublishError) return error;
    throw error;
  }
  throw new Error("expected publish to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("instagram publisher", () => {
  it("creates, polls, publishes, and returns the permalink", async () => {
    const calls = stubFetch([
      json({ id: "container-1" }),
      json({ status_code: "FINISHED" }),
      json({ id: "media-1" }),
      json({ permalink: "https://www.instagram.com/p/abc/" }),
    ]);
    const checkpoints: Record<string, unknown>[] = [];
    const result = await instagramPublisher.publish({
      ...context(),
      checkpoint: async (state) => {
        checkpoints.push({ ...state });
      },
    });

    expect(result).toEqual({
      externalId: "media-1",
      externalUrl: "https://www.instagram.com/p/abc/",
      providerState: { media_id: "media-1" },
    });
    expect(checkpoints).toEqual([{ container_id: "container-1" }, { media_id: "media-1" }]);
    expect(calls[0].url).toContain("graph.instagram.com/v26.0/17841400000000000/media");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer token",
    });
    const form = String(calls[0].init?.body);
    expect(form).toContain("image_url=https%3A%2F%2Fcdn.example%2Fposts%2Fpost-1.jpg");
    expect(form).toContain("caption=A+city%2C+reduced+to+its+lines.");
    expect(form).toContain("alt_text=Line+art+of+Lisbon.");
    expect(calls[2].url).toContain("/media_publish");
  });

  it("resumes from a recorded media id without publishing again", async () => {
    const calls = stubFetch([json({ permalink: "https://www.instagram.com/p/abc/" })]);
    const checkpoint = vi.fn(async () => {});
    const result = await instagramPublisher.publish({
      ...context({ media_id: "media-1" }),
      checkpoint,
    });

    expect(result.externalId).toBe("media-1");
    expect(result.externalUrl).toBe("https://www.instagram.com/p/abc/");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("refuses to republish a container that is already live", async () => {
    stubFetch([json({ id: "container-1" }), json({ status_code: "PUBLISHED" })]);
    const error = await publishError(instagramPublisher.publish(context()));

    expect(error.code).toBe("instagram_container_already_published");
    expect(error.needsReview).toBe(true);
  });

  it("clears an errored container so the next attempt can recreate it", async () => {
    stubFetch([
      json({ status_code: "ERROR", status: "media processing failed" }),
    ]);
    const checkpoints: Record<string, unknown>[] = [];
    const error = await publishError(
      instagramPublisher.publish({
        ...context({ container_id: "container-1" }),
        checkpoint: async (state) => {
          checkpoints.push({ ...state });
        },
      }),
    );

    expect(error.code).toBe("instagram_container_error");
    expect(error.retryable).toBe(true);
    expect(checkpoints).toEqual([{}]);
  });

  it("classifies authentication errors as needing review", async () => {
    stubFetch([
      json({ error: { message: "Invalid OAuth access token", code: 190 } }, 401),
    ]);
    const error = await publishError(instagramPublisher.publish(context()));

    expect(error.needsReview).toBe(true);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("Invalid OAuth access token");
  });

  it("retries transient upstream failures", async () => {
    stubFetch([json({ error: { message: "Try again" } }, 503)]);
    const error = await publishError(instagramPublisher.publish(context()));

    expect(error.retryable).toBe(true);
    expect(error.needsReview).toBe(false);
  });

  it("keeps a successful publish when the permalink lookup fails", async () => {
    stubFetch([
      json({ id: "container-1" }),
      json({ status_code: "FINISHED" }),
      json({ id: "media-1" }),
      json({ error: { message: "unavailable" } }, 500),
    ]);
    const result = await instagramPublisher.publish(context());
    expect(result.externalId).toBe("media-1");
    expect(result.externalUrl).toBeNull();
  });
});
