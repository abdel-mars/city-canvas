export async function downloadArtwork(
  svgElement: SVGSVGElement,
  filename: string,
  textColor: string = '#999999',
  scale: number = 3,
  watermark: boolean = true,
): Promise<void> {
  await document.fonts.ready;

  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

  if (watermark) {
    const viewBox = svgClone.viewBox.baseVal;
    const watermarkEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    watermarkEl.setAttribute('x', String(viewBox.width - 15));
    watermarkEl.setAttribute('y', String(viewBox.height - 15));
    watermarkEl.setAttribute('text-anchor', 'end');
    watermarkEl.setAttribute('font-size', '10');
    watermarkEl.setAttribute('opacity', '0.25');
    watermarkEl.setAttribute('fill', textColor);
    watermarkEl.setAttribute('font-family', "'DM Sans', sans-serif");
    watermarkEl.textContent = 'citylines.art';
    svgClone.appendChild(watermarkEl);
  }

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
