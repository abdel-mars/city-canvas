import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { image_base64, city_name, settings, user_id, creator_name, creator_email } = await req.json();

    if (!image_base64 || !city_name) {
      return new Response(
        JSON.stringify({ error: "image_base64 and city_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Decode base64 → Uint8Array
    const binaryString = atob(image_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. Generate a unique filename
    const filename = `${crypto.randomUUID()}.png`;

    // 3. Upload to Supabase Storage (shares bucket)
    const { error: uploadError } = await supabase.storage
      .from("shares")
      .upload(filename, bytes, {
        contentType: "image/png",
        cacheControl: "31536000", // 1 year cache
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 4. Get public URL
    const { data: urlData } = supabase.storage
      .from("shares")
      .getPublicUrl(filename);

    const image_url = urlData.publicUrl;

    // 5. Insert share record into DB
    const { data: shareData, error: insertError } = await supabase
      .from("shares")
      .insert({
        city_name,
        image_url,
        settings_json: settings ?? {},
        user_id: user_id ?? null,
        creator_name: creator_name ?? 'Anonymous',
        creator_email: creator_email ?? null
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("DB insert error:", insertError);
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: shareData.id,
        image_url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("create-share error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
