import { cronAuthFailure } from "../server/social/cron.js";
import { hasSupabaseConfig, readSocialEnv } from "../server/social/env.js";
import type { ApiRequest, ApiResponse } from "../server/social/http.js";
import { adminClient } from "../server/social/supabase.js";
import { processClaimedPosts, type ClaimedPost } from "../server/social/worker.js";

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
    const client = adminClient(env);
    const { data, error } = await client.rpc("claim_social_posts", {
      p_limit: env.batchSize,
    });
    if (error) throw new Error(`claim failed: ${error.message}`);
    const posts = (data ?? []) as ClaimedPost[];
    const summary = await processClaimedPosts(client, env, posts);
    res.status(200).json(summary);
  } catch (error) {
    console.error("social tick failed:", error);
    res.status(500).json({ error: "social_tick_failed" });
  }
}
