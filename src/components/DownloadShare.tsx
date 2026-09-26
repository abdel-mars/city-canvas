import { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import {
  downloadArtwork,
  downloadArtworkTransparent,
  downloadSvg,
  generateArtworkBase64,
} from '@/lib/download';
import { designHash } from '@/lib/designHash';
import { toast } from 'sonner';
import { ArtworkSettings } from '@/types/artwork';

type ExportFormat = 'png' | 'transparent' | 'svg';

interface DownloadShareProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  settings: ArtworkSettings;
  textColor: string;
  onTransparentChange: (value: boolean) => void;
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'transparent', label: 'No bg' },
  { id: 'svg', label: 'SVG' },
];

const DownloadShare = ({ svgRef, cityName, settings, textColor, onTransparentChange }: DownloadShareProps) => {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  const filename = cityName.toLowerCase().replace(/\s+/g, '-');

  const handleFormatChange = (f: ExportFormat) => {
    setFormat(f);
    onTransparentChange(f === 'transparent');
  };

  const handleBuy = async () => {
    if (!svgRef.current || isBuying) return;
    setIsBuying(true);
    // Opened synchronously: a window.open() after an await is usually blocked as a popup.
    const tab = window.open('', '_blank');

    const closeTab = () => {
      tab?.close();
    };

    try {
      const base64 = await generateArtworkBase64(svgRef.current, 5);
      const payload = {
        image_base64: base64,
        // The city name is the only free text sent; the server builds the listing title
        // and description itself.
        city_name: cityName,
        design_hash: designHash(cityName, settings),
      };

      let url: string | null = null;
      for (let attempt = 0; attempt < 4 && !url; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2500));
        }

        const res = await fetch('/api/create-printify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          url = data?.product_url ?? null;
          if (!url) {
            closeTab();
            toast.error('Could not prepare your print. Please try again.');
            return;
          }
        } else if (res.status === 202) {
          // The storefront has not handed back a URL yet. Retrying is safe: the request is
          // keyed on the design hash, so it will only re-poll the product it already created.
          continue;
        } else if (res.status === 429) {
          const data = await res.json().catch(() => null);
          const mins = data?.retry_after ? Math.ceil(data.retry_after / 60) : null;
          closeTab();
          toast.error(
            mins
              ? `You've created a few prints already. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
              : 'Too many prints requested. Please try again later.',
          );
          return;
        } else if (res.status === 404) {
          closeTab();
          toast.error('Printing is unavailable right now. Please try again later.');
          return;
        } else {
          closeTab();
          toast.error('Something went wrong preparing your print. Please try again.');
          return;
        }
      }

      if (!url) {
        closeTab();
        toast.error('Your print is still being prepared. Please try again in a moment.');
        return;
      }

      if (tab) {
        tab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      console.error('Buy failed:', e);
      closeTab();
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsBuying(false);
    }
  };

  const handleDownload = async () => {
    if (!svgRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      if (format === 'png') {
        await downloadArtwork(svgRef.current, filename, textColor);
      } else if (format === 'transparent') {
        await downloadArtworkTransparent(svgRef.current, filename);
      } else {
        await downloadSvg(svgRef.current, filename);
      }
      toast.success('Downloaded');
    } catch (e) {
      console.error('Download failed:', e);
      toast.error('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
          Export Options
        </span>

        <div className="flex gap-1.5 p-1 bg-secondary/60 rounded-xl">
          {FORMAT_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleFormatChange(id)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${format === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={handleBuy}
          disabled={isBuying}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          {isBuying ? 'Preparing your print…' : 'Print your city'}
        </button>

        <button
          id="download-btn"
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-zinc-950 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isDownloading ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </div>
  );
};

export default DownloadShare;
