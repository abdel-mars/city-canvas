import { buildPayload, embedIntoRGBA, extractFromRGBA, type WatermarkChannel } from './watermark';
import { supabase } from '@/integrations/supabase/client';

/**
 * Browser side of the watermark: the thin layer that owns the canvas and the session, leaving
 * src/lib/watermark.ts pure and testable.
 *
 * Stamping must never break an export. A tainted canvas, a revoked blob URL or a dense poster
 * with too little flat ground are all recoverable conditions, so every failure here is swallowed
 * and reported through the return value instead of throwing into the download handler.
 */

/**
 * The creator's id, or null when anonymous.
 *
 * Read straight from the session each time rather than cached. A cache here would be wrong: the
 * session can change between two exports on the same page (someone logs in, or signs out), and a
 * stale id would watermark artwork with the previous user's uuid, which is exactly the error the
 * server-side check in create-share rejects. getSession reads local storage, so it costs nothing.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The exact bytes that will be embedded, so callers can record or verify them. */
export async function buildWatermarkPayload(): Promise<Uint8Array> {
  return buildPayload(await currentUserId());
}

/**
 * Write the watermark into a canvas in place.
 *
 * @returns true when the artwork was stamped. False means the export proceeded without one.
 */
export async function stampWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  channel: WatermarkChannel = 'rgb',
): Promise<boolean> {
  try {
    const image = ctx.getImageData(0, 0, width, height);
    const stamped = embedIntoRGBA(image.data, width, height, await buildWatermarkPayload(), { channel });
    if (!stamped) return false;
    ctx.putImageData(new ImageData(stamped, width, height), 0, 0);
    return true;
  } catch (error) {
    // A tainted canvas throws SecurityError from getImageData. Losing the watermark is better than
    // losing the poster.
    console.warn('Watermark skipped:', error);
    return false;
  }
}

/** Read a watermark back out of a canvas. Used by the verification page. */
export async function readWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  channel: WatermarkChannel = 'rgb',
) {
  try {
    const image = ctx.getImageData(0, 0, width, height);
    return { image, result: extractFromRGBA(image.data, width, height, { channel }) };
  } catch (error) {
    console.warn('Watermark read failed:', error);
    return null;
  }
}