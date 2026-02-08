import { useState } from 'react';
import { Download, Share2, Printer } from 'lucide-react';
import { downloadArtwork, generateArtworkBase64, downloadSvg } from '@/lib/download';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DownloadShareProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  textColor: string;
}

const DownloadShare = ({ svgRef, cityName, textColor }: DownloadShareProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  const handleDownload = async () => {
    if (!svgRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const filename = cityName.toLowerCase().replace(/\s+/g, '-');
      await downloadArtwork(svgRef.current, filename, textColor);
      toast.success('Artwork downloaded');
    } catch (e) {
      console.error('Download failed:', e);
      toast.error('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSvg = async () => {
    if (!svgRef.current || isDownloadingSvg) return;
    setIsDownloadingSvg(true);
    try {
      const filename = cityName.toLowerCase().replace(/\s+/g, '-');
      await downloadSvg(svgRef.current, filename);
      toast.success('SVG downloaded');
    } catch (e) {
      console.error('SVG download failed:', e);
      toast.error('SVG download failed. Please try again.');
    } finally {
      setIsDownloadingSvg(false);
    }
  };

  const handleBuy = async () => {
    if (!svgRef.current || isBuying) return;
    setIsBuying(true);
    try {
      const base64 = await generateArtworkBase64(svgRef.current, 5);

      const { data, error } = await supabase.functions.invoke('create-printify-product', {
        body: {
          image_base64: base64,
          title: `${cityName} — City Lines Art Poster`,
          description: `A minimal road-network artwork of ${cityName}. Beautiful wall art celebrating the unique street layout of this city.`,
        },
      });

      if (error) throw error;

      if (data?.product_url) {
        window.open(data.product_url, '_blank');
      } else if (data?.error) {
        console.error('Printify error:', data.error);
        toast.error('Could not create product. Please try again.');
      }
    } catch (e) {
      console.error('Buy failed:', e);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsBuying(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${cityName} — City Lines`,
      text: `Check out this road-network artwork of ${cityName}, made with City Lines.`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (e) {
      // User cancelled or share API failed — fall through to clipboard
      if ((e as Error).name === 'AbortError') return;
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      toast.success('Link copied to clipboard');
    } catch {
      // Final fallback
      const textArea = document.createElement('textarea');
      textArea.value = `${shareData.text} ${shareData.url}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Link copied to clipboard');
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleBuy}
        disabled={isBuying}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
      >
        <Printer className="w-4 h-4" />
        {isBuying ? 'Preparing your print…' : 'Print your city'}
      </button>

      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {isDownloading ? 'Preparing…' : 'Download'}
      </button>

      <button
        onClick={handleDownloadSvg}
        disabled={isDownloadingSvg}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-200 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        {isDownloadingSvg ? 'Preparing SVG…' : 'Download SVG'}
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
