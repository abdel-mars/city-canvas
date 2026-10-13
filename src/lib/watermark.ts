/**
 * Invisible provenance watermark for exported artwork.
 *
 * A short payload (the origin domain plus the creator's UUID) is written into the least
 * significant bit of flat-background pixels. On this artwork that means the LSB of a colour that
 * is already uniform across most of the frame, so the delta is 1/255 and imperceptible.
 *
 * Four properties make it work, and all four are load-bearing:
 *
 * 1. **Carrier positions come from a fixed seed and the frame's own dimensions**, never from pixel
 *    content. A decoder holding only an image can therefore reproduce them exactly, with no key.
 *
 * 2. **Only flat ground is written.** A delta of 1/255 is invisible anywhere, but flat ground
 *    removes even the faint banding risk that LSB noise would add to the smooth gradients of the
 *    Neon preset.
 *
 * 3. **The budget is a function of frame size**, capped as a fraction of the frame, so the
 *    watermark always occupies a bounded and imperceptible share of the image.
 *
 * 4. **Slots are interleaved and merged by majority vote, with a single CRC check at the end.**
 *    This is the part that is easy to get wrong. Gating each copy on its own CRC looks stronger but
 *    is strictly weaker: damage from a pasted-over sticker is scattered randomly through the
 *    carrier list, so every copy loses a similar share of its bits, every CRC fails, and zero
 *    redundancy survives. Voting first keeps the signal from copies that are individually broken.
 *
 * Everything here is deliberately pure and DOM-free: the codec operates on a plain RGBA byte
 * array so it can be unit-tested under jsdom, which has no canvas.
 *
 * What this survives: the file being re-shared as-is, PNG re-encoding, and edits that damage part
 * of the frame (a pasted sticker, an overlaid caption).
 *
 * What it does not, and this is a hard limit rather than a tuning problem:
 *
 * - **Cropping.** Carrier positions are drawn proportionally to the frame, so a cropped image
 *   draws a different sequence and the payload cannot be reassembled. Recovering it would mean
 *   guessing the original dimensions, which is a heuristic, not a mechanism.
 * - **Resizing**, because interpolation averages the bits away.
 * - **Screenshots of the page**, because the displayed image is downscaled.
 * - **JPEG**, which destroys LSB outright. The Printify path is therefore deliberately left
 *   unwatermarked rather than stamped with something the encoder would erase.
 */

export const MARS_DOMAIN = 'mars.42web.io';
export const MARS_URL = 'https://mars.42web.io/';

const PAYLOAD_VERSION = 0x01;
const DOMAIN_OFFSET = 1;
const DOMAIN_BYTES = 13;
const USER_OFFSET = 14;
const USER_BYTES = 16;
const CRC_OFFSET = 30;

/** version + domain + uuid + crc16 */
export const PAYLOAD_BYTES = 32;
const BITS = PAYLOAD_BYTES * 8;

/** 'MARS'. Fixed rather than size-derived so a crop can be realigned against it. */
const CARRIER_SEED = 0x4d415253;

/** Below this there is not enough redundancy for a majority vote to mean anything. */
const MIN_COPIES = 6;
/** 48 copies of 32 bytes is 12288 carrier pixels, ~0.21% of a 2400x2400 export. */
const MAX_COPIES = 48;
/** Upper bound on the share of the frame we are willing to touch. */
const MAX_FRAME_FRACTION = 0.005;
/** Candidate draws per wanted carrier, since non-flat candidates get rejected along the way. */
const SAMPLE_OVERSAMPLE = 8;

export type WatermarkChannel = 'rgb' | 'alpha';

export interface WatermarkOptions {
  channel?: WatermarkChannel;
}

export interface WatermarkResult {
  found: boolean;
  domain: string | null;
  userId: string | null;
  /** Share of copies that agree with the recovered payload bit for bit; 0 when nothing was found. */
  score: number;
  /** Raw payload bytes, present whenever a payload was recovered. */
  payload: Uint8Array | null;
}

/** CRC-16/CCITT-FALSE over the payload, stored big-endian in the last two bytes. */
function crc16(bytes: Uint8Array, length: number): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How many carriers to aim for, rounded to a whole number of copies so the copy count is an
 * integer on both sides of a round trip.
 *
 * Clamping to a minimum is what keeps this stable across a crop: a small frame and a slightly
 * smaller cropped frame both bottom out at the same value, so encoder and decoder still agree on
 * the candidate list. A decoder that ends up with a *shorter* list than the encoder is also safe,
 * because a prefix of the encoder's carriers reads correctly.
 */
function resolveCarrierBudget(width: number, height: number): number {
  const byFraction = Math.floor((width * height * MAX_FRAME_FRACTION) / BITS) * BITS;
  const byMinimum = MIN_COPIES * BITS;
  return Math.min(MAX_COPIES * BITS, Math.max(byMinimum, byFraction));
}

/**
 * Build the 32-byte payload. An absent or malformed user id is written as zeros rather than
 * rejected, so anonymous exports still carry the origin.
 */
export function buildPayload(userId?: string | null): Uint8Array {
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = PAYLOAD_VERSION;
  for (let i = 0; i < DOMAIN_BYTES; i++) {
    payload[DOMAIN_OFFSET + i] = MARS_DOMAIN.charCodeAt(i) & 0xff;
  }

  const hex = (userId ?? '').replace(/-/g, '').toLowerCase();
  if (hex.length === USER_BYTES * 2 && /^[0-9a-f]+$/.test(hex)) {
    for (let i = 0; i < USER_BYTES; i++) {
      payload[USER_OFFSET + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  }

  const crc = crc16(payload, CRC_OFFSET);
  payload[CRC_OFFSET] = (crc >> 8) & 0xff;
  payload[CRC_OFFSET + 1] = crc & 0xff;
  return payload;
}

/** Inverse of buildPayload. Returns nulls when the payload is not ours. */
export function parsePayload(payload: Uint8Array): { domain: string | null; userId: string | null } {
  if (payload.length !== PAYLOAD_BYTES || payload[0] !== PAYLOAD_VERSION) {
    return { domain: null, userId: null };
  }
  let domain = '';
  for (let i = 0; i < DOMAIN_BYTES; i++) domain += String.fromCharCode(payload[DOMAIN_OFFSET + i]);
  if (domain !== MARS_DOMAIN) return { domain: null, userId: null };

  let hex = '';
  let anonymous = true;
  for (let i = 0; i < USER_BYTES; i++) {
    const byte = payload[USER_OFFSET + i];
    hex += byte.toString(16).padStart(2, '0');
    if (byte !== 0) anonymous = false;
  }
  if (anonymous) return { domain, userId: null };

  const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { domain, userId };
}

/**
 * Flat-ground test for a carrier pixel.
 *
 * It compares the eight *neighbours* against each other and never looks at the centre. That is the
 * whole trick: writing the watermark only changes the centre pixel, so a test that ignored the
 * centre would return the same answer before and after embedding, and encoder and decoder could
 * not drift apart on which slots are usable. An earlier version compared the centre too and needed
 * a tolerance of 1 to absorb its own output; excluding the centre makes the tolerance unnecessary
 * and exact, at the cost of only using pixels well inside a flat region.
 *
 * Border pixels return false, having no full neighbourhood to compare.
 */
function isFlat(data: Uint8ClampedArray, width: number, height: number, px: number, py: number): boolean {
  if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) return false;
  const base = ((py - 1) * width + (px - 1)) * 4;
  const r = data[base];
  const g = data[base + 1];
  const b = data[base + 2];

  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      if (dx === 1 && dy === 1) continue;
      const o = base + (dy * width + dx) * 4;
      if (data[o] !== r || data[o + 1] !== g || data[o + 2] !== b) return false;
    }
  }
  return true;
}

/**
 * Walk the carrier slots for a frame, calling back for each usable one.
 *
 * Slots are addressed by their *draw index*, never by their position in a compacted list. That
 * distinction is what makes crops recoverable: a crop hides the candidates that fall outside it,
 * and if carriers were compacted into an array, hiding one would shift every carrier after it and
 * desynchronise the whole payload. Addressing by draw index means a hidden slot is just a lost
 * vote, and every surviving slot still lines up with what the encoder wrote.
 *
 * Flatness is the shared predicate both sides evaluate on the same physical pixel, so encoder and
 * decoder agree slot for slot. Its tolerance has to be at least 1 for the reason given above.
 */
function walkCarriers(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  budget: number,
  accepts: (index: number, slot: number) => void,
): number {
  const rnd = mulberry32(CARRIER_SEED);
  const seen = new Set<number>();
  let accepted = 0;

  for (let slot = 0; slot < budget * SAMPLE_OVERSAMPLE && accepted < budget; slot++) {
    const x = (rnd() * width) | 0;
    const y = (rnd() * height) | 0;
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
    const index = y * width + x;
    if (seen.has(index)) continue;
    seen.add(index);
    if (!isFlat(data, width, height, x, y)) continue;
    accepts(index, slot);
    accepted++;
  }
  return accepted;
}

function bitAt(payload: Uint8Array, index: number): number {
  return (payload[index >> 3] >> (7 - (index % 8))) & 1;
}

function writeBit(data: Uint8ClampedArray, index: number, bit: number, channel: WatermarkChannel): void {
  const o = index * 4;
  if (channel === 'alpha') {
    data[o + 3] = (data[o + 3] & 0xfe) | bit;
    return;
  }
  // All three channels carry the same bit, which yields three votes per pixel for free.
  data[o] = (data[o] & 0xfe) | bit;
  data[o + 1] = (data[o + 1] & 0xfe) | bit;
  data[o + 2] = (data[o + 2] & 0xfe) | bit;
}

function readBit(data: Uint8ClampedArray, index: number, channel: WatermarkChannel): number {
  const o = index * 4;
  if (channel === 'alpha') return data[o + 3] & 1;
  return (data[o] & 1) + (data[o + 1] & 1) + (data[o + 2] & 1) >= 2 ? 1 : 0;
}

/**
 * Embed the payload into RGBA bytes. Returns a new array, or null when the frame has too little
 * flat ground to carry it (a pathologically dense city at a small scale).
 */
export function embedIntoRGBA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  payload: Uint8Array = buildPayload(),
  options: WatermarkOptions = {},
): Uint8ClampedArray | null {
  const channel = options.channel ?? 'rgb';
  if (width < 8 || height < 8 || payload.length !== PAYLOAD_BYTES) return null;

  const out = new Uint8ClampedArray(data);
  const accepted = walkCarriers(out, width, height, resolveCarrierBudget(width, height), (index, slot) =>
    writeBit(out, index, bitAt(payload, slot % BITS), channel),
  );

  return accepted >= MIN_COPIES * BITS ? out : null;
}

/**
 * Recover the payload from one candidate origin. Never throws: a missing or damaged watermark is
 * a normal outcome, reported as found: false, because callers show this to people.
 */
function extractFromFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channel: WatermarkChannel,
): WatermarkResult {
  const empty: WatermarkResult = { found: false, domain: null, userId: null, score: 0, payload: null };

  const budget = resolveCarrierBudget(width, height);
  const ones = new Uint32Array(BITS);
  // Per-bit vote counts. The denominator must be per-bit too: slots are interleaved, so each bit
  // appears in roughly accepted/BITS of them, not in all of them.
  const seenPerBit = new Uint32Array(BITS);
  const readBits = new Uint8Array(budget);
  const readSlots = new Uint32Array(budget);
  let accepted = 0;

  walkCarriers(data, width, height, budget, (index, slot) => {
    const bit = readBit(data, index, channel);
    const position = slot % BITS;
    readBits[accepted] = bit;
    readSlots[accepted] = position;
    accepted++;
    seenPerBit[position]++;
    if (bit) ones[position]++;
  });
  if (accepted < MIN_COPIES * BITS) return empty;

  // Majority vote across every slot, then a single CRC check on the merged result. See the note at
  // the top of the file: gating each copy on its own CRC throws away the redundancy this rests on.
  const merged = new Uint8Array(PAYLOAD_BYTES);
  for (let b = 0; b < BITS; b++) {
    if (seenPerBit[b] > 0 && ones[b] * 2 > seenPerBit[b]) merged[b >> 3] |= 1 << (7 - (b % 8));
  }

  const stored = (merged[CRC_OFFSET] << 8) | (merged[CRC_OFFSET + 1] ?? 0);
  if (crc16(merged, CRC_OFFSET) !== stored) return empty;

  // Agreement across slots is the honest health signal: it separates a clean read from one that
  // only just survived real damage.
  let agreeing = 0;
  for (let i = 0; i < accepted; i++) {
    if (readBits[i] === bitAt(merged, readSlots[i])) agreeing++;
  }

  const { domain, userId } = parsePayload(merged);
  if (!domain) return empty;
  return { found: true, domain, userId, score: agreeing / accepted, payload: merged };
}

/**
 * Recover the payload from an RGBA buffer. Reports found: false rather than throwing when there is
 * nothing to find, since callers display this to people.
 */
export function extractFromRGBA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: WatermarkOptions = {},
): WatermarkResult {
  if (width < 8 || height < 8) {
    return { found: false, domain: null, userId: null, score: 0, payload: null };
  }
  return extractFromFrame(data, width, height, options.channel ?? 'rgb');
}
