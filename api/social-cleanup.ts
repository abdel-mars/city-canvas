import { runCleanup } from "../server/social/cleanup.js";
import { cronAuthFailure } from "../server/social/cron.js";
import { hasSupabaseConfig, readSocialEnv } from "../server/social/env.js";
import type { ApiRequest, ApiResponse } from "../server/social/http.js";
import { adminClient } from "../server/social/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readSocialEnv();
  res.setHeader("Cache-Control", "no-store");

  const authFailure = cronAuthFailure(req, env);
  if (authFailure) {
    if (authFailure.allow) res.setHeader("Allow", authFailure.allow);
    res.status(authFailure.status).json({ error: authFailure.error });
    return;
  }
  if (!hasSupabaseConfig(env)) {
    res.status(503).json({ error: "social_worker_unconfigured" });
    return;
  }

  try {
    const summary = await runCleanup(adminClient(env));
    res.status(200).json(summary);
  } catch (error) {
    console.error("social cleanup failed:", error);
    res.status(500).json({ error: "social_cleanup_failed" });
  }
}
