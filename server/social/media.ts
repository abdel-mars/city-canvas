import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosterShape, SocialPlatform } from "../../shared/social/types.js";

const INSTAGRAM_SIZES: Record<PosterShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  horizontal: { width: 1080, height: 810 },
  vertical: { width: 1080, height: 1350 },
};

const PINTEREST_SIZE = { width: 1000, height: 1500 };
const FALLBACK_BACKGROUND = "#18181b";
const BACKGROUND_RE = /^#[0-9a-f]{3,8}$/i;

export function variantGeometry(
  platform: SocialPlatform,
  shape?: PosterShape | null,
): { width: number; height: number } {
  if (platform === "pinterest") return PINTEREST_SIZE;
  return INSTAGRAM_SIZES[shape ?? "square"];
}

export function backgroundColor(settings: unknown): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return FALLBACK_BACKGROUND;
  }
  const background = (settings as Record<string, unknown>).background;
  return typeof background === "string" && BACKGROUND_RE.test(background)
    ? background
    : FALLBACK_BACKGROUND;
}

export async function buildSocialVariant(
  input: Buffer,
  platform: SocialPlatform,
  shape: PosterShape | null,
  settings: unknown,
): Promise<Buffer> {
  const { width, height } = variantGeometry(platform, shape);
  const background = backgroundColor(settings);
  return sharp(input)
    .rotate()
    .resize({
      width,
      height,
      fit: "contain",
      background,
    })
    .flatten({ background })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export async function uploadSocialVariant(
  client: SupabaseClient,
  postId: string,
  image: Buffer,
): Promise<{ url: string; path: string }> {
  const path = `posts/${postId}.jpg`;
  const { error } = await client.storage.from("social-media").upload(path, image, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`variant upload failed: ${error.message}`);
  const { data } = client.storage.from("social-media").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
