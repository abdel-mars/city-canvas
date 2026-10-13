import { describe, it, expect } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  crc32,
  insertPngText,
  readPngText,
} from '@/lib/pngText';

/**
 * A minimal but structurally valid PNG: signature, IHDR, IDAT, IEND. Enough to prove the chunk
 * surgery preserves the stream, without pulling in an encoder.
 */
function buildPng(width = 4, height = 4): Uint8Array {
  const encoder = new TextEncoder();
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const chunk = (type: string, data: Uint8Array) => {
    const typeBytes = encoder.encode(type);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, typeBytes.length);
    const crc = crc32(crcInput);

    const out = new Uint8Array(data.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(typeBytes, 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc);
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // compression, filter and interlace stay 0.

  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array([1, 2, 3, 4, 5])),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/** Walk the chunk stream and return every [type, declaredLength, actualLength] triple. */
function readChunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: { type: string; declared: number; crcOk: boolean }[] = [];
  let offset = 8;

  while (offset + 8 <= png.length) {
    const declared = view.getUint32(offset);
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    const dataStart = offset + 8;
    const storedCrc = view.getUint32(dataStart + declared);
    const actualCrc = crc32(png.subarray(offset + 4, dataStart + declared));
    chunks.push({ type, declared, crcOk: storedCrc === actualCrc });
    offset = dataStart + declared + 4;
  }
  return chunks;
}

describe('crc32', () => {
  it('matches the reference value for a known input', () => {
    // The standard CRC-32 check value for "123456789".
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('insertPngText', () => {
  it('writes a readable comment', () => {
    const png = insertPngText(buildPng(), 'Comment', 'https://mars.42web.io/');
    expect(readPngText(png, 'Comment')).toBe('https://mars.42web.io/');
  });

  it('produces a stream where every chunk has a valid CRC', () => {
    const png = insertPngText(buildPng(), 'Comment', 'https://mars.42web.io/');
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'tEXt', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
  });

  it('places the chunk after IHDR, where the spec allows it', () => {
    const png = insertPngText(buildPng(), 'Comment', 'https://mars.42web.io/');
    expect(readChunks(png)[1].type).toBe('tEXt');
  });

  it('grows the file by exactly the chunk size', () => {
    const original = buildPng();
    const value = 'https://mars.42web.io/';
    const png = insertPngText(original, 'Comment', value);
    // 4 length + 4 type + (7 keyword + 1 separator + value) + 4 crc
    expect(png.length - original.length).toBe(12 + 'Comment'.length + 1 + value.length);
  });

  it('leaves the rest of the file byte-identical', () => {
    const original = buildPng();
    const png = insertPngText(original, 'Comment', 'https://mars.42web.io/');
    const tail = png.subarray(33 + 12 + 'Comment'.length + 1 + 'https://mars.42web.io/'.length);
    expect(Array.from(tail)).toEqual(Array.from(original.subarray(33)));
  });

  it('returns the input untouched when given something that is not a PNG', () => {
    const notAPng = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const result = insertPngText(notAPng, 'Comment', 'x');
    expect(result).toBe(notAPng);
  });

  it('reports no comment for a PNG that has none', () => {
    expect(readPngText(buildPng(), 'Comment')).toBeNull();
  });

  it('does not find a comment when the keyword differs', () => {
    const png = insertPngText(buildPng(), 'Comment', 'https://mars.42web.io/');
    expect(readPngText(png, 'Software')).toBeNull();
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('round-trips a payload larger than the chunking step', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 0xff;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});