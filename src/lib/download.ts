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

/** Generate a base64 PNG from the SVG for Printify upload */
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
