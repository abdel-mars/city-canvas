/**
 * PNG `tEXt` chunk helpers.
 *
 * This is the second, complementary layer of attribution. Where the pixel watermark in
 * src/lib/watermark.ts is invisible but fragile, this one is trivially readable by any PNG tool and
 * survives the file being re-shared untouched. It costs nothing visually because it never touches
 * a pixel.
 *
 * It is deliberately byte-level: the PNG chunk stream is walked and a chunk is spliced in after
 * IHDR. No image is decoded, so there is no dependency and no risk of re-encoding the poster and
 * changing it. Callers that want the pixel watermark to survive the same file should use both.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SIGNATURE_BYTES = 8;
/** Signature plus the fixed-size IHDR chunk: 8 + 4 length + 4 type + 13 data + 4 crc. */
const AFTER_IHDR = 33;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as PNG defines it, over the chunk type followed by the chunk data. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function hasSignature(png: Uint8Array): boolean {
  if (png.length < SIGNATURE_BYTES) return false;
  return PNG_SIGNATURE.every((byte, i) => png[i] === byte);
}

/** Read the value of a `tEXt` chunk with the given keyword, or null if it is not present. */
export function readPngText(png: Uint8Array, keyword: string): string | null {
  if (!hasSignature(png)) return null;

  let offset = AFTER_IHDR;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length > png.length) return null;

    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataStart + length);
      const separator = data.indexOf(0);
      if (separator === -1) return null;
      if (new TextDecoder().decode(data.subarray(0, separator)) === keyword) {
        return new TextDecoder().decode(data.subarray(separator + 1));
      }
    }
    // IEND terminates the stream; anything past it is padding we should not walk into.
    if (type === 'IEND') return null;
    offset = dataStart + length + 4;
  }
  return null;
}

/**
 * Insert a `tEXt` chunk after IHDR. Returns the input unchanged if it is not a PNG we recognise,
 * so a bad call degrades to a missing comment rather than a corrupt file.
 */
export function insertPngText(png: Uint8Array, keyword: string, value: string): Uint8Array {
  if (!hasSignature(png) || png.length < AFTER_IHDR) return png;

  const encoder = new TextEncoder();
  const key = encoder.encode(keyword);
  const text = encoder.encode(value);

  const data = new Uint8Array(key.length + 1 + text.length);
  data.set(key, 0);
  data[key.length] = 0;
  data.set(text, key.length + 1);

  const type = encoder.encode('tEXt');
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, type.length);
  const crc = crc32(crcInput);

  const out = new Uint8Array(png.length + data.length + 12);
  out.set(png.subarray(0, AFTER_IHDR), 0);

  const at = AFTER_IHDR;
  out[at] = (data.length >>> 24) & 0xff;
  out[at + 1] = (data.length >>> 16) & 0xff;
  out[at + 2] = (data.length >>> 8) & 0xff;
  out[at + 3] = data.length & 0xff;
  out.set(type, at + 4);
  out.set(data, at + 8);
  out[at + 8 + data.length] = (crc >>> 24) & 0xff;
  out[at + 9 + data.length] = (crc >>> 16) & 0xff;
  out[at + 10 + data.length] = (crc >>> 8) & 0xff;
  out[at + 11 + data.length] = crc & 0xff;

  out.set(png.subarray(AFTER_IHDR), at + data.length + 12);
  return out;
}

/** Browser base64 helpers, kept here so callers do not each reinvent the conversion. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so a multi-megabyte poster does not blow the argument limit of String.fromCharCode.
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}