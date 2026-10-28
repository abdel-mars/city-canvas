import {
  fetchWithTimeout,
  readJson,
  text,
  type JsonRecord,
} from "./http.js";
import { PublishError, type PublishContext, type PublishResult, type Publisher } from "./types.js";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const TITLE_LIMIT = 100;
const DESCRIPTION_LIMIT = 800;
const ALT_TEXT_LIMIT = 500;

async function pinterestError(response: Response): Promise<PublishError> {
  const payload = await readJson(response);
  const message =
    text(payload.message) ||
    text(payload.error) ||
    `Pinterest pin creation failed (${response.status})`;
  if (response.status === 429 || response.status >= 500) {
    return new PublishError("pinterest_transient", message, { retryable: true });
  }
  return new PublishError(`pinterest_${response.status}`, message, { needsReview: true });
}

function pinUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;
}

async function createPin(context: PublishContext): Promise<string> {
  if (context.credentials.platform !== "pinterest") {
    throw new PublishError("pinterest_credentials_mismatch", "Pinterest credentials are invalid.", {
      needsReview: true,
    });
  }
  const { accessToken, boardId, boardSectionId } = context.credentials;
  const payload: JsonRecord = {
    board_id: boardId,
    media_source: {
      source_type: "image_url",
      url: context.imageUrl,
    },
  };
  if (boardSectionId) payload.board_section_id = boardSectionId;
  if (context.post.title) payload.title = context.post.title.slice(0, TITLE_LIMIT);
  if (context.post.description) {
    payload.description = context.post.description.slice(0, DESCRIPTION_LIMIT);
  }
  if (context.post.alt_text) payload.alt_text = context.post.alt_text.slice(0, ALT_TEXT_LIMIT);
  if (context.post.link_url) payload.link = context.post.link_url;

  let response: Response;
  try {
    response = await fetchWithTimeout(`${PINTEREST_API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new PublishError(
      "pinterest_network",
      error instanceof Error ? error.message : "Pinterest request failed",
      { retryable: true },
    );
  }
  if (!response.ok) throw await pinterestError(response);

  const pinId = text((await readJson(response)).id);
  if (!pinId) {
    throw new PublishError("pinterest_malformed_response", "Pinterest did not return a pin id.", {
      retryable: true,
    });
  }
  return pinId;
}

async function result(
  pinId: string,
  providerState: JsonRecord,
): Promise<PublishResult> {
  return {
    externalId: pinId,
    externalUrl: pinUrl(pinId),
    providerState,
  };
}

export const pinterestPublisher: Publisher = {
  async publish(context) {
    const providerState = { ...context.post.provider_state };
    const previousPinId = text(providerState.pin_id);
    if (previousPinId) return result(previousPinId, providerState);

    const pinId = await createPin(context);
    providerState.pin_id = pinId;
    await context.checkpoint?.(providerState);
    return result(pinId, providerState);
  },
};
