import { SOCIAL_SHOP_URL } from "../../shared/social/config.js";

export interface SocialEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  appOrigin: string;
  shopUrl: string;
  trackingEnabled: boolean;
  cronSecret: string;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readSocialEnv(source: NodeJS.ProcessEnv = process.env): SocialEnv {
  const origin = clean(source.APP_ORIGIN).replace(/\/+$/, "");
  const shopUrl = clean(source.SOCIAL_SHOP_URL) || SOCIAL_SHOP_URL;
  return {
    supabaseUrl: clean(source.SUPABASE_URL),
    serviceRoleKey: clean(source.SUPABASE_SERVICE_ROLE_KEY),
    appOrigin: origin,
    shopUrl,
    trackingEnabled: clean(source.SOCIAL_TRACKING_ENABLED).toLowerCase() !== "false",
    cronSecret: clean(source.SOCIAL_CRON_SECRET),
  };
}

export function hasSupabaseConfig(env: SocialEnv): boolean {
  return Boolean(env.supabaseUrl && env.serviceRoleKey);
}
