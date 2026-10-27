import type { SupabaseClient, User } from "@supabase/supabase-js";
import { pinterestCopy, instagramCopy } from "../../shared/social/copy.js";
import { instagramBioUrl, trackedPostUrl } from "../../shared/social/config.js";
import { nextSocialSlot, slotKey } from "../../shared/social/schedule.js";
import type { SocialPlatform } from "../../shared/social/types.js";
import type { SocialEnv } from "./env.js";

const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_BASE64 = 3_200_000;
const MAX_SETTINGS_CHARS = 100_000;
const MAX_BODY_BYTES = 4_200_000;
const WATERMARK_BYTES = 32;

export type QueueShape = "square" | "horizontal" | "vertical";

export interface QueuePayload {
  imageBase64: string;
  cityName: string;
  cityCountry: string | null;
  settings: Record<string, unknown>;
  shape: QueueShape;
  watermarkPayload: string | null;
}

export interface QueueRow {
  id: string;
  share_id: string;
  platform: SocialPlatform;
  status: "pending";
  scheduled_at: string;
  next_attempt_at: string;
  title: string | null;
  description: string | null;
  caption: string | null;
  alt_text: string | null;
  link_url: string;
  image_url: string;
}

export class QueueError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isShape(value: unknown): value is QueueShape {
  return value === "square" || value === "horizontal" || value === "vertical";
}

function isJpegBase64(value: string): boolean {
  if (!value.startsWith("/9j/")) return false;
  if (value.length % 4 !== 0) return false;
  return BASE64_RE.test(value.slice(0, 256)) && BASE64_RE.test(value.slice(-256));
}

function watermarkHex(value: string | null): string | null {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.byteLength !== WATERMARK_BYTES) return null;
    return `\\x${bytes.toString("hex")}`;
  } catch {
    return null;
  }
}

export function parseQueuePayload(body: unknown): QueuePayload {
  if (!isRecord(body)) throw new QueueError(400, "invalid_json");
  const imageBase64 = typeof body.image_base64 === "string" ? body.image_base64.trim() : "";
  const cityName = typeof body.city_name === "string" ? body.city_name.trim() : "";
  const rawCountry = typeof body.city_country === "string" ? body.city_country.trim() : "";
  const cityCountry = rawCountry || null;
  const settings = body.settings;
  const shape = body.shape ?? "square";
  const watermarkPayload =
    typeof body.watermark_payload === "string" ? body.watermark_payload : null;

  if (!imageBase64) throw new QueueError(400, "image_base64_required");
  if (imageBase64.length > MAX_IMAGE_BASE64) throw new QueueError(413, "payload_too_large");
  if (!isJpegBase64(imageBase64)) throw new QueueError(400, "image_base64_must_be_jpeg");
  if (!CITY_RE.test(cityName)) throw new QueueError(400, "invalid_city_name");
  if (cityCountry && !CITY_RE.test(cityCountry)) throw new QueueError(400, "invalid_city_country");
  if (!isRecord(settings)) throw new QueueError(400, "invalid_settings");
  if (JSON.stringify(settings).length > MAX_SETTINGS_CHARS) {
    throw new QueueError(413, "settings_too_large");
  }
  if (!isShape(shape)) throw new QueueError(400, "invalid_shape");

  return {
    imageBase64,
    cityName,
    cityCountry,
    settings,
    shape,
    watermarkPayload,
  };
}

export function assertQueueBodySize(body: unknown): void {
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    throw new QueueError(413, "payload_too_large");
  }
}

export function buildQueueRows(
  payload: QueuePayload,
  shareId: string,
  imageUrl: string,
  origin: string,
  now: Date,
  usedSlots: ReadonlySet<string>,
  env: Pick<SocialEnv, "trackingEnabled" | "shopUrl">,
): QueueRow[] {
  const postIds: Record<SocialPlatform, string> = {
    instagram: crypto.randomUUID(),
    pinterest: crypto.randomUUID(),
  };
  const pinterest = pinterestCopy({
    cityName: payload.cityName,
    country: payload.cityCountry,
    shopUrl: env.shopUrl,
  });
  const instagram = instagramCopy({
    cityName: payload.cityName,
    country: payload.cityCountry,
  });

  return (["instagram", "pinterest"] as const).map((platform) => {
    const slot = nextSocialSlot(platform, now, usedSlots);
    const id = postIds[platform];
    const linkUrl =
      platform === "pinterest"
        ? env.trackingEnabled
          ? trackedPostUrl(origin, id)
          : env.shopUrl
        : env.trackingEnabled
          ? instagramBioUrl(origin)
          : env.shopUrl;
    return {
      id,
      share_id: shareId,
      platform,
      status: "pending",
      scheduled_at: slotKey(slot),
      next_attempt_at: slotKey(slot),
      title: platform === "pinterest" ? pinterest.title : null,
      description: platform === "pinterest" ? pinterest.description : null,
      caption: platform === "instagram" ? instagram.caption : null,
      alt_text: platform === "pinterest" ? pinterest.altText : instagram.altText,
      link_url: linkUrl,
      image_url: imageUrl,
    };
  });
}

async function usedSlots(client: SupabaseClient, now: Date): Promise<Set<string>> {
  const { data, error } = await client
    .from("social_posts")
    .select("scheduled_at")
    .neq("status", "cancelled")
    .gte("scheduled_at", now.toISOString())
    .limit(500);
  if (error) throw new Error(`social slot query failed: ${error.message}`);
  return new Set((data ?? []).map((row: { scheduled_at: string }) => row.scheduled_at));
}

function creatorName(user: User): string {
  const username = user.user_metadata?.username;
  if (typeof username === "string" && username.trim()) return username.trim().slice(0, 60);
  return "City Lines";
}

export interface QueueResult {
  share_id: string;
  image_url: string;
  posts: QueueRow[];
}

export async function queueArtwork(
  client: SupabaseClient,
  env: SocialEnv,
  user: User,
  payload: QueuePayload,
  origin: string,
): Promise<QueueResult> {
  const shareId = crypto.randomUUID();
  const imagePath = `${shareId}.jpg`;
  const bytes = Buffer.from(payload.imageBase64, "base64");
  const { error: uploadError } = await client.storage
    .from("shares")
    .upload(imagePath, bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

  const { data: urlData } = client.storage.from("shares").getPublicUrl(imagePath);
  const imageUrl = urlData.publicUrl;

  let shareCreated = false;
  try {
    const watermark = watermarkHex(payload.watermarkPayload);
    const { error: shareError } = await client.from("shares").insert({
      id: shareId,
      city_name: payload.cityName,
      city_country: payload.cityCountry,
      image_url: imageUrl,
      image_path: imagePath,
      settings_json: payload.settings,
      user_id: user.id,
      creator_name: creatorName(user),
      creator_email: user.email ?? null,
      is_published: true,
      shape: payload.shape,
      watermark_payload: watermark,
      watermark_version: watermark ? 1 : null,
    });
    if (shareError) throw new Error(`share insert failed: ${shareError.message}`);
    shareCreated = true;

    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt++) {
      const used = await usedSlots(client, now);
      const rows = buildQueueRows(payload, shareId, imageUrl, origin, now, used, env);
      const { error: postsError } = await client.from("social_posts").insert(rows);
      if (!postsError) {
        return { share_id: shareId, image_url: imageUrl, posts: rows };
      }
      if (postsError.code !== "23505" || attempt === 2) {
        throw new Error(`social post insert failed: ${postsError.message}`);
      }
    }
    throw new Error("could not reserve a social slot");
  } catch (error) {
    if (shareCreated) {
      await client.from("shares").delete().eq("id", shareId);
    }
    await client.storage.from("shares").remove([imagePath]);
    throw error;
  }
}
