import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  imageUrl: string;
  cityName: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  imageUrl,
  cityName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `City Lines - ${cityName}`,
          text: `Check out my custom City Lines artwork for ${cityName}!`,
          url: shareUrl,
        });
        toast.success("Shared successfully!");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("Sharing failed");
        }
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-zinc-950/95 border-zinc-800 text-zinc-100 shadow-2xl backdrop-blur-xl z-50">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-400" />
            Share Artwork Gallery
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Your premium high-resolution artwork is ready and live! Anyone with this link can view it in your public gallery.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {/* Animated Card Preview Container */}
          <div className="relative group w-48 h-64 sm:w-56 sm:h-72 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-xl flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-rose-500/10 opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 w-full h-full rounded-lg overflow-hidden border border-zinc-800/50 bg-zinc-950 flex items-center justify-center">
              <motion.img
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                src={imageUrl}
                alt={cityName}
                className="max-w-full max-h-full object-contain pointer-events-none"
              />
            </div>
            {/* Ambient Shadow glow */}
            <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-500/20 to-rose-500/20 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500 -z-10" />
          </div>

          {/* Share Link Row */}
          <div className="w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                readOnly
                value={shareUrl}
                className="w-full pr-10 bg-zinc-900/60 border-zinc-800 text-zinc-300 font-mono text-xs focus-visible:ring-indigo-500 focus-visible:border-indigo-500 select-all"
              />
              <button
                onClick={handleCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                title="Copy Link"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            
            <Button
              onClick={handleNativeShare}
              variant="outline"
              size="icon"
              className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-300 shrink-0"
              title={navigator.share ? "Share..." : "Copy Link"}
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 border-t border-zinc-800/80 pt-4">
          <Button
            asChild
            variant="default"
            className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium border-0 shadow-lg shadow-indigo-600/20"
          >
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
              Visit Live Gallery
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="sm:w-24 text-zinc-400 hover:text-white hover:bg-zinc-900"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
