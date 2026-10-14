import { describe, it, expect } from 'vitest';
import { designHash } from '@/lib/designHash';
import { colorPresets } from '@/lib/presets';
import type { ArtworkSettings, City } from '@/types/artwork';

const base: ArtworkSettings = {
  preset: colorPresets[0],
  background: colorPresets[0].background,
  road: colorPresets[0].road,
  text: colorPresets[0].text,
  font: 'serif',
  textPositionY: 90,
  textSize: 50,
  customName: '',
  showCustomName: false,
};

describe('designHash', () => {
  it('is stable across calls for the same configuration', () => {
    expect(designHash('Lisbon', base)).toBe(designHash('Lisbon', base));
  });

  it('matches the 8-16 hex shape the API validates', () => {
    expect(designHash('Lisbon', base)).toMatch(/^[a-f0-9]{8,16}$/);
  });

  it('ignores city name casing and surrounding whitespace', () => {
    expect(designHash('  lisbon ', base)).toBe(designHash('Lisbon', base));
  });

  it.each([
    ['city', { ...base, background: '#ff0000' }],
    ['road colour', { ...base, road: '#00ff00' }],
    ['text colour', { ...base, text: '#0000ff' }],
    ['font', { ...base, font: 'mono' as const }],
    ['text position', { ...base, textPositionY: 10 }],
    ['text size', { ...base, textSize: 80 }],
    ['custom name', { ...base, customName: 'Porto' }],
    ['showCustomName', { ...base, showCustomName: true }],
  ])('changes when %s changes', (_label, next) => {
    expect(designHash('Lisbon', next)).not.toBe(designHash('Lisbon', base));
  });

  it('differs between two cities', () => {
    expect(designHash('Lisbon', base)).not.toBe(designHash('Porto', base));
  });

  /**
   * The regressions below all come from the same place: the hash is a Printify dedupe key, so a
   * collision does not merely fail to reuse a product — it sends the buyer someone else's map.
   */
  it('separates two cities that share a name', () => {
    const france: City = {
      name: 'Paris',
      displayName: 'Paris, Île-de-France, France',
      lat: 48.8566,
      lon: 2.3522,
      boundingBox: [48.815, 2.225, 48.902, 2.42],
    };
    const texas: City = {
      name: 'Paris',
      displayName: 'Paris, Texas, United States',
      lat: 33.6603,
      lon: -95.5555,
      boundingBox: [33.6, -95.6, 33.72, -95.51],
    };

    expect(designHash('Paris', base, france)).not.toBe(designHash('Paris', base, texas));
  });

  it('separates two windows of the same city', () => {
    // What the proxy can serve depends on how busy Overpass is, so the same city legitimately
    // resolves to different windows at different times. Those are different artwork, and a poster
    // bought at one size must keep resolving to the product that matches it.
    const wide: City = {
      name: 'Tokyo',
      displayName: 'Tokyo, Japan',
      lat: 35.6762,
      lon: 139.6503,
      boundingBox: [35.5012, 139.4753, 35.8512, 139.8253],
    };
    const narrow: City = {
      ...wide,
      boundingBox: [35.6512, 139.6253, 35.7012, 139.6753],
    };

    expect(designHash('Tokyo', base, wide)).not.toBe(designHash('Tokyo', base, narrow));
  });

  it('stays stable for a city that has not changed', () => {
    const city: City = {
      name: 'Lisbon',
      displayName: 'Lisbon, Portugal',
      lat: 38.7167,
      lon: -9.1333,
      boundingBox: [38.68, -9.24, 38.79, -9.07],
    };
    expect(designHash('Lisbon', base, city)).toBe(designHash('Lisbon', base, { ...city }));
  });

  it('is insensitive to the rounding noise a bbox can pick up in transit', () => {
    // Bounding boxes travel through a URL, so two links for the same window can differ in the
    // last decimal place. Collapsing that keeps a shared link pointing at the same product.
    const city: City = {
      name: 'Porto',
      displayName: 'Porto, Portugal',
      lat: 41.1579,
      lon: -8.6291,
      boundingBox: [41.1, -8.7, 41.2, -8.5],
    };
    const nudged: City = { ...city, boundingBox: [41.10000001, -8.69999999, 41.2, -8.5] };
    expect(designHash('Porto', base, city)).toBe(designHash('Porto', base, nudged));
  });

  it('still hashes when the caller has no city object', () => {
    // Only a name is available on some paths; the key must stay well-formed rather than throw.
    expect(designHash('Lisbon', base)).toMatch(/^[a-f0-9]{8,16}$/);
  });
});

