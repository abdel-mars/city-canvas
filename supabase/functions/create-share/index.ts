import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BASE64_CHARS = 2_500_000; // ~1.8 MB decoded
const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;

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
    //    cannot attach a share to someone else's account.
    const { data: shareData, error: insertError } = await supabase
      .from("shares")
      .insert({
        city_name,
        image_url,
        settings_json: settings,
        user_id: user.id,
        creator_name,
        creator_email: user.email ?? null,
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
