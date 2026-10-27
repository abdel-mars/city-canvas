import { SOCIAL_SHOP_URL } from "./config";
import type { InstagramCopy, PinterestCopy, SocialCopyInput } from "./types";

const PINTEREST_TITLE_LIMIT = 100;
const PINTEREST_DESCRIPTION_LIMIT = 800;
const INSTAGRAM_CAPTION_LIMIT = 2200;

function cleanCity(cityName: string): string {
  return cityName.trim();
}

function place(cityName: string, country?: string | null): string {
  const city = cleanCity(cityName);
  const countryName = country?.trim();
  return countryName ? `${city}, ${countryName}` : city;
}

function cityHashtag(cityName: string): string {
  const tag = cleanCity(cityName).replace(/[^\p{L}\p{N}]/gu, "");
  if (!tag || /^\d+$/.test(tag)) return "";
  return `#${tag}`;
}

function countryHashtag(country?: string | null): string {
  const tag = country?.trim().replace(/[^\p{L}\p{N}]/gu, "") ?? "";
  if (!tag || /^\d+$/.test(tag)) return "";
  return `#${tag}`;
}

function fitPinterestTitle(cityName: string): string {
  const city = cleanCity(cityName);
  const full = `${city} Line Art Print — Minimalist ${city} Wall Art`;
  if (full.length <= PINTEREST_TITLE_LIMIT) return full;
  const short = `${city} Line Art Print — Minimalist Wall Art`;
  if (short.length <= PINTEREST_TITLE_LIMIT) return short;
  return `${short.slice(0, PINTEREST_TITLE_LIMIT - 1).trimEnd()}…`;
}

function buildDescription(cityName: string, shopUrl: string): string {
  const city = cleanCity(cityName);
  const base = `Bring the character of ${city} into your space with this minimalist city line art print.

Inspired by the architecture and identity of ${city}, this artwork transforms the city's character into a clean, timeless design. Perfect for modern interiors, gallery walls, and anyone who wants to keep a piece of their favorite city close.

Discover more cities through art.

Shop City Lines: ${shopUrl}`;
  const keywords = `${city} wall art, ${city} art print, minimalist city art, architectural line art, modern wall decor, cityscape print, travel wall art, minimalist interior design`;
  const hashtags = `${cityHashtag(city)} #CityArt #LineArt #MinimalistWallArt #ArchitecturalArt`
    .replace(/^ /, "")
    .replace(/\s+/g, " ");

  const roomy = `${base}\n\n${keywords}\n\n${hashtags}`;
  if (roomy.length <= PINTEREST_DESCRIPTION_LIMIT) return roomy;
  const withoutKeywords = `${base}\n\n${hashtags}`;
  if (withoutKeywords.length <= PINTEREST_DESCRIPTION_LIMIT) return withoutKeywords;
  return base.slice(0, PINTEREST_DESCRIPTION_LIMIT);
}

export function pinterestCopy(input: SocialCopyInput): PinterestCopy {
  const city = cleanCity(input.cityName);
  const shopUrl = input.shopUrl?.trim() || SOCIAL_SHOP_URL;
  const keywords = `${city} wall art, ${city} art print, minimalist city art, architectural line art, modern wall decor, cityscape print, travel wall art, minimalist interior design`;
  return {
    title: fitPinterestTitle(city),
    description: buildDescription(city, shopUrl),
    altText: `Minimalist line art illustration inspired by the architecture of ${city}, created by City Lines.`,
    keywords,
    hashtags: `${cityHashtag(city)} #CityArt #LineArt #MinimalistWallArt #ArchitecturalArt`
      .replace(/^ /, "")
      .replace(/\s+/g, " "),
  };
}

export function instagramCopy(input: SocialCopyInput): InstagramCopy {
  const city = cleanCity(input.cityName);
  const placeName = place(city, input.country);
  const countryTag = countryHashtag(input.country);
  const hashtags = [
    "#CityLines",
    "#CityArt",
    "#MinimalistArt",
    "#ArchitecturalIllustration",
    countryTag,
  ]
    .filter(Boolean)
    .join(" ");
  const caption = `A city, reduced to its lines.

${placeName}.

Every city has its own rhythm, its own shapes, and its own way of telling a story. Through City Lines, we explore the character of places and translate their architecture into minimalist art.

One city. One composition. A thousand memories.

Discover the collection through the link in our bio.

City Lines — Cities, drawn differently.

${hashtags}`;
  return {
    caption: caption.slice(0, INSTAGRAM_CAPTION_LIMIT),
    altText: `A minimalist architectural line drawing inspired by ${placeName}, from the City Lines art collection.`,
  };
}
