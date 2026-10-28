import type { SupabaseClient } from "@supabase/supabase-js";
import type { PosterShape, SocialPlatform } from "../../shared/social/types.js";
import {
  loadCredentials,
  type SocialCredentials,
} from "./credentials.js";
import type { SocialEnv } from "./env.js";
import { buildSocialVariant, uploadSocialVariant } from "./media.js";
import { publisherFor } from "./publishers/index.js";
import { PublishError, type Publisher } from "./publishers/types.js";

const MAX_ATTEMPTS = 4;
const RETRY_MINUTES = [5, 15, 60, 180] as const;

export interface ClaimedPost {
  id: string;
  share_id: string;
  platform: SocialPlatform;
  status: string;
  attempts: number;
  title: string | null;
  description: string | null;
  caption: string | null;
  alt_text: string | null;
  link_url: string | null;
  image_url: string | null;
  media_url: string | null;
  media_path: string | null;
  external_id: string | null;
  provider_state: Record<string, unknown> | null;
}

interface ShareImage {
  image_path: string | null;
  image_url: string;
  settings_json: Record<string, unknown> | null;
  shape: string | null;
  image_purged_at: string | null;
}

export interface WorkerDeps {
  publisherFor: (platform: SocialPlatform) => Publisher;
  loadCredentials: (
    client: SupabaseClient,
    env: SocialEnv,
    platform: SocialPlatform,
  ) => Promise<SocialCredentials | null>;
  now: () => Date;
}

const defaultDeps: WorkerDeps = {
  publisherFor,
  loadCredentials,
  now: () => new Date(),
};

export interface TickSummary {
  claimed: number;
  posted: number;
  retried: number;
  failed: number;
  needs_review: number;
}

export function retryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_MINUTES.length - 1);
  return RETRY_MINUTES[index] * 60_000;
}

function shapeValue(value: string | null): PosterShape | null {
  return value === "square" || value === "horizontal" || value === "vertical"
    ? value
    : null;
}

function providerState(value: Record<string, unknown> | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function updatePost(
  client: SupabaseClient,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("social_posts").update(values).eq("id", id);
  if (error) throw new Error(`social post update failed: ${error.message}`);
}

async function masterImage(client: SupabaseClient, post: ClaimedPost): Promise<{
  bytes: Buffer;
  share: ShareImage;
}> {
  const { data, error } = await client
    .from("shares")
    .select("image_path,image_url,settings_json,shape,image_purged_at")
    .eq("id", post.share_id)
    .single();
  if (error || !data) {
    throw new PublishError(
      "share_missing",
      `Could not load the source artwork: ${error?.message ?? "not found"}`,
      { needsReview: true },
    );
  }
  const share = data as ShareImage;
  if (share.image_purged_at) {
    throw new PublishError(
      "source_purged",
      "The source artwork has already been reduced to a preview.",
      { needsReview: true },
    );
  }

  if (share.image_path) {
    const { data: blob, error: downloadError } = await client.storage
      .from("shares")
      .download(share.image_path);
    if (downloadError || !blob) {
      throw new PublishError(
        "source_download_failed",
        `Could not download the source artwork: ${downloadError?.message ?? "empty file"}`,
        { retryable: true },
      );
    }
    return { bytes: Buffer.from(await blob.arrayBuffer()), share };
  }

  if (!share.image_url) {
    throw new PublishError("source_missing", "The source artwork has no file.", {
      needsReview: true,
    });
  }
  const response = await fetch(share.image_url);
  if (!response.ok) {
    throw new PublishError(
      "source_download_failed",
      `Could not download the source artwork (${response.status}).`,
      { retryable: true },
    );
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), share };
}

async function ensureMedia(
  client: SupabaseClient,
  post: ClaimedPost,
): Promise<string> {
  if (post.media_url) return post.media_url;
  const { bytes, share } = await masterImage(client, post);
  const variant = await buildSocialVariant(
    bytes,
    post.platform,
    shapeValue(share.shape),
    share.settings_json,
  );
  const uploaded = await uploadSocialVariant(client, post.id, variant);
  await updatePost(client, post.id, {
    media_url: uploaded.url,
    media_path: uploaded.path,
  });
  return uploaded.url;
}

async function markFailure(
  client: SupabaseClient,
  post: ClaimedPost,
  error: unknown,
  now: Date,
): Promise<keyof TickSummary> {
  const publishError =
    error instanceof PublishError
      ? error
      : new PublishError(
          "publish_failed",
          error instanceof Error ? error.message : "Unknown publishing error",
          { retryable: true },
        );
  const message = `${publishError.code}: ${publishError.message}`.slice(0, 500);

  if (publishError.needsReview && !publishError.retryable) {
    await updatePost(client, post.id, {
      status: "needs_review",
      last_error: message,
      locked_at: null,
      next_attempt_at: null,
    });
    return "needs_review";
  }

  if (publishError.retryable && post.attempts < MAX_ATTEMPTS) {
    await updatePost(client, post.id, {
      status: "pending",
      last_error: message,
      locked_at: null,
      next_attempt_at: new Date(now.getTime() + retryDelayMs(post.attempts)).toISOString(),
    });
    return "retried";
  }

  await updatePost(client, post.id, {
    status: "failed",
    last_error: message,
    locked_at: null,
    next_attempt_at: null,
  });
  return "failed";
}

async function processOne(
  client: SupabaseClient,
  env: SocialEnv,
  post: ClaimedPost,
  deps: WorkerDeps,
): Promise<keyof TickSummary> {
  const now = deps.now();
  try {
    const imageUrl = await ensureMedia(client, post);
    const credentials = await deps.loadCredentials(client, env, post.platform);
    if (!credentials) {
      throw new PublishError(
        "credentials_missing",
        `${post.platform} credentials are not configured.`,
        { needsReview: true },
      );
    }

    const result = await deps.publisherFor(post.platform).publish({
      post: {
        id: post.id,
        share_id: post.share_id,
        platform: post.platform,
        title: post.title,
        description: post.description,
        caption: post.caption,
        alt_text: post.alt_text,
        link_url: post.link_url,
        image_url: post.image_url,
        external_id: post.external_id,
        provider_state: providerState(post.provider_state),
      },
      imageUrl,
      credentials,
      env,
    });

    await updatePost(client, post.id, {
      status: "posted",
      posted_at: now.toISOString(),
      locked_at: null,
      next_attempt_at: null,
      last_error: null,
      external_id: result.externalId,
      external_url: result.externalUrl,
      provider_state: result.providerState ?? {},
    });
    return "posted";
  } catch (error) {
    console.error(`social post ${post.id} failed:`, error);
    return markFailure(client, post, error, now);
  }
}

export async function processClaimedPosts(
  client: SupabaseClient,
  env: SocialEnv,
  posts: ClaimedPost[],
  deps: WorkerDeps = defaultDeps,
): Promise<TickSummary> {
  const summary: TickSummary = {
    claimed: posts.length,
    posted: 0,
    retried: 0,
    failed: 0,
    needs_review: 0,
  };
  for (const post of posts) {
    const outcome = await processOne(client, env, post, deps);
    summary[outcome] += 1;
  }
  return summary;
}
