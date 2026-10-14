import type { ArtworkSettings, City } from '@/types/artwork';

/**
 * Stable fingerprint of an artwork configuration.
 *
 * Used as the Printify listing cache key: the same city rendered with the same settings must
 * always produce the same hash, so repeat clicks reuse one product instead of creating a new one.
 * This is a cache key, not a secret, so a non-cryptographic digest is sufficient.
 *
 * The key must capture everything the poster *draws*, because a mismatch here is not a duplicate
 * listing but a buyer receiving someone else's map:
 *
 *  - `displayName`, because the city name alone cannot tell two places apart. Paris, France and
 *    Paris, Texas are different maps that both hash as "paris".
 *  - `boundingBox`, because the same city can resolve to different windows. The proxy shrinks a
 *    request when Overpass cannot carry it, and two designs of "Tokyo" 6 km and 30 km across are
 *    different artwork under an identical name. It is also what makes a print survive a clamp or
 *    zoom change: the artwork a customer bought keeps resolving to the product that matches it.
 */
export function designHash(cityName: string, settings: ArtworkSettings, city?: City): string {
  const parts = [
    cityName.trim().toLowerCase(),
    // Fall back to empty rather than throwing: a caller that only has a name still gets a stable,
    // if coarser, key. The important fix is that callers holding a full City do pass it.
    (city?.displayName ?? '').trim().toLowerCase(),
    (city?.boundingBox ?? []).map((n) => n.toFixed(4)).join(','),
    settings.background,
    settings.road,
    settings.text,
    settings.font,
    String(settings.textPositionY),
    settings.customName.trim(),
    settings.showCustomName ? '1' : '0',
  ];

  // FNV-1a, 32-bit, emitted as 10 hex chars.
  let hash = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    const chunk = i === 0 ? parts[i] : `|${parts[i]}`;
    for (let j = 0; j < chunk.length; j++) {
      hash ^= chunk.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0').slice(0, 10);
}