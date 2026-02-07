import logoUrl from '@/assets/logo-watermark.png';

export async function downloadArtwork(
  svgElement: SVGSVGElement,
  filename: string,
  _textColor: string = '#999999',
  scale: number = 3,
  watermark: boolean = true,
): Promise<void> {
  await document.fonts.ready;

  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  const viewBox = svgClone.viewBox.baseVal;
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;

  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  // Pre-load logo for watermark
  let logoImg: HTMLImageElement | null = null;
  if (watermark) {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    await new Promise<void>((resolve) => {
      logoImg!.onload = () => resolve();
      logoImg!.onerror = () => resolve(); // Continue even if logo fails
    });
  }

  return new Promise((resolve, reject) => {
    img.onload = () => {
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
          if (!blob) {
            reject(new Error('Failed to create image'));
            return;
          }
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
    };
    img.onerror = () => reject(new Error('Failed to render artwork'));
    img.src = url;
  });
}

/** Generate a base64 PNG from the SVG for Printify upload */
export async function generateArtworkBase64(
  svgElement: SVGSVGElement,
  scale: number = 5,
): Promise<string> {
  await document.fonts.ready;

  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  const viewBox = svgClone.viewBox.baseVal;
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;

  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const base64 = dataUrl.split(',')[1];
      URL.revokeObjectURL(url);
      resolve(base64);
    };
    img.onerror = () => reject(new Error('Failed to render artwork'));
    img.src = url;
  });
}
