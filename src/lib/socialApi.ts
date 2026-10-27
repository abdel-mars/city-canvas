import { supabase } from "@/integrations/supabase/client";
import type { SocialPostView } from "@shared/social/types";

type SocialRow = Omit<SocialPostView, "share"> & {
  shares?: SocialPostView["share"] | SocialPostView["share"][];
};

export async function fetchSocialPosts(): Promise<SocialPostView[]> {
  const { data, error } = await supabase
    .from("social_posts")
    .select("*, shares(city_name,image_url,thumb_url,city_country)")
    .order("scheduled_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SocialRow[]).map((row) => {
    const share = Array.isArray(row.shares) ? row.shares[0] ?? null : row.shares ?? null;
    return { ...row, share };
  });
}

export async function cancelSocialPost(id: string): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["pending", "posting"]);
  if (error) throw new Error(error.message);
}

export async function retrySocialPost(id: string): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({
      status: "pending",
      attempts: 0,
      locked_at: null,
      last_error: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
