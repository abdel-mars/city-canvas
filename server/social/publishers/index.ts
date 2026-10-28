import type { SocialPlatform } from "../../../shared/social/types.js";
import { instagramPublisher } from "./instagram.js";
import { pinterestPublisher } from "./pinterest.js";
import type { Publisher } from "./types.js";

const publishers: Record<SocialPlatform, Publisher> = {
  instagram: instagramPublisher,
  pinterest: pinterestPublisher,
};

export function publisherFor(platform: SocialPlatform): Publisher {
  return publishers[platform];
}

export { PublishError } from "./types.js";
export type { PublishContext, PublishResult, Publisher } from "./types.js";
