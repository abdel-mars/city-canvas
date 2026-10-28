import { timingSafeEqual } from "node:crypto";
import { hasSupabaseConfig, readSocialEnv } from "../server/social/env.js";
import { header, type ApiRequest, type ApiResponse } from "../server/social/http.js";
import { adminClient } from "../server/social/supabase.js";
import { processClaimedPosts, type ClaimedPost } from "../server/social/worker.js";

function secretMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readSocialEnv();
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).setHeader("Allow", "GET, POST");
    res.end();
    return;
  }
  if (!env.cronSecret) {
    res.status(503).json({ error: "social_worker_unconfigured" });
    return;
  }

  const authorization = header(req.headers, "authorization") ?? "";
  const provided =
    header(req.headers, "x-social-secret") ??
    (authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "");
  if (!secretMatches(provided, env.cronSecret)) {
    res.status(401).json({ error: "unauthorized" });
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
