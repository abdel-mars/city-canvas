import { hasSupabaseConfig, readSocialEnv } from "../server/social/env.js";
import { queryParam, type ApiRequest, type ApiResponse } from "../server/social/http.js";
import { parseClickValues, recordSocialClick } from "../server/social/click.js";
import { adminClient } from "../server/social/supabase.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const env = readSocialEnv();
  const destination = env.shopUrl;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).setHeader("Allow", "GET, HEAD");
    res.end();
    return;
  }

  if (env.trackingEnabled && hasSupabaseConfig(env)) {
    const values = parseClickValues(queryParam(req, "p"), queryParam(req, "c"));
    if (values.postId || values.campaign) {
      try {
        await recordSocialClick(adminClient(env), values);
      } catch (error) {
        console.error("social click logging failed:", error);
      }
    }
  }

  res.status(302);
  res.setHeader("Location", destination);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
