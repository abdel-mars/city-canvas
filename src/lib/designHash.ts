import type { ArtworkSettings } from '@/types/artwork';

/**
 * Stable fingerprint of an artwork configuration.
 *
 * Used as the Printify listing cache key: the same city rendered with the same settings must
 * always produce the same hash, so repeat clicks reuse one product instead of creating a new one.
 * This is a cache key, not a secret, so a non-cryptographic digest is sufficient.
 */
export function designHash(cityName: string, settings: ArtworkSettings): string {
  const parts = [
    cityName.trim().toLowerCase(),
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
