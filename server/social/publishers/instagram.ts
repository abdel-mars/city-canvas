import { INSTAGRAM_API_VERSION } from "../../../shared/social/config.js";
import {
  asRecord,
  fetchWithTimeout,
  readJson,
  text,
  type JsonRecord,
} from "./http.js";
import { PublishError, type PublishContext, type PublishResult, type Publisher } from "./types.js";

const GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}`;
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 35_000;
const ALT_TEXT_LIMIT = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphError(response: Response, action: string): Promise<PublishError> {
  const payload = await readJson(response);
  const error = asRecord(payload.error);
  const message =
    text(error.error_user_msg) ||
    text(error.message) ||
    `Instagram ${action} failed (${response.status})`;
  const code = typeof error.code === "number" ? error.code : null;
  const transient =
    response.status === 429 ||
    response.status >= 500 ||
    error.is_transient === true ||
    code === 1 ||
    code === 2 ||
    code === 4;

  if (transient) {
    return new PublishError("instagram_transient", message, { retryable: true });
  }
  return new PublishError(`instagram_${response.status}`, message, { needsReview: true });
}

async function request(
  url: string,
  init: RequestInit,
  action: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, init);
  } catch (error) {
    throw new PublishError(
      "instagram_network",
      error instanceof Error ? error.message : `Instagram ${action} failed`,
      { retryable: true },
    );
  }
  if (!response.ok) throw await graphError(response, action);
  return response;
}

function authorization(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function createContainer(context: PublishContext, accessToken: string, userId: string): Promise<string> {
  const form = new URLSearchParams({ image_url: context.imageUrl });
  if (context.post.caption) form.set("caption", context.post.caption);
  if (context.post.alt_text) form.set("alt_text", context.post.alt_text.slice(0, ALT_TEXT_LIMIT));

  const response = await request(
    `${GRAPH_BASE}/${encodeURIComponent(userId)}/media`,
    { method: "POST", headers: authorization(accessToken), body: form },
    "container creation",
  );
  const id = text((await readJson(response)).id);
  if (!id) {
    throw new PublishError("instagram_malformed_response", "Instagram did not return a container id.", {
      retryable: true,
    });
  }
  return id;
}

async function containerStatus(
  accessToken: string,
  containerId: string,
): Promise<{ status: string; detail: string }> {
  const response = await request(
    `${GRAPH_BASE}/${encodeURIComponent(containerId)}?fields=status_code,status`,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    "container status",
  );
  const data = await readJson(response);
  return {
    status: text(data.status_code).toUpperCase(),
    detail: text(data.status),
  };
}

async function waitForContainer(accessToken: string, containerId: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const { status, detail } = await containerStatus(accessToken, containerId);
    if (status === "FINISHED") return;
    if (status === "PUBLISHED") {
      throw new PublishError(
        "instagram_container_already_published",
        "The Instagram container was already published, but its media id was not recorded.",
        { needsReview: true },
      );
    }
    if (status === "ERROR" || status === "EXPIRED") {
      throw new PublishError(
        `instagram_container_${status.toLowerCase()}`,
        detail || `Instagram container is ${status.toLowerCase()}.`,
        { retryable: true },
      );
    }
    if (Date.now() >= deadline) {
      throw new PublishError(
        "instagram_container_timeout",
        "Instagram is still processing the image.",
        { retryable: true },
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function publishContainer(
  accessToken: string,
  userId: string,
  containerId: string,
): Promise<string> {
  const response = await request(
    `${GRAPH_BASE}/${encodeURIComponent(userId)}/media_publish`,
    {
      method: "POST",
      headers: authorization(accessToken),
      body: new URLSearchParams({ creation_id: containerId }),
    },
    "publish",
  );
  const mediaId = text((await readJson(response)).id);
  if (!mediaId) {
    throw new PublishError("instagram_malformed_response", "Instagram did not return a media id.", {
      retryable: true,
    });
  }
  return mediaId;
}

async function permalink(accessToken: string, mediaId: string): Promise<string | null> {
  try {
    const response = await request(
      `${GRAPH_BASE}/${encodeURIComponent(mediaId)}?fields=permalink`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      "permalink lookup",
    );
    return text((await readJson(response)).permalink) || null;
  } catch {
    return null;
  }
}

async function result(
  accessToken: string,
  mediaId: string,
  providerState: JsonRecord,
): Promise<PublishResult> {
  return {
    externalId: mediaId,
    externalUrl: await permalink(accessToken, mediaId),
    providerState,
  };
}

export const instagramPublisher: Publisher = {
  async publish(context) {
    if (context.credentials.platform !== "instagram") {
      throw new PublishError("instagram_credentials_mismatch", "Instagram credentials are invalid.", {
        needsReview: true,
      });
    }
    const { accessToken, userId } = context.credentials;
    const providerState = { ...context.post.provider_state };
    const previousMediaId = text(providerState.media_id);
    if (previousMediaId) {
      return result(accessToken, previousMediaId, providerState);
    }

    let containerId = text(providerState.container_id);
    if (!containerId) {
      containerId = await createContainer(context, accessToken, userId);
      providerState.container_id = containerId;
      await context.checkpoint?.(providerState);
    }

    try {
      await waitForContainer(accessToken, containerId);
    } catch (error) {
      if (
        error instanceof PublishError &&
        (error.code === "instagram_container_error" ||
          error.code === "instagram_container_expired")
      ) {
        delete providerState.container_id;
        await context.checkpoint?.(providerState);
      }
      throw error;
    }

    const mediaId = await publishContainer(accessToken, userId, containerId);
    providerState.media_id = mediaId;
    delete providerState.container_id;
    await context.checkpoint?.(providerState);
    return result(accessToken, mediaId, providerState);
  },
};
