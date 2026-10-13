import { describe, it, expect } from 'vitest';
import {
  MARS_DOMAIN,
  PAYLOAD_BYTES,
  buildPayload,
  embedIntoRGBA,
  extractFromRGBA,
  parsePayload,
} from '@/lib/watermark';

/** Production exports are 2400x2400 (scale 3) or 4000x4000 (scale 5). 800 keeps tests quick
 *  while still landing in the regime where the carrier budget is fraction-derived. */
const W = 800;
const H = 800;

const USER_ID = '3f8a1c2e-7b4d-4e5a-9c11-2d6e0a4b8f37';

/**
 * A stand-in for the real poster: a solid background with strokes drawn over it, which is the
 * shape the codec is tuned for. Background colours match src/lib/presets.ts.
 */
function renderPoster(width: number, height: number, bg: [number, number, number] = [250, 248, 245]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  // Horizontal "roads" every 24px, 3px thick — roughly 12% coverage, a dense-ish city.
  for (let y = 24; y < height; y += 24) {
    for (let x = 0; x < width; x++) {
      for (let d = 0; d < 3; d++) {
        const o = ((y + d) * width + x) * 4;
        data[o] = 45;
        data[o + 1] = 45;
        data[o + 2] = 45;
      }
    }
  }
  return data;
}

/** Copy a sub-rectangle, standing in for a user cropping the poster. */
function crop(data: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * width + x) * 4;
    out.set(data.subarray(src, src + w * 4), row * w * 4);
  }
  return out;
}

function watermark(image: Uint8ClampedArray, width: number, height: number, userId?: string | null) {
  return embedIntoRGBA(image, width, height, buildPayload(userId ?? USER_ID));
}

describe('payload', () => {
  it('round-trips the domain and user id', () => {
    expect(parsePayload(buildPayload(USER_ID))).toEqual({ domain: MARS_DOMAIN, userId: USER_ID });
  });

  it('keeps the domain readable in anonymous payloads', () => {
    const parsed = parsePayload(buildPayload(null));
    expect(parsed.domain).toBe(MARS_DOMAIN);
    expect(parsed.userId).toBeNull();
  });

  it('tolerates a malformed user id by falling back to anonymous', () => {
    expect(parsePayload(buildPayload('not-a-uuid')).userId).toBeNull();
  });

  it('rejects a payload from a different origin', () => {
    const foreign = buildPayload();
    foreign[1] = 'e'.charCodeAt(0);
    expect(parsePayload(foreign).domain).toBeNull();
  });

  it('is exactly 32 bytes', () => {
    expect(PAYLOAD_BYTES).toBe(32);
    expect(buildPayload(USER_ID)).toHaveLength(32);
  });
});

describe('roundtrip', () => {
  it('recovers the payload from a watermarked image', () => {
    const watermarked = watermark(renderPoster(W, H), W, H)!;

    const result = extractFromRGBA(watermarked, W, H);
    expect(result.found).toBe(true);
    expect(result.domain).toBe(MARS_DOMAIN);
    expect(result.userId).toBe(USER_ID);
    expect(result.score).toBe(1);
  });

  it('works on every preset background colour', () => {
    const presets: [string, [number, number, number]][] = [
      ['Classic', [0x11, 0x11, 0x11]],
      ['Minimal', [0xfa, 0xf8, 0xf5]],
      ['Sand', [0xe8, 0xdd, 0xd3]],
      ['Navy', [0x1b, 0x28, 0x38]],
      ['Mars', [0x8b, 0x25, 0x00]],
      ['Neon', [0x0a, 0x0a, 0x0a]],
    ];

    for (const [name, bg] of presets) {
      const watermarked = watermark(renderPoster(400, 400, bg), 400, 400)!;
      expect(extractFromRGBA(watermarked, 400, 400).userId, name).toBe(USER_ID);
    }
  });

  it('does not claim to survive a real crop', () => {
    // Locks in the documented limitation rather than leaving it as an untested assumption.
    const watermarked = watermark(renderPoster(W, H), W, H)!;
    const cropped = crop(watermarked, W, 40, 40, W - 80, H - 80);
    expect(extractFromRGBA(cropped, W - 80, H - 80).found).toBe(false);
  });

  it('recovers after a sticker covers a tenth of a production-size frame', () => {
    // This is the case the majority-vote design exists for: damage is scattered through the
    // carrier list, so no single copy survives intact and per-copy CRC gating would find nothing.
    const side = 2400;
    const original = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i++) {
      original[i * 4] = 250;
      original[i * 4 + 1] = 248;
      original[i * 4 + 2] = 245;
      original[i * 4 + 3] = 255;
    }

    const watermarked = embedIntoRGBA(original, side, side, buildPayload(USER_ID))!;
    const covered = watermarked.slice();
    const half = Math.floor(side * 0.32);
    for (let y = 100; y < 100 + half; y++) {
      for (let x = 100; x < 100 + half; x++) {
        const o = (y * side + x) * 4;
        covered[o] = 255;
        covered[o + 1] = 0;
        covered[o + 2] = 0;
        covered[o + 3] = 255;
      }
    }

    const result = extractFromRGBA(covered, side, side);
    expect(result.found).toBe(true);
    expect(result.userId).toBe(USER_ID);
    expect(result.score).toBeLessThan(1);
  });

  it('encodes into the alpha channel for transparent exports', () => {
    // Transparent export: background alpha is 0 and RGB is 0.
    const original = new Uint8ClampedArray(400 * 400 * 4);
    const watermarked = embedIntoRGBA(original, 400, 400, buildPayload(USER_ID), { channel: 'alpha' })!;

    expect(extractFromRGBA(watermarked, 400, 400, { channel: 'alpha' }).userId).toBe(USER_ID);
    // The RGB watermark must not be readable from an alpha-only image.
    expect(extractFromRGBA(watermarked, 400, 400, { channel: 'rgb' }).found).toBe(false);
  });

  it('does not mutate the array it is given', () => {
    const original = renderPoster(400, 400);
    const before = original.slice();
    watermark(original, 400, 400);
    expect(original.every((value, i) => value === before[i])).toBe(true);
  });
});

describe('invisibility', () => {
  it('changes no channel by more than 1/255', () => {
    const original = renderPoster(W, H);
    const watermarked = watermark(original, W, H)!;

    let maxDelta = 0;
    for (let i = 0; i < original.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(original[i] - watermarked[i]));
    }
    expect(maxDelta).toBeLessThanOrEqual(1);
  });

  it('touches well under 1% of the frame', () => {
    const original = renderPoster(W, H);
    const watermarked = watermark(original, W, H)!;

    let changed = 0;
    for (let i = 0; i < W * H; i++) {
      if (original[i * 4] !== watermarked[i * 4]) changed++;
    }
    expect(changed / (W * H)).toBeLessThan(0.01);
  });

  it('keeps the touched share bounded at production sizes too', () => {
    // 2400x2400 is the real gallery export size.
    const side = 2400;
    const original = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i++) {
      original[i * 4] = 250;
      original[i * 4 + 1] = 248;
      original[i * 4 + 2] = 245;
      original[i * 4 + 3] = 255;
    }
    const watermarked = watermark(original, side, side)!;

    let changed = 0;
    for (let i = 0; i < side * side; i++) {
      if (original[i * 4] !== watermarked[i * 4]) changed++;
    }
    expect(changed / (side * side)).toBeLessThan(0.005);
  });
});

describe('resilience', () => {
  it('reports not-found on an untouched image instead of throwing', () => {
    const result = extractFromRGBA(renderPoster(W, H), W, H);
    expect(result.found).toBe(false);
    expect(result.domain).toBeNull();
    expect(result.score).toBe(0);
  });

  it('reports not-found when every low bit is wiped', () => {
    // All four channels: readBit takes a majority of R/G/B, so clearing red alone would leave
    // the payload intact.
    const wiped = watermark(renderPoster(W, H), W, H)!;
    for (let i = 0; i < wiped.length; i++) wiped[i] &= 0xfe;

    expect(extractFromRGBA(wiped, W, H).found).toBe(false);
  });

  it('does not invent a payload from pure noise', () => {
    const rnd = (() => {
      let s = 12345;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const noise = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      noise[i * 4] = rnd() * 256;
      noise[i * 4 + 1] = rnd() * 256;
      noise[i * 4 + 2] = rnd() * 256;
      noise[i * 4 + 3] = 255;
    }
    expect(extractFromRGBA(noise, W, H).found).toBe(false);
  });

  it('refuses to embed when there is no flat ground to use', () => {
    const side = 64;
    const noise = new Uint8ClampedArray(side * side * 4);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const o = (y * side + x) * 4;
        noise[o] = (x * 37 + y * 11) % 256;
        noise[o + 1] = (x * 91 + y * 7) % 256;
        noise[o + 2] = (x * 13 + y * 53) % 256;
        noise[o + 3] = 255;
      }
    }
    expect(embedIntoRGBA(noise, side, side, buildPayload(USER_ID))).toBeNull();
  });

  it('rejects frames too small to carry a payload', () => {
    const tiny = new Uint8ClampedArray(4 * 4 * 4);
    expect(embedIntoRGBA(tiny, 4, 4, buildPayload())).toBeNull();
    expect(extractFromRGBA(tiny, 4, 4).found).toBe(false);
  });
});