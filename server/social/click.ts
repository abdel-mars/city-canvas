import type { SupabaseClient } from "@supabase/supabase-js";
import { INSTAGRAM_BIO_CAMPAIGN } from "../../shared/social/config.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN_RE = /^[a-z0-9-]{1,60}$/;

export interface ClickValues {
  postId: string | null;
  campaign: string | null;
}

export function parseClickValues(postParam: string | null, campaignParam: string | null): ClickValues {
  const postId = postParam && UUID_RE.test(postParam) ? postParam.toLowerCase() : null;
  if (postId) return { postId, campaign: null };
  const campaign =
    campaignParam && CAMPAIGN_RE.test(campaignParam) ? campaignParam.toLowerCase() : null;
  return { postId: null, campaign };
}

export async function recordSocialClick(
  client: SupabaseClient,
  values: ClickValues,
): Promise<void> {
  if (!values.postId && !values.campaign) return;
  const platform = values.campaign === INSTAGRAM_BIO_CAMPAIGN ? "instagram" : null;
  const { error } = await client.from("social_clicks").insert({
    social_post_id: values.postId,
    campaign: values.campaign,
    platform,
  });
  if (error) throw new Error(`click insert failed: ${error.message}`);
}
