import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BASE64_CHARS = 2_500_000; // ~1.8 MB decoded
const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;

/** Mirrors MARS_DOMAIN in src/lib/watermark.ts. Kept literal so this file stays dependency-free. */
const WATERMARK_DOMAIN = "mars.42web.io";
const WATERMARK_VERSION = 1;
const WATERMARK_BYTES = 32;
const WATERMARK_USER_OFFSET = 14;

/**
 * Validate a provenance payload supplied by the client.
 *
 * The body is not trusted for anything that matters, and this is no exception: the payload is
 * accepted only if its version, its embedded domain and the UUID it carries all agree with the
 * user the token actually authenticated. Otherwise a caller could attach a share to their own
 * account while embedding somebody else's id in the artwork, which would poison the very record
 * this table is meant to keep.
 *
 * Returns the payload as bytes, or null when it is absent or inconsistent.
 */
function validateWatermark(base64: unknown, userId: string): Uint8Array | null {
  if (typeof base64 !== "string" || base64.length === 0) return null;

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  if (binary.length !== WATERMARK_BYTES) return null;

  const payload = new Uint8Array(WATERMARK_BYTES);
  for (let i = 0; i < WATERMARK_BYTES; i++) payload[i] = binary.charCodeAt(i);

  if (payload[0] !== WATERMARK_VERSION) return null;

  let domain = "";
  for (let i = 0; i < WATERMARK_DOMAIN.length; i++) {
    domain += String.fromCharCode(payload[1 + i]);
  }
  if (domain !== WATERMARK_DOMAIN) return null;

  // The embedded UUID must be the authenticated user's, byte for byte. A zeroed field means the
  // export was anonymous, which is allowed: attribution to the origin is still worth recording.
  let hex = "";
  let anonymous = true;
  for (let i = 0; i < 16; i++) {
    const byte = payload[WATERMARK_USER_OFFSET + i];
    hex += byte.toString(16).padStart(2, "0");
    if (byte !== 0) anonymous = false;
  }
  if (!anonymous && hex !== userId.replace(/-/g, "").toLowerCase()) return null;

  return payload;
}

/** Locked to the deployed site. Never a wildcard. */
function corsHeaders(req: Request) {
  const allowed = Deno.env.get("APP_ORIGIN");
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed && origin === allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** bytea arrives as a `\x`-prefixed hex string; strip the prefix for the column value. */
function bytesToHex(bytes: Uint8Array): string {
  return "\\x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  try {
    // Identity comes from the verified token only. Nothing in the request body is trusted.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(req, { error: "unauthorized" }, 401);
    }
    const user = userData.user;

    const body = await req.json();
    const image_base64 = typeof body?.image_base64 === "string" ? body.image_base64 : "";
    const city_name = typeof body?.city_name === "string" ? body.city_name.trim() : "";
    const settings = body?.settings ?? {};

    if (!image_base64 || image_base64.length > MAX_BASE64_CHARS) {
      return json(req, { error: "image_base64 is required and must be under 1.8 MB" }, 400);
    }
    if (!CITY_RE.test(city_name)) {
      return json(req, { error: "city_name is required (letters, numbers and spaces, max 60)" }, 400);
    }

    const creator_name =
      typeof user.user_metadata?.username === "string" && user.user_metadata.username.trim()
        ? user.user_metadata.username.trim().slice(0, 60)
        : (user.email ?? "Curator").split("@")[0];

    // 1. Decode base64 -> Uint8Array
    const binaryString = atob(image_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. Unique filename
    const filename = `${crypto.randomUUID()}.png`;

    // 3. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("shares")
      .upload(filename, bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 4. Public URL
    const { data: urlData } = supabase.storage.from("shares").getPublicUrl(filename);
    const image_url = urlData.publicUrl;

    // 5. Insert. user_id and creator_email are derived from the verified token, so a caller
    //    cannot attach a share to someone else's account. The watermark payload is checked against
    //    that same identity for the same reason.
    const watermark_payload = validateWatermark(body?.watermark_payload, user.id);

    const { data: shareData, error: insertError } = await supabase
      .from("shares")
      .insert({
        city_name,
        image_url,
        settings_json: settings,
        user_id: user.id,
        creator_name,
        creator_email: user.email ?? null,
        watermark_payload: watermark_payload ? bytesToHex(watermark_payload) : null,
        watermark_version: watermark_payload ? WATERMARK_VERSION : null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("DB insert error:", insertError);
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    return json(req, { success: true, id: shareData.id, image_url }, 200);
  } catch (error: unknown) {
    console.error("create-share error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(req, { error: message }, 500);
  }
});
