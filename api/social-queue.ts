import {
  hasSupabaseConfig,
  readSocialEnv,
} from "../server/social/env.js";
import {
  header,
  readJsonBody,
  requestOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../server/social/http.js";
import {
  QueueError,
  assertQueueBodySize,
  parseQueuePayload,
  queueArtwork,
} from "../server/social/queue.js";
import { adminClient, authenticateAdmin } from "../server/social/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readSocialEnv();

  if (req.method === "OPTIONS") {
    sendJson(res, env, { ok: true }, 204);
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, env, { error: "method_not_allowed" }, 405);
    return;
  }
  if (!hasSupabaseConfig(env)) {
    sendJson(res, env, { error: "social_storage_unconfigured" }, 503);
    return;
  }

  try {
    const body = readJsonBody(req, 4_200_000);
    assertQueueBodySize(body);
    const payload = parseQueuePayload(body);
    const client = adminClient(env);
    const user = await authenticateAdmin(client, header(req.headers, "authorization"));
    if (!user) {
      sendJson(res, env, { error: "unauthorized" }, 401);
      return;
    }

    const result = await queueArtwork(
      client,
      env,
      user,
      payload,
      requestOrigin(req, env),
    );
    sendJson(res, env, { ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof QueueError) {
      sendJson(res, env, { error: error.code }, error.status);
      return;
    }
    const message = error instanceof Error ? error.message : "unknown_error";
    if (error instanceof SyntaxError || message === "invalid_json") {
      sendJson(res, env, { error: "invalid_json" }, 400);
      return;
    }
    if (message === "payload_too_large") {
      sendJson(res, env, { error: "payload_too_large" }, 413);
      return;
    }
    console.error("social queue failed:", error);
    sendJson(res, env, { error: "queue_failed", message }, 500);
  }
}
