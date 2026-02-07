import { useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { downloadArtwork } from '@/lib/download';

interface DownloadShareProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  textColor: string;
}

const DownloadShare = ({ svgRef, cityName, textColor }: DownloadShareProps) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!svgRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const filename = cityName.toLowerCase().replace(/\s+/g, '-');
      await downloadArtwork(svgRef.current, filename, textColor);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${cityName} — City Lines`,
      text: `A road-only artwork of ${cityName}.`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(
        `${shareData.text} ${shareData.url}`
      );
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {isDownloading ? 'Preparing...' : 'Download'}
      </button>

      <button
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-200"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>
    </div>
  );
};

export default DownloadShare;
