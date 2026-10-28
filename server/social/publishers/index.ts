import type { SocialPlatform } from "../../../shared/social/types.js";
import { instagramPublisher } from "./instagram.js";
import { PublishError, type Publisher } from "./types.js";

const notReady: Publisher = {
  async publish() {
    throw new PublishError(
      "publisher_not_ready",
      "This platform publisher is not configured yet.",
      { needsReview: true },
    );
  },
};

const publishers: Record<SocialPlatform, Publisher> = {
  instagram: instagramPublisher,
  pinterest: notReady,
};

export function publisherFor(platform: SocialPlatform): Publisher {
  return publishers[platform];
}

export { PublishError };
export type { PublishContext, PublishResult, Publisher } from "./types.js";
