import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileSearch, ShieldAlert, Upload } from 'lucide-react';
import { readPngText } from '@/lib/pngText';
import { readWatermark } from '@/lib/watermarkBrowser';
import { MARS_DOMAIN, MARS_URL } from '@/lib/watermark';

/**
 * Reads a watermark back out of a PNG.
 *
 * Deliberately unlisted in the navigation: the extractor needs no key to run, so it is not a
 * secret, but there is no reason to advertise it. It exists so a downloaded poster can be checked
 * without leaving the site.
 */

interface Finding {
  pixels: { found: boolean; domain: string | null; userId: string | null; score: number } | null;
  comment: string | null;
  error?: string;
}

const NONE: Finding = { pixels: null, comment: null };

const Verify = () => {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inspect = useCallback(async (file: File) => {
    setBusy(true);
    setFinding(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const comment = readPngText(bytes, 'Comment');
      if (!file.type.startsWith('image/')) {
        setFinding({ ...NONE, error: 'That file is not an image.' });
        return;
      }

      const bitmap = await createImageBitmap(file);
      // Read RGB first; an alpha-channel watermark is only present in transparent exports, and
      // asking for both is cheap.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);

      const rgb = await readWatermark(ctx, bitmap.width, bitmap.height, 'rgb');
      const alpha = await readWatermark(ctx, bitmap.width, bitmap.height, 'alpha');
      const best = rgb?.result.found ? rgb.result : alpha?.result.found ? alpha.result : null;

      setFinding({ pixels: best, comment });
    } catch (error) {
      setFinding({ ...NONE, error: error instanceof Error ? error.message : 'Could not read that file.' });
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void inspect(file);
    },
    [inspect],
  );

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold">Check an artwork</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Drop a poster exported from this site to see whether it carries the {MARS_DOMAIN} mark.
        </p>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center transition-colors ${
            dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm">{busy ? 'Reading…' : 'Drop a PNG here, or click to choose a file'}</span>
          <input
            type="file"
            accept="image/png"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file);
            }}
          />
        </label>

        {finding?.error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" />
            {finding.error}
          </p>
        )}

        {finding?.pixels && (
          <div className="mt-6 rounded-xl border p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Marked as {finding.pixels.domain}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Creator</dt>
                <dd className="font-mono text-xs">
                  {finding.pixels.userId ?? 'anonymous export'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Read confidence</dt>
                <dd>{Math.round(finding.pixels.score * 100)}%</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">File comment</dt>
                <dd className="font-mono text-xs">{finding.comment ?? 'none'}</dd>
              </div>
            </dl>
          </div>
        )}

        {finding && !finding.pixels && !finding.error && (
          <div className="mt-6 rounded-xl border p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FileSearch className="h-4 w-4 text-muted-foreground" />
              No pixel watermark found
            </p>
            {finding.comment && (
              <p className="mt-3 text-sm text-muted-foreground">
                The file still carries the comment{' '}
                <span className="font-mono text-xs">{finding.comment}</span>, which means the
                metadata layer survived even though the pixels were re-encoded.
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              That is expected if the image was resized, screenshotted or saved as JPEG: the pixel
              mark lives in the least significant bit and those operations discard it.
            </p>
          </div>
        )}

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          The pixel mark survives re-sharing a PNG and edits that damage part of the frame. It does
          not survive cropping, resizing, screenshots or JPEG, which is why exports also carry a
          file comment pointing back to {MARS_URL}.
        </p>

        <Link to="/" className="mt-6 inline-block text-sm text-primary underline hover:text-primary/90">
          Back to the editor
        </Link>
      </div>
    </div>
  );
};

export default Verify;