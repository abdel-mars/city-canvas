import type { SocialPlatform } from "./types";

export const SOCIAL_SHOP_URL = "https://citylinesart-shop.fourthwall.com/";
export const INSTAGRAM_API_VERSION = "v26.0";
export const SOCIAL_TIMEZONE = "Africa/Casablanca";
export const SOCIAL_LEAD_MINUTES = 15;
export const SOCIAL_CLICK_PATH = "/api/social-click";
export const INSTAGRAM_BIO_CAMPAIGN = "instagram-bio";

export const SOCIAL_SCHEDULES: Record<
  SocialPlatform,
  { days: number[]; hours: number[] }
> = {
  instagram: { days: [1, 3, 5], hours: [12] },
  pinterest: { days: [0, 1, 3, 5], hours: [9, 12, 20] },
};

export function trackedPostUrl(origin: string, postId: string): string {
  return `${origin.replace(/\/$/, "")}${SOCIAL_CLICK_PATH}?p=${encodeURIComponent(postId)}`;
}

export function instagramBioUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${SOCIAL_CLICK_PATH}?c=${INSTAGRAM_BIO_CAMPAIGN}`;
}
