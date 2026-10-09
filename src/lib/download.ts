import logoUrl from '@/assets/casanobg.png';

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

export async function downloadArtwork(
  svgElement: SVGSVGElement,
  filename: string,
  _textColor: string = '#999999',
  scale: number = 3,
  watermark: boolean = true,
): Promise<void> {
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, false);

  // Pre-load logo for watermark
  let logoImg: HTMLImageElement | null = null;
  if (watermark) {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    await new Promise<void>((resolve) => {
      logoImg!.onload = () => resolve();
      logoImg!.onerror = () => resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    // Draw logo watermark
    if (watermark && logoImg && logoImg.naturalWidth > 0) {
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

    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Failed to create image')); return; }
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${filename}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        URL.revokeObjectURL(url);
        resolve();
      },
      'image/png',
      1.0,
    );
  });
}

/** Download a transparent PNG — background rect is removed */
export async function downloadArtworkTransparent(
  svgElement: SVGSVGElement,
  filename: string,
  scale: number = 3,
): Promise<void> {
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, true);

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    // No fillRect — canvas is transparent by default
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Failed to create image')); return; }
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${filename}-transparent.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        URL.revokeObjectURL(url);
        resolve();
      },
      'image/png',
      1.0,
    );
  });
}

/** Copy artwork PNG to clipboard */
export async function copyArtworkToClipboard(
  svgElement: SVGSVGElement,
  scale: number = 3,
): Promise<void> {
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, false);

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) { reject(new Error('Failed to create image')); return; }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          URL.revokeObjectURL(url);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      'image/png',
      1.0,
    );
  });
}

/** Generate a base64 PNG from the SVG. Lossless; used for the gallery, where fidelity is the point. */
export async function generateArtworkBase64(
  svgElement: SVGSVGElement,
  scale: number = 5,
): Promise<string> {
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, false);

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const base64 = dataUrl.split(',')[1];
    URL.revokeObjectURL(url);
    resolve(base64);
    void reject; // suppress unused warning
  });
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
  const { img, url, width, height } = await prepareSvgImage(svgElement, scale, false);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', PRINT_JPEG_QUALITY).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
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
