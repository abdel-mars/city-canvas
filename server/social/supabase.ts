import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isAdminEmail } from "../../shared/admin.js";
import { hasSupabaseConfig, type SocialEnv } from "./env.js";

const clients = new Map<string, SupabaseClient>();

export function adminClient(env: SocialEnv): SupabaseClient {
  if (!hasSupabaseConfig(env)) {
    throw new Error("social_storage_unconfigured");
  }
  const key = `${env.supabaseUrl}:${env.serviceRoleKey.slice(-8)}`;
  const cached = clients.get(key);
  if (cached) return cached;
  const client = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.set(key, client);
  return client;
}

export async function authenticateAdmin(
  client: SupabaseClient,
  authorization: string | null,
): Promise<User | null> {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || !isAdminEmail(data.user.email)) return null;
  return data.user;
}
