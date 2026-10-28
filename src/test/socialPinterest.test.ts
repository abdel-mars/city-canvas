import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialEnv } from "../../server/social/env";
import { pinterestPublisher } from "../../server/social/publishers/pinterest";
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

function context(
  providerState: Record<string, unknown> = {},
  boardSectionId: string | null = "section-1",
): PublishContext {
  return {
    post: {
      id: "post-1",
      share_id: "share-1",
      platform: "pinterest",
      title: "Lisbon Line Art Print — Minimalist Lisbon Wall Art",
      description: "Bring the character of Lisbon into your space.",
      caption: null,
      alt_text: "Minimalist line art illustration inspired by Lisbon.",
      link_url: "https://citylines.example/api/social-click?p=post-1",
      image_url: "https://cdn.example/master.jpg",
      external_id: null,
      provider_state: providerState,
    },
    imageUrl: "https://cdn.example/posts/post-1.jpg",
    credentials: {
      platform: "pinterest",
      accessToken: "token",
      boardId: "board-1",
      boardSectionId,
    },
    env,
  };
}

function json(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
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

describe("pinterest publisher", () => {
  it("creates a pin with the tracked link and board section", async () => {
    const calls = stubFetch([json({ id: "123456789" })]);
    const checkpoints: Record<string, unknown>[] = [];
    const result = await pinterestPublisher.publish({
      ...context(),
      checkpoint: async (state) => {
        checkpoints.push({ ...state });
      },
    });

    expect(result).toEqual({
      externalId: "123456789",
      externalUrl: "https://www.pinterest.com/pin/123456789/",
      providerState: { pin_id: "123456789" },
    });
    expect(checkpoints).toEqual([{ pin_id: "123456789" }]);
    expect(calls[0].url).toBe("https://api.pinterest.com/v5/pins");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      board_id: "board-1",
      board_section_id: "section-1",
      link: "https://citylines.example/api/social-click?p=post-1",
      media_source: {
        source_type: "image_url",
        url: "https://cdn.example/posts/post-1.jpg",
      },
    });
  });

  it("omits the section when none is configured", async () => {
    const calls = stubFetch([json({ id: "123" })]);
    await pinterestPublisher.publish(context({}, null));
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("board_section_id");
  });

  it("resumes from a recorded pin id without creating another pin", async () => {
    const calls = stubFetch([]);
    const result = await pinterestPublisher.publish(context({ pin_id: "123" }));
    expect(result.externalId).toBe("123");
    expect(calls).toHaveLength(0);
  });

  it("retries rate limits and upstream failures", async () => {
    stubFetch([json({ message: "Too many requests" }, 429)]);
    const error = await publishError(pinterestPublisher.publish(context()));
    expect(error.code).toBe("pinterest_transient");
    expect(error.retryable).toBe(true);
  });

  it("flags authentication failures for review", async () => {
    stubFetch([json({ message: "Invalid token" }, 401)]);
    const error = await publishError(pinterestPublisher.publish(context()));
    expect(error.code).toBe("pinterest_401");
    expect(error.needsReview).toBe(true);
  });

  it("retries network failures", async () => {
    stubFetch([new Error("socket hang up")]);
    const error = await publishError(pinterestPublisher.publish(context()));
    expect(error.code).toBe("pinterest_network");
    expect(error.retryable).toBe(true);
  });
});
