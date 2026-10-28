import { SOCIAL_SHOP_URL } from "../../shared/social/config.js";

export interface SocialEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  appOrigin: string;
  shopUrl: string;
  trackingEnabled: boolean;
  cronSecret: string;
  batchSize: number;
  instagramAccessToken: string;
  instagramUserId: string;
  pinterestAccessToken: string;
  pinterestBoardId: string;
  pinterestBoardSectionId: string;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readSocialEnv(source: NodeJS.ProcessEnv = process.env): SocialEnv {
  const origin = clean(source.APP_ORIGIN).replace(/\/+$/, "");
  const shopUrl = clean(source.SOCIAL_SHOP_URL) || SOCIAL_SHOP_URL;
  const batch = Number(clean(source.SOCIAL_WORKER_BATCH));
  return {
    supabaseUrl: clean(source.SUPABASE_URL),
    serviceRoleKey: clean(source.SUPABASE_SERVICE_ROLE_KEY),
    appOrigin: origin,
    shopUrl,
    trackingEnabled: clean(source.SOCIAL_TRACKING_ENABLED).toLowerCase() !== "false",
    cronSecret: clean(source.SOCIAL_CRON_SECRET),
    batchSize: Number.isFinite(batch) && batch > 0 ? Math.min(Math.floor(batch), 5) : 2,
    instagramAccessToken: clean(source.INSTAGRAM_ACCESS_TOKEN),
    instagramUserId: clean(source.INSTAGRAM_USER_ID),
    pinterestAccessToken: clean(source.PINTEREST_ACCESS_TOKEN),
    pinterestBoardId: clean(source.PINTEREST_BOARD_ID),
    pinterestBoardSectionId: clean(source.PINTEREST_BOARD_SECTION_ID),
  };
}

export function hasSupabaseConfig(env: SocialEnv): boolean {
  return Boolean(env.supabaseUrl && env.serviceRoleKey);
}
