import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { fetchWithTimeout } from "./publishers/http.js";

const PAGE_SIZE = 200;
const RETENTION_DAYS = 7;
const THUMBNAIL_SIZE = 640;
const ACTIVE_STATUSES = new Set(["pending", "posting", "failed", "needs_review"]);
const SHARE_SELECT =
  "id,image_path,image_url,thumb_url,image_purged_at,social_posts(id,status,posted_at,media_path)";

export interface CleanupPost {
  id: string;
  status: string;
  posted_at: string | null;
  media_path: string | null;
}

export interface CleanupShare {
  id: string;
  image_path: string | null;
  image_url: string | null;
  thumb_url: string | null;
  image_purged_at: string | null;
  social_posts: CleanupPost[];
}

interface RawPost {
  id: string;
  status: string;
  posted_at: string | null;
  media_path: string | null;
}

interface RawShare extends Omit<CleanupShare, "social_posts"> {
  social_posts?: RawPost | RawPost[] | null;
}

export interface CleanupSummary {
  variants_removed: number;
  shares_purged: number;
  skipped: number;
  errors: number;
}

function normalizePost(post: RawPost): CleanupPost {
  return {
    id: post.id,
    status: post.status,
    posted_at: post.posted_at,
    media_path: post.media_path,
  };
}

function normalizeShare(row: RawShare): CleanupShare {
  const posts = Array.isArray(row.social_posts)
    ? row.social_posts
    : row.social_posts
      ? [row.social_posts]
      : [];
  return {
    id: row.id,
    image_path: row.image_path,
    image_url: row.image_url,
    thumb_url: row.thumb_url,
    image_purged_at: row.image_purged_at,
    social_posts: posts.map(normalizePost),
  };
}

export function isShareEligible(
  share: CleanupShare,
  now: Date,
  retentionDays = RETENTION_DAYS,
): boolean {
  if (share.image_purged_at) return false;
  if (!share.social_posts.length) return false;
  if (share.social_posts.some((post) => ACTIVE_STATUSES.has(post.status))) return false;

  const posted = share.social_posts.filter(
    (post) => post.status === "posted" && post.posted_at,
  );
  if (!posted.length) return false;

  const lastPosted = Math.max(
    ...posted.map((post) => new Date(post.posted_at as string).getTime()),
  );
  if (!Number.isFinite(lastPosted)) return false;
  return now.getTime() - lastPosted >= retentionDays * 86_400_000;
}

export async function buildThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

async function loadShares(client: SupabaseClient): Promise<CleanupShare[]> {
  const shares: CleanupShare[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("shares")
      .select(SHARE_SELECT)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`cleanup share query failed: ${error.message}`);
    const page = (data ?? []) as unknown as RawShare[];
    shares.push(...page.map(normalizeShare));
    if (page.length < PAGE_SIZE) break;
  }
  return shares;
}

async function downloadSource(
  client: SupabaseClient,
  share: CleanupShare,
): Promise<Buffer> {
  if (share.image_path) {
    const { data, error } = await client.storage
      .from("shares")
      .download(share.image_path);
    if (error || !data) {
      throw new Error(
        `cleanup source download failed: ${error?.message ?? "empty file"}`,
      );
    }
    return Buffer.from(await data.arrayBuffer());
  }
  if (share.image_url) {
    const response = await fetchWithTimeout(share.image_url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`cleanup source fetch failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("cleanup source is missing");
}

async function purgeShare(
  client: SupabaseClient,
  share: CleanupShare,
  now: Date,
): Promise<void> {
  const source = await downloadSource(client, share);
  const thumbnail = await buildThumbnail(source);
  const thumbPath = `thumbs/${share.id}.jpg`;
  const { error: uploadError } = await client.storage
    .from("shares")
    .upload(thumbPath, thumbnail, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`cleanup thumbnail upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = client.storage.from("shares").getPublicUrl(thumbPath);
  const thumbUrl = urlData.publicUrl;
  const { error: updateError } = await client
    .from("shares")
    .update({
      image_url: thumbUrl,
      thumb_url: thumbUrl,
      image_path: thumbPath,
      image_purged_at: now.toISOString(),
    })
    .eq("id", share.id);
  if (updateError) {
    throw new Error(`cleanup share update failed: ${updateError.message}`);
  }

  if (share.image_path) {
    const { error: removeError } = await client.storage
      .from("shares")
      .remove([share.image_path]);
    if (removeError) {
      console.error(`cleanup source remove failed for ${share.id}:`, removeError.message);
    }
  }
}

async function removeVariant(
  client: SupabaseClient,
  post: CleanupPost,
): Promise<boolean> {
  if (!post.media_path) return false;
  const { error } = await client.storage
    .from("social-media")
    .remove([post.media_path]);
  if (error) throw new Error(`cleanup variant remove failed: ${error.message}`);

  const { error: updateError } = await client
    .from("social_posts")
    .update({ media_url: null, media_path: null })
    .eq("id", post.id);
  if (updateError) {
    throw new Error(`cleanup variant update failed: ${updateError.message}`);
  }
  return true;
}

export async function runCleanup(
  client: SupabaseClient,
  now: Date = new Date(),
): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    variants_removed: 0,
    shares_purged: 0,
    skipped: 0,
    errors: 0,
  };

  for (const share of await loadShares(client)) {
    for (const post of share.social_posts) {
      if (post.status !== "posted" || !post.media_path) continue;
      try {
        if (await removeVariant(client, post)) summary.variants_removed += 1;
      } catch (error) {
        summary.errors += 1;
        console.error(`cleanup variant failed for ${post.id}:`, error);
      }
    }

    if (!isShareEligible(share, now)) {
      summary.skipped += 1;
      continue;
    }

    try {
      await purgeShare(client, share, now);
      summary.shares_purged += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`cleanup share failed for ${share.id}:`, error);
    }
  }

  return summary;
}
