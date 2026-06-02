import { supabase } from "@/integrations/supabase/client";
import { generateArtworkBase64 } from "./download";

interface ShareResult {
  id: string;
  imageUrl: string;
  shareUrl: string;
}

export async function createShare(
  svgElement: SVGSVGElement,
  cityName: string,
  settings: Record<string, any>,
  userId: string | null,
  creatorName: string,
  creatorEmail: string | null
): Promise<ShareResult> {
  // 1. Generate PNG in base64 at 3x scale (optimal for storage and upload payload size)
  const base64 = await generateArtworkBase64(svgElement, 3);

  // 2. Invoke our Supabase Edge Function
  const { data, error } = await supabase.functions.invoke("create-share", {
    body: {
      image_base64: base64,
      city_name: cityName,
      settings,
      user_id: userId,
      creator_name: creatorName,
      creator_email: creatorEmail
    },
  });

  if (error) {
    console.error("Error creating share:", error);
    throw new Error(error.message || "Failed to create share gallery");
  }

  if (!data?.success || !data?.id) {
    throw new Error("Invalid response from sharing service");
  }

  // 3. Return the gallery information
  // Construct the personalized URL slug e.g. /share/abdel/uuid
  const slug = creatorName ? encodeURIComponent(creatorName.toLowerCase()) : "anonymous";
  const shareUrl = `${window.location.origin}/share/${slug}/${data.id}`;

  return {
    id: data.id,
    imageUrl: data.image_url,
    shareUrl,
  };
}
