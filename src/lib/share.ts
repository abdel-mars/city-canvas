import { supabase } from "@/integrations/supabase/client";
import { generateArtworkJpegBase64 } from "./download";
import { buildWatermarkPayload } from "./watermarkBrowser";
import { bytesToBase64 } from "./pngText";
import { shapeForBbox, type PosterShape } from "./posterShape";
import type { ArtworkSettings, City } from "@/types/artwork";

const MAX_PREFERRED_BASE64 = 2_500_000;
const MAX_UPLOAD_BASE64 = 3_200_000;

export interface PublishArtworkInput {
  svgElement: SVGSVGElement;
  city: City;
  bbox?: [number, number, number, number];
  settings: ArtworkSettings;
  shape?: PosterShape;
}

export interface PublishArtworkResult {
  shareId: string;
  imageUrl: string;
  posts: { id: string; platform: "instagram" | "pinterest"; scheduled_at: string }[];
}

async function encodeArtwork(svgElement: SVGSVGElement): Promise<string> {
  let image = await generateArtworkJpegBase64(svgElement, 3);
  if (image.length > MAX_PREFERRED_BASE64) {
    image = await generateArtworkJpegBase64(svgElement, 2);
  }
  if (image.length > MAX_UPLOAD_BASE64) {
    throw new Error("Artwork is too large to publish. Try a simpler preset.");
  }
  return image;
}

export async function publishArtwork({
  svgElement,
  city,
  bbox,
  settings,
  shape,
}: PublishArtworkInput): Promise<PublishArtworkResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in with the admin account to publish.");

  const [imageBase64, watermarkPayload] = await Promise.all([
    encodeArtwork(svgElement),
    buildWatermarkPayload(),
  ]);

  const response = await fetch("/api/social-queue", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      city_name: city.name,
      city_country: city.country ?? null,
      settings,
      shape: shape ?? shapeForBbox(bbox ?? city.boundingBox),
      watermark_payload: bytesToBase64(watermarkPayload),
    }),
  });

  if (!response.ok) {
    let detail = `Publishing failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.message || body.error || detail;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    if (response.status === 401) detail = "Sign in with the admin account to publish.";
    throw new Error(detail);
  }

  const body = (await response.json()) as {
    share_id: string;
    image_url: string;
    posts: PublishArtworkResult["posts"];
  };
  return {
    shareId: body.share_id,
    imageUrl: body.image_url,
    posts: body.posts,
  };
}
