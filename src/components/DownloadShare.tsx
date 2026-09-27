import { useState } from 'react';
import { Download, Gift, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { downloadArtwork, downloadArtworkTransparent, downloadSvg } from '@/lib/download';
import { giftUrl } from '@/lib/giftParams';
import { toast } from 'sonner';
import { ArtworkSettings, City } from '@/types/artwork';

type ExportFormat = 'png' | 'transparent' | 'svg';

interface DownloadShareProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** The full city: a gift link carries the bounding box so the poster can be re-rendered. */
  city: City;
  settings: ArtworkSettings;
  textColor: string;
  onTransparentChange: (value: boolean) => void;
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'transparent', label: 'No bg' },
  { id: 'svg', label: 'SVG' },
];

const DownloadShare = ({ svgRef, city, settings, textColor, onTransparentChange }: DownloadShareProps) => {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [isDownloading, setIsDownloading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filename = city.name.toLowerCase().replace(/\s+/g, '-');

  const handleFormatChange = (f: ExportFormat) => {
    setFormat(f);
    onTransparentChange(f === 'transparent');
  };

  const handleGiftClick = () => {
    if (!svgRef.current) return;
    setConfirmOpen(true);
  };

  /**
   * Opens our own gift page, not Printify. The design lives in the URL, so this needs no upload,
   * no artwork encoding and no waiting — which is what lets it run synchronously inside the click
   * gesture, the only moment a new tab is reliably permitted. A new tab also keeps the editor
   * intact, since its design lives in page state that a navigation would discard.
   */
  const handleConfirmGift = () => {
    setConfirmOpen(false);
    window.open(giftUrl(city, settings), '_blank', 'noopener,noreferrer');
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
          onClick={handleGiftClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity duration-200"
        >
          <Gift className="w-4 h-4" />
          Gift it
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gift your {city.name} map?</AlertDialogTitle>
            <AlertDialogDescription>
              Opens a page for this poster, where you can pick a size and pay on Printify.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmGift}>Gift it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DownloadShare;
