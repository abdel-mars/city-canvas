import logoUrl from '@/assets/casanobg.png';
import { MARS_DOMAIN, MARS_URL } from '@/lib/watermark';
import { base64ToBytes, bytesToBase64, insertPngText } from '@/lib/pngText';
import { stampWatermark } from '@/lib/watermarkBrowser';

/** Shared helper: clone SVG, optionally strip background rect, return {img, url, width, height} */
async function prepareSvgImage(
  svgElement: SVGSVGElement,
  scale: number,
  transparent: boolean,
): Promise<{ img: HTMLImageElement; url: string; width: number; height: number }> {
  await document.fonts.ready;

  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  const viewBox = svgClone.viewBox.baseVal;
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;

  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));

  if (transparent) {
    // Remove the first <rect> which is the background fill
    const bgRect = svgClone.querySelector('rect');
    if (bgRect) bgRect.remove();
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    img.onload = () => resolve({ img, url, width, height });
    img.onerror = () => reject(new Error('Failed to render artwork'));
    img.src = url;
  });
}

interface Raster {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Release the SVG blob backing this raster. */
  dispose(): void;
}

/**
 * Rasterise the SVG onto a canvas.
 *
 * All five export paths used to repeat this block, which meant any post-processing step had to be
 * added five times and would silently drift between them. They share this instead, so the
 * watermark below has exactly one place to live.
 */
async function rasterize(
  svgElement: SVGSVGElement,
  scale: number,
  transparent: boolean,
): Promise<Raster> {
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, transparent);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);

  return { canvas, ctx, width, height, dispose: () => URL.revokeObjectURL(url) };
}

/** Pre-load the logo used by the visible watermark. */
async function loadLogo(): Promise<HTMLImageElement | null> {
  const logoImg = new Image();
  logoImg.crossOrigin = 'anonymous';
  logoImg.src = logoUrl;
  await new Promise<void>((resolve) => {
    logoImg!.onload = () => resolve();
    logoImg!.onerror = () => resolve();
  });
  return logoImg.naturalWidth > 0 ? logoImg : null;
}

export async function downloadArtwork(
  svgElement: SVGSVGElement,
  filename: string,
  textColor: string = '#999999',
  scale: number = 3,
  watermark: boolean = true,
): Promise<void> {
  const { canvas, ctx, width, height, dispose } = await rasterize(svgElement, scale, false);

  try {
    // Draw logo watermark
    if (watermark) {
      const logoImg = await loadLogo();
      if (logoImg) {
        const logoH = 30 * scale * 0.4;
        const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          logoImg,
          width - logoW - 15 * scale * 0.4,
          height - logoH - 15 * scale * 0.4,
          logoW,
          logoH,
        );
        ctx.globalAlpha = 1;
      }
      drawCreditLine(ctx, width, height, scale, textColor);
    }

    // Last, so it lands on top of the logo rather than underneath it.
    await stampWatermark(ctx, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create image'))),
        'image/png',
        1.0,
      );
    });

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  } finally {
    dispose();
  }
}

/**
 * A near-invisible credit line.
 *
 * The pixel watermark is invisible but fragile; this survives JPEG and screenshots, which are
 * exactly the cases it cannot cover. At 0.08 alpha it reads as a faint smudge if you look for it on
 * a calibrated display at full zoom and is invisible at any normal viewing size.
 */
function drawCreditLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  textColor: string,
): void {
  const pad = 15 * scale * 0.4;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(11 * scale * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(MARS_DOMAIN, pad, height - pad);
  ctx.restore();
}

/** Download a transparent PNG — background rect is removed */
export async function downloadArtworkTransparent(
  svgElement: SVGSVGElement,
  filename: string,
  scale: number = 3,
): Promise<void> {
  const { canvas, ctx, width, height, dispose } = await rasterize(svgElement, scale, true);

  try {
    // The background is fully transparent here, so its RGB is meaningless. The alpha channel is
    // the only place a bit can live: 0 versus 1 is invisible and, unlike RGB, survives the PNG
    // round trip intact.
    await stampWatermark(ctx, width, height, 'alpha');

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create image'))),
        'image/png',
        1.0,
      );
    });

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${filename}-transparent.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  } finally {
    dispose();
  }
}

/** Copy artwork PNG to clipboard */
export async function copyArtworkToClipboard(
  svgElement: SVGSVGElement,
  scale: number = 3,
): Promise<void> {
  const { ctx, width, height, dispose } = await rasterize(svgElement, scale, false);

  try {
    await stampWatermark(ctx, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvasToBlob(ctx.canvas, (b) => (b ? resolve(b) : reject(new Error('Failed to create image'))));
    });

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } finally {
    dispose();
  }
}

/** Small wrapper so every path reports the same failure when encoding fails. */
function canvasToBlob(canvas: HTMLCanvasElement, done: (blob: Blob | null) => void): void {
  canvas.toBlob(done, 'image/png', 1.0);
}

/** Generate a base64 PNG from the SVG. Lossless; used for the gallery, where fidelity is the point. */
export async function generateArtworkBase64(
  svgElement: SVGSVGElement,
  scale: number = 5,
): Promise<string> {
  const { canvas, ctx, width, height, dispose } = await rasterize(svgElement, scale, false);

  try {
    await stampWatermark(ctx, width, height);

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    // The tEXt comment costs nothing visually and survives the file being re-shared untouched,
    // covering the case where the pixel layer has been stripped or re-encoded.
    return bytesToBase64(insertPngText(base64ToBytes(dataUrl.split(',')[1]), 'Comment', MARS_URL));
  } finally {
    dispose();
  }
}

/**
 * JPEG quality for the Printify upload. The measured cost of going lower is small — on a Neon
 * poster, 0.92 deviates from the PNG by an RMS of 1.63/255 with only 8.7% extra gradient energy,
 * which is invisible at print size — and 0.92 is what keeps the densest posters under the
 * request-body cap. Do not raise it without re-measuring a Neon poster, which is the worst case.
 */
const PRINT_JPEG_QUALITY = 0.92;

/**
 * Base64 JPEG of the artwork, for the Printify upload.
 *
 * Deliberately not watermarked. The pixel watermark lives in the least significant bit, and JPEG's
 * DCT quantisation discards exactly those bits, so stamping here would be theatre that silently
 * fails on every print. A poster bought and printed is also a terminal act rather than something
 * that circulates as a file, which is where attribution would matter.
 *
 * JPEG rather than PNG because size here is a hard constraint, not a nicety: the endpoint caps the
 * request body (MAX_BODY_BYTES) and Vercel rejects anything over 4.5 MB before our code runs. PNG
 * size tracks road density rather than being a constant to tune against — measured at scale 5 on
 * one city, Minimal is 3.43 MB, Classic 2.98 MB, and Neon 12.99 MB, because the neon glow is a
 * large smooth gradient that PNG compresses terribly. All three exceed the ~2.86 MB of PNG the
 * body cap allows; the same posters are 1.83/1.89/2.48 MB as JPEG.
 *
 * The poster is flat colour and thin strokes on a plain ground — exactly what JPEG's DCT handles
 * well — and Printify's smallest placeholder wants 4800 px, so dropping the scale to save bytes
 * would cost more print quality than the format switch does.
 */
export async function generatePrintArtworkBase64(
  svgElement: SVGSVGElement,
  scale: number = 5,
): Promise<string> {
  const { canvas, dispose } = await rasterize(svgElement, scale, false);

  try {
    return canvas.toDataURL('image/jpeg', PRINT_JPEG_QUALITY).split(',')[1];
  } finally {
    dispose();
  }
}

/** Download the artwork as a raw SVG file */
export async function downloadSvg(svgElement: SVGSVGElement, filename: string): Promise<void> {
  await document.fonts.ready;

  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  if (!svgClone.getAttribute('xmlns')) {
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgClone);
  svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
