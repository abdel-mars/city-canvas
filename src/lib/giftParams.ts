import { colorPresets } from '@/lib/presets';
import type { ArtworkSettings, City, ColorPreset, FontFamily } from '@/types/artwork';

/**
 * URL encoding for a gift page.
 *
 * The artwork is a pure function of the city name plus eight small primitives, so a design can
 * live entirely in the query string: no server state, refreshable, and shareable. The fields here
 * must stay in step with `designHash`, or a gift page would resolve to a different Printify
 * product than the one the creator bought.
 */

/** Mirrors the server's CITY_RE in api/create-printify.ts. */
const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{0,59}$/u;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FONTS: readonly FontFamily[] = ['serif', 'sans', 'mono', 'handwritten'];

/** Why a gift URL was rejected. Surfaced so the page can explain rather than just redirect. */
export type GiftDecodeError =
  | 'city'
  | 'coordinates'
  | 'bounding-box'
  | 'colors'
  | 'font'
  | 'position';

export interface GiftDesign {
  city: City;
  settings: ArtworkSettings;
}

export interface GiftDecodeResult {
  ok: true;
  design: GiftDesign;
}

/**
 * Reject rather than repair.
 *
 * Silently defaulting a bad city name or bounding box would render a real-looking page of the
 * wrong artwork, which is worse than sending the visitor back to the start. Cosmetic fields
 * (displayName, the custom name) do fall back, because losing them cannot mislead.
 */
export type GiftDecodeOutcome = GiftDecodeResult | { ok: false; error: GiftDecodeError };

function num(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recover the palette object from the colours.
 *
 * `ArtworkSettings.preset` is the only field `designHash` ignores, yet `ArtworkCanvas` reads
 * `preset.isNeon` to decide whether to apply the neon glow filter. A Neon poster therefore has to
 * round-trip its preset or the gift page would render the identical lines without the glow.
 */
function resolvePreset(background: string, road: string, text: string): ColorPreset {
  const match = colorPresets.find(
    (p) =>
      p.background.toLowerCase() === background.toLowerCase() &&
      p.road.toLowerCase() === road.toLowerCase() &&
      p.text.toLowerCase() === text.toLowerCase(),
  );
  return match ?? { name: 'Custom', background, road, text };
}

export function encodeGiftParams(city: City, settings: ArtworkSettings): URLSearchParams {
  const params = new URLSearchParams();
  params.set('city', city.name);
  params.set('display', city.displayName);
  params.set('lat', String(city.lat));
  params.set('lon', String(city.lon));
  params.set('bbox', city.boundingBox.join(','));
  params.set('bg', settings.background);
  params.set('road', settings.road);
  params.set('text', settings.text);
  params.set('font', settings.font);
  params.set('y', String(settings.textPositionY));
  params.set('name', settings.customName);
  params.set('show', settings.showCustomName ? '1' : '0');
  // Recorded so a Neon poster keeps its glow; harmless when the colours are custom.
  if (settings.preset?.name) params.set('preset', settings.preset.name);
  return params;
}

export function giftUrl(city: City, settings: ArtworkSettings): string {
  return `/gift?${encodeGiftParams(city, settings).toString()}`;
}

export function decodeGiftParams(input: URLSearchParams | string): GiftDecodeOutcome {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;

  const name = (params.get('city') ?? '').trim();
  if (!CITY_RE.test(name)) return { ok: false, error: 'city' };

  const lat = num(params.get('lat'));
  const lon = num(params.get('lon'));
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: 'coordinates' };
  }

  const bboxRaw = (params.get('bbox') ?? '').split(',');
  if (bboxRaw.length !== 4) return { ok: false, error: 'bounding-box' };
  const bbox = bboxRaw.map(Number);
  if (bbox.some((n) => !Number.isFinite(n))) return { ok: false, error: 'bounding-box' };
  const [south, west, north, east] = bbox as [number, number, number, number];
  if (south >= north || west >= east) return { ok: false, error: 'bounding-box' };

  const background = params.get('bg') ?? '';
  const road = params.get('road') ?? '';
  const text = params.get('text') ?? '';
  if (!HEX_RE.test(background) || !HEX_RE.test(road) || !HEX_RE.test(text)) {
    return { ok: false, error: 'colors' };
  }

  const font = params.get('font') as FontFamily | null;
  if (!font || !FONTS.includes(font)) return { ok: false, error: 'font' };

  const textPositionY = num(params.get('y'));
  if (textPositionY === null || textPositionY < 0 || textPositionY > 100) {
    return { ok: false, error: 'position' };
  }

  const displayName = (params.get('display') ?? '').trim();
  const customName = params.get('name') ?? '';
  const showCustomName = params.get('show') === '1';

  const city: City = {
    name,
    // A missing displayName is cosmetic, so fall back rather than reject the whole link.
    displayName: displayName || name,
    lat,
    lon,
    boundingBox: [south, west, north, east],
  };

  const settings: ArtworkSettings = {
    preset: resolvePreset(background, road, text),
    background,
    road,
    text,
    font,
    textPositionY,
    // The server pattern-checks this before it ever reaches Printify.
    customName: CITY_RE.test(customName.trim()) ? customName.trim() : '',
    showCustomName,
  };

  return { ok: true, design: { city, settings } };
}
