import { useState, useEffect } from 'react';
import { Download, Share2, Printer, Copy, Loader2, Mail, User, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import {
  downloadArtwork,
  downloadArtworkTransparent,
  downloadSvg,
  copyArtworkToClipboard,
} from '@/lib/download';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createShare } from '@/lib/share';
import { ShareModal } from './ShareModal';
import { ArtworkSettings } from '@/types/artwork';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [isCopying, setIsCopying] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Auth & Sharing custom state
  const { user, profile, sendMagicLink } = useAuth();
  const [showIdentityPrompt, setShowIdentityPrompt] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [authSending, setAuthSending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareImageUrl, setShareImageUrl] = useState('');

  // Update username default value when customName settings changes
  useEffect(() => {
    if (settings.customName) {
      setUsernameInput(settings.customName.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
    }
  }, [settings.customName]);

  const filename = cityName.toLowerCase().replace(/\s+/g, '-');

  const handleFormatChange = (f: ExportFormat) => {
    setFormat(f);
    onTransparentChange(f === 'transparent');
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

  const handleCopy = async () => {
    if (!svgRef.current || isCopying) return;
    setIsCopying(true);
    try {
      await copyArtworkToClipboard(svgRef.current);
      toast.success('Image copied to clipboard');
    } catch (e) {
      console.error('Copy failed:', e);
      toast.error('Copy not supported in this browser.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleBuy = async () => {
    // Printify purchase flow remains unchanged
    toast.info("Coming soon!");
  };

  // Perform actual Supabase sharing upload
  const executeSharing = async (creatorName: string, creatorEmail: string | null) => {
    if (!svgRef.current) return;
    setIsSharing(true);

    try {
      const activeUserId = user?.id || null;
      const result = await createShare(
        svgRef.current,
        cityName,
        settings,
        activeUserId,
        creatorName,
        creatorEmail
      );

      setShareUrl(result.shareUrl);
      setShareImageUrl(result.imageUrl);
      setShareModalOpen(true);
      setShowIdentityPrompt(false);
      setMagicLinkSent(false);
    } catch (e: any) {
      console.error('Sharing failed:', e);
      toast.error(e.message || 'Could not upload sharing assets. Copying local link instead.');

      // Fallback
      const fallbackUrl = window.location.href;
      try {
        await navigator.clipboard.writeText(fallbackUrl);
        toast.success('Local designer link copied to clipboard!');
      } catch (clipErr) {
        console.error('Fallback clipboard copy failed:', clipErr);
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Core trigger for Share button
  const handleShareClick = () => {
    // If user is already logged in, share directly in one click!
    if (user) {
      const activeUsername = profile?.username || user.email?.split('@')[0] || 'Curator';
      executeSharing(activeUsername, user.email || null);
    } else {
      // If not logged in, reveal the frictionless options panel
      setShowIdentityPrompt(true);
    }
  };

  // Trigger magic link sign up/verification
  const handleClaimWithGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) {
      toast.error("Please enter a valid Gmail address");
      return;
    }

    const cleanUsername = usernameInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanUsername) {
      toast.error("Please choose a creator username");
      return;
    }

    setAuthSending(true);
    try {
      // 1. Send the OTP magic sign-in link containing metadata
      await sendMagicLink(emailInput, cleanUsername);
      setMagicLinkSent(true);
      toast.success("Magic curation link sent to Gmail!");

      // 2. Perform background anonymous upload so they get their link instantly while waiting!
      // This is the ultimate "NO FRUSTRATION" solution: they don't have to wait for the email
      // to see their custom link created right away!
      await executeSharing(cleanUsername, emailInput);
    } catch (err: any) {
      console.error("Auth request failed:", err);
      toast.error(err.message || "Failed to trigger curation link");
    } finally {
      setAuthSending(false);
    }
  };

  const handleShareAnonymously = () => {
    executeSharing('Anonymous', null);
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!showIdentityPrompt ? (
          <motion.div
            key="actions-panel"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-3"
          >
            {/* Section label */}
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Export Options
            </span>

            {/* Format selector pills */}
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

            {/* Primary download button */}
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

            {/* Secondary Actions */}
            <div className="flex gap-2">
              <button
                id="copy-image-btn"
                onClick={handleCopy}
                disabled={isCopying}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 hover:text-white hover:border-zinc-700/80 transition-all duration-200 disabled:opacity-50"
              >
                {isCopying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {isCopying ? 'Copying…' : 'Copy'}
              </button>

              <button
                id="share-btn"
                onClick={handleShareClick}
                disabled={isSharing}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 hover:text-white hover:border-zinc-700/80 transition-all duration-200 disabled:opacity-50"
              >
                {isSharing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                )}
                {isSharing ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Frictionless Identity / Claim Panel */
          <motion.div
            key="identity-prompt"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4 backdrop-blur-xl relative overflow-hidden"
          >
            <button
              onClick={() => setShowIdentityPrompt(false)}
              className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-6">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Brand Your Gallery Link
              </h4>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Verifying with Gmail lets you claim your custom URL slug and access your Curator Studio showcase dashboard.
              </p>
            </div>

            {!magicLinkSent ? (
              <form onSubmit={handleClaimWithGmail} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-mono text-zinc-500 tracking-wider flex items-center gap-1">
                    <User className="w-3 h-3" /> Custom Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. abdel"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-full text-xs px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-mono text-zinc-500 tracking-wider flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Gmail Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@gmail.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={authSending || isSharing}
                    className="w-full py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-1.5"
                  >
                    {authSending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    Claim Gallery & Link
                  </button>

                  <button
                    type="button"
                    onClick={handleShareAnonymously}
                    disabled={authSending || isSharing}
                    className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-[10px] font-semibold flex items-center justify-center"
                  >
                    Share Anonymously (No Sign Up)
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 py-1 text-center">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto border border-indigo-500/20">
                  <Mail className="w-5 h-5 text-indigo-400 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-white">Gmail verification sent!</h5>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Please check your Gmail inbox at <span className="text-zinc-200">{emailInput}</span> and click the login link to fully authenticate your gallery!
                  </p>
                </div>
                <button
                  onClick={() => setMagicLinkSent(false)}
                  className="text-[10px] text-indigo-400 hover:underline"
                >
                  Edit details / Send again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal popup */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
        imageUrl={shareImageUrl}
        cityName={cityName}
      />
    </div>
  );
};

export default DownloadShare;
