import type { SocialPlatform } from "../../../shared/social/types.js";
import type { SocialCredentials } from "../credentials.js";
import type { SocialEnv } from "../env.js";

export interface PublishContext {
  post: {
    id: string;
    share_id: string;
    platform: SocialPlatform;
    title: string | null;
    description: string | null;
    caption: string | null;
    alt_text: string | null;
    link_url: string | null;
    image_url: string | null;
    external_id: string | null;
    provider_state: Record<string, unknown>;
  };
  imageUrl: string;
  credentials: SocialCredentials;
  env: SocialEnv;
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
  providerState?: Record<string, unknown>;
}

export interface Publisher {
  publish(context: PublishContext): Promise<PublishResult>;
}

export class PublishError extends Error {
  code: string;
  retryable: boolean;
  needsReview: boolean;

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; needsReview?: boolean } = {},
  ) {
    super(message);
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.needsReview = options.needsReview ?? false;
  }
}
