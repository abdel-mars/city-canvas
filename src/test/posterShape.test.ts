import { describe, it, expect } from 'vitest';
import {
  shapeForBbox,
  bboxAspect,
  shapeGeometry,
  POSTER_SHAPES,
  isPosterShape,
  type BBox,
} from '@/lib/posterShape';

describe('posterShape', () => {
  it('corrects for latitude when measuring aspect', () => {
    // Two degrees of longitude at 60°N is half the ground distance of two degrees at the equator,
    // so a box that is wider than tall in degrees can still be square on the map.
    const nearEquator = bboxAspect([0, 0, 1, 1]);
    expect(nearEquator).toBeCloseTo(1, 4);
    const highLatitude = bboxAspect([60, 0, 61, 1]);
    expect(highLatitude).toBeLessThan(0.6);
  });

  it('snaps a wide window to horizontal', () => {
    expect(shapeForBbox([0, 0, 1, 3])).toBe('horizontal');
  });

  it('snaps a tall window to vertical', () => {
    expect(shapeForBbox([0, 0, 3, 1])).toBe('vertical');
  });

  it('snaps a balanced window to square', () => {
    expect(shapeForBbox([0, 0, 1, 1])).toBe('square');
  });

  it('measures each known city to the expected shape', () => {
    expect(shapeForBbox([48.815, 2.225, 48.902, 2.42])).toBe('horizontal'); // Paris
    expect(shapeForBbox([35.62, 139.69, 35.72, 139.81])).toBe('square'); // Tokyo
    expect(shapeForBbox([40.7, -74.02, 40.8, -73.93])).toBe('vertical'); // New York
  });

  it('falls back to square for a degenerate box rather than dividing by zero', () => {
    const flat: BBox = [10, 10, 10, 10];
    expect(shapeForBbox(flat)).toBe('square');
    expect(bboxAspect(flat)).toBe(1);
  });

  it('exposes a 4:3 horizontal and 3:4 vertical geometry', () => {
    expect(shapeGeometry('horizontal').ratio).toBeCloseTo(4 / 3, 5);
    expect(shapeGeometry('vertical').ratio).toBeCloseTo(3 / 4, 5);
    expect(shapeGeometry('square').ratio).toBe(1);
  });

  it('holds the long edge at 800 so stroke weights stay comparable', () => {
    for (const g of Object.values(POSTER_SHAPES)) {
      expect(Math.max(g.width, g.height)).toBe(800);
    }
  });

  it('validates untrusted shape values', () => {
    expect(isPosterShape('square')).toBe(true);
    expect(isPosterShape('horizontal')).toBe(true);
    expect(isPosterShape('vertical')).toBe(true);
    expect(isPosterShape('diagonal')).toBe(false);
    expect(isPosterShape(undefined)).toBe(false);
  });
});
