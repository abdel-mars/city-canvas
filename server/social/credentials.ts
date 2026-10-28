import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPlatform } from "../../shared/social/types.js";
import type { SocialEnv } from "./env.js";

export interface InstagramCredentials {
  platform: "instagram";
  accessToken: string;
  userId: string;
}

export interface PinterestCredentials {
  platform: "pinterest";
  accessToken: string;
  boardId: string;
  boardSectionId: string | null;
}

export type SocialCredentials = InstagramCredentials | PinterestCredentials;

interface StoredCredential {
  access_token: string;
  account_id: string | null;
  metadata: Record<string, unknown> | null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function storedCredential(
  client: SupabaseClient,
  platform: SocialPlatform,
): Promise<StoredCredential | null> {
  const { data, error } = await client
    .from("social_credentials")
    .select("access_token,account_id,metadata")
    .eq("platform", platform)
    .maybeSingle();
  if (error || !data) return null;
  return data as StoredCredential;
}

export async function loadCredentials(
  client: SupabaseClient,
  env: SocialEnv,
  platform: SocialPlatform,
): Promise<SocialCredentials | null> {
  const stored = await storedCredential(client, platform);
  if (platform === "instagram") {
    const accessToken = env.instagramAccessToken || stringValue(stored?.access_token);
    const userId = env.instagramUserId || stringValue(stored?.account_id);
    if (!accessToken || !userId) return null;
    return { platform, accessToken, userId };
  }

  const accessToken = env.pinterestAccessToken || stringValue(stored?.access_token);
  const boardId =
    env.pinterestBoardId || stringValue(stored?.metadata?.board_id);
  const boardSectionId =
    env.pinterestBoardSectionId ||
    stringValue(stored?.metadata?.board_section_id) ||
    null;
  if (!accessToken || !boardId) return null;
  return { platform, accessToken, boardId, boardSectionId };
}
