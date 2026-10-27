export type SocialPlatform = "instagram" | "pinterest";

export type SocialStatus =
  | "pending"
  | "posting"
  | "posted"
  | "failed"
  | "needs_review"
  | "cancelled";

export type PosterShape = "square" | "horizontal" | "vertical";

export interface SocialCopyInput {
  cityName: string;
  country?: string | null;
  shopUrl?: string;
}

export interface PinterestCopy {
  title: string;
  description: string;
  altText: string;
  keywords: string;
  hashtags: string;
}

export interface InstagramCopy {
  caption: string;
  altText: string;
}

export interface SocialPostView {
  id: string;
  share_id: string;
  platform: SocialPlatform;
  status: SocialStatus;
  scheduled_at: string;
  next_attempt_at: string | null;
  posted_at: string | null;
  title: string | null;
  description: string | null;
  caption: string | null;
  alt_text: string | null;
  link_url: string | null;
  image_url: string | null;
  media_url: string | null;
  external_id: string | null;
  external_url: string | null;
  attempts: number;
  click_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  share?: {
    city_name: string;
    image_url: string;
    thumb_url: string | null;
    city_country: string | null;
  } | null;
}
