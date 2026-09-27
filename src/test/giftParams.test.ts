import { describe, it, expect } from 'vitest';
import { decodeGiftParams, encodeGiftParams, giftUrl } from '@/lib/giftParams';
import { designHash } from '@/lib/designHash';
import { formatPrice } from '@/lib/price';
import { colorPresets } from '@/lib/presets';
import type { ArtworkSettings, City } from '@/types/artwork';

const lisbon: City = {
  name: 'Lisbon',
  displayName: 'Lisbon, Portugal',
  lat: 38.7223,
  lon: -9.1393,
  boundingBox: [38.70, -9.20, 38.75, -9.10],
};

function settings(over: Partial<ArtworkSettings> = {}): ArtworkSettings {
  const p = colorPresets[1]; // Minimal
  return {
    preset: p,
    background: p.background,
    road: p.road,
    text: p.text,
    font: 'serif',
    textPositionY: 90,
    customName: '',
    showCustomName: false,
    ...over,
  };
}

describe('giftParams round-trip', () => {
  it('reproduces the exact same design hash', () => {
    // The invariant that matters: a gift page must resolve to the Printify product the
    // creator already bought, or the same design becomes a second, duplicate listing.
    const s = settings();
    const decoded = decodeGiftParams(encodeGiftParams(lisbon, s));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(designHash(decoded.design.city.name, decoded.design.settings)).toBe(
      designHash(lisbon.name, s),
    );
  });

  it('preserves city geometry and display name', () => {
    const decoded = decodeGiftParams(encodeGiftParams(lisbon, settings()));
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.city).toEqual(lisbon);
  });

  it('preserves every artwork setting', () => {
    const s = settings({ font: 'mono', textPositionY: 42.5, customName: 'Casablanca', showCustomName: true });
    const decoded = decodeGiftParams(encodeGiftParams(lisbon, s));
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.settings.font).toBe('mono');
    expect(decoded.design.settings.textPositionY).toBe(42.5);
    expect(decoded.design.settings.customName).toBe('Casablanca');
    expect(decoded.design.settings.showCustomName).toBe(true);
  });

  it('keeps the isNeon flag, which designHash ignores but the canvas needs', () => {
    // Neon and Minimal with identical colours would collide on the hash, so the preset has to
    // round-trip or the gift page renders the right lines without the glow.
    const neon = colorPresets.find((p) => p.isNeon);
    expect(neon).toBeDefined();
    const s = settings({ preset: neon!, background: neon!.background, road: neon!.road, text: neon!.text });
    const decoded = decodeGiftParams(encodeGiftParams(lisbon, s));
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.settings.preset.isNeon).toBe(true);
  });

  it('builds a /gift URL', () => {
    expect(giftUrl(lisbon, settings())).toMatch(/^\/gift\?city=Lisbon/);
  });
});

describe('giftParams rejection', () => {
  const cases: [string, string, string][] = [
    ['a city name with markup', 'city', 'city=%3Cscript%3E'],
    ['an empty city', 'city', 'city='],
    ['a non-numeric latitude', 'coordinates', 'lat=abc'],
    ['a latitude past the pole', 'coordinates', 'lat=91'],
    ['a longitude past the meridian', 'coordinates', 'lon=181'],
    ['a short bounding box', 'bounding-box', 'bbox=1,2,3'],
    ['an inverted bounding box', 'bounding-box', 'bbox=10,0,0,10'],
    ['a non-numeric bounding box', 'bounding-box', 'bbox=a,b,c,d'],
    ['a missing hash', 'colors', 'road=%23ZZZ'],
    ['a three-digit hex', 'colors', 'text=%23FFF'],
    ['an unknown font', 'font', 'font=comic'],
    ['a missing font', 'font', 'font='],
    ['a text position above 100', 'position', 'y=101'],
    ['a negative text position', 'position', 'y=-1'],
  ];

  it.each(cases)('rejects %s', (_label, error, patch) => {
    const params = encodeGiftParams(lisbon, settings());
    for (const [key, value] of new URLSearchParams(patch)) params.set(key, value);
    const decoded = decodeGiftParams(params);
    expect(decoded.ok).toBe(false);
    // `strict` is off in tsconfig.app.json, so a boolean-literal discriminant will not narrow.
    expect('error' in decoded ? decoded.error : undefined).toBe(error);
  });

  it('rejects an empty query string', () => {
    expect(decodeGiftParams('').ok).toBe(false);
  });

  it('never throws on hostile input', () => {
    const hostile = ['?%', '?city=%%%', `?city=${'a'.repeat(5000)}`, '?bbox=,,,', '?y=NaN'];
    for (const raw of hostile) {
      expect(() => decodeGiftParams(raw)).not.toThrow();
      expect(decodeGiftParams(raw).ok).toBe(false);
    }
  });
});

describe('giftParams fallbacks', () => {
  it('falls back to the city name when displayName is absent', () => {
    const params = encodeGiftParams(lisbon, settings());
    params.delete('display');
    const decoded = decodeGiftParams(params);
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.city.displayName).toBe('Lisbon');
  });

  it('discards a custom name the server would reject, rather than trusting the URL', () => {
    const params = encodeGiftParams(lisbon, settings({ customName: '<script>', showCustomName: true }));
    const decoded = decodeGiftParams(params);
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.settings.customName).toBe('');
  });

  it('synthesises a Custom preset for colours that match no palette', () => {
    const decoded = decodeGiftParams(
      'city=Rome&lat=41.9&lon=12.5&bbox=41.8,12.4,42,12.6&bg=%23112233&road=%23445566&text=%23778899&font=sans&y=90',
    );
    if (!decoded.ok) throw new Error('expected a valid design');
    expect(decoded.design.settings.preset.name).toBe('Custom');
    expect(decoded.design.settings.preset.background).toBe('#112233');
  });
});

describe('formatPrice', () => {
  it('formats USD cents', () => {
    expect(formatPrice(1999, 'USD')).toBe('$19.99');
    expect(formatPrice(3258, 'USD')).toBe('$32.58');
  });

  it('defaults to USD', () => {
    expect(formatPrice(2611)).toBe('$26.11');
  });

  it('degrades instead of throwing on a malformed currency from the API', () => {
    expect(() => formatPrice(2611, 'not-a-currency')).not.toThrow();
    expect(formatPrice(2611, 'not-a-currency')).toBe('26.11');
  });

  it('returns an empty string for a non-finite amount', () => {
    expect(formatPrice(Number.NaN, 'USD')).toBe('');
  });
});
