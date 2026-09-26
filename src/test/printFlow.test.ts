import { describe, it, expect } from 'vitest';
import { designHash } from '@/lib/designHash';
import { squareInches, priceFor } from '../../api/create-printify';
import { colorPresets } from '@/lib/presets';
import type { ArtworkSettings } from '@/types/artwork';

const base: ArtworkSettings = {
  preset: colorPresets[0],
  background: colorPresets[0].background,
  road: colorPresets[0].road,
  text: colorPresets[0].text,
  font: 'serif',
  textPositionY: 90,
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
    ['custom name', { ...base, customName: 'Porto' }],
    ['showCustomName', { ...base, showCustomName: true }],
  ])('changes when %s changes', (_label, next) => {
    expect(designHash('Lisbon', next)).not.toBe(designHash('Lisbon', base));
  });

  it('differs between two cities', () => {
    expect(designHash('Lisbon', base)).not.toBe(designHash('Porto', base));
  });
});

describe('squareInches', () => {
  it.each([
    ['16″ x 16″ / Matte', 16],
    ['12" x 12" / Matte', 12],
    ['20″ x 20″ / Matte', 20],
    ['28" x 28" / Matte', 28],
    ['10 x 10', 10],
  ])('accepts the square size %s', (title, expected) => {
    expect(squareInches(title)).toBe(expected);
  });

  it.each([
    '11″ x 14″ / Matte',
    '12″ x 18″ / Matte',
    '16″ x 20″ / Matte',
    '18″ x 24″ / Matte',
    '20″ x 30″ / Matte',
  ])('rejects the rectangular size %s', (title) => {
    expect(squareInches(title)).toBeNull();
  });

  it('rejects titles with no size at all', () => {
    expect(squareInches("Men's Cotton Crew Tee")).toBeNull();
    expect(squareInches('')).toBeNull();
  });
});

describe('priceFor', () => {
  it('never sells below cost', () => {
    expect(priceFor(1187)).toBeGreaterThan(1187);
    expect(priceFor(3060)).toBeGreaterThan(3060);
  });

  it('keeps a margin of at least 2x on the real poster costs', () => {
    for (const cost of [786, 895, 1187, 1314, 1396, 1481, 3060]) {
      expect(priceFor(cost)).toBeGreaterThanOrEqual(cost * 2);
    }
  });

  it('applies the floor to very cheap variants', () => {
    expect(priceFor(100)).toBe(1999);
  });
});
