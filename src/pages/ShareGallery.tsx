import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Sparkles, MapPin, Compass, ArrowLeft, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface ShareData {
  id: string;
  city_name: string;
  image_url: string;
  settings_json: any;
  created_at: string;
  creator_name: string;
  creator_email: string | null;
}

export const ShareGallery: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchShare() {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from("shares")
          .select("*")
          .eq("id", id)
          .single();

        if (error) {
          console.error("Error fetching share:", error);
          toast.error("Could not load shared artwork");
          setShareData(null);
        } else {
          setShareData(data as ShareData);
          // Set page title dynamically
          document.title = `${data.city_name} by ${data.creator_name || "Artist"} — City Lines`;
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchShare();
  }, [id]);

  const handleDownload = async () => {
    if (!shareData) return;
    setDownloading(true);
    try {
      const res = await fetch(shareData.image_url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${shareData.city_name.toLowerCase().replace(/\s+/g, "-")}-city-lines.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success("Artwork downloaded successfully!");
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback
      window.open(shareData.image_url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 relative overflow-hidden">
        {/* Loading ambient background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />
        <div className="w-full max-w-lg flex flex-col items-center gap-8 z-10">
          <Skeleton className="w-72 h-96 rounded-2xl bg-zinc-900 border border-zinc-800" />
          <div className="w-full space-y-3 flex flex-col items-center">
            <Skeleton className="w-48 h-6 bg-zinc-900" />
            <Skeleton className="w-32 h-4 bg-zinc-900" />
          </div>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.05)_0%,transparent_70%)] pointer-events-none" />
        <div className="text-center space-y-6 max-w-md z-10">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Compass className="w-8 h-8 text-red-400 animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Artwork Not Found</h1>
          <p className="text-zinc-400 leading-relaxed text-sm">
            The shared gallery link might have expired, or the artwork may have been removed. Let's create your own map masterpiece!
          </p>
          <Button
            onClick={() => navigate("/")}
            className="mt-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium border-0 px-6 py-5 rounded-full"
          >
            Create Your City Canvas
          </Button>
        </div>
      </div>
    );
  }

  // Get matching ambient color from settings if available
  const settings = shareData.settings_json || {};
  const ambientColor = settings.background || "#6366f1"; // default to indigo

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-between p-6 text-zinc-100 relative overflow-hidden">
      {/* Background Radial Glow using color settings of the artwork */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000 opacity-20 blur-[150px]"
        style={{
          background: `radial-gradient(circle at center, ${ambientColor} 0%, transparent 60%)`,
        }}
      />
      {/* Grid overlay for a modern canvas look */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-5xl flex items-center justify-between z-20 pt-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Create Yours
        </button>
        
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500 font-semibold font-mono">
            Exhibition No.
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono">
            {shareData.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-5xl flex-1 flex flex-col items-center justify-center my-8 z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 w-full justify-center">
          
          {/* Framed Artwork Display */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative group shrink-0"
          >
            {/* Museum drop shadow & frame */}
            <div className="relative w-80 h-[420px] sm:w-[380px] sm:h-[500px] rounded-[24px] overflow-hidden p-4 bg-zinc-900/40 border border-zinc-800/80 shadow-[0_30px_100px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center justify-center transition-all duration-500 hover:border-zinc-700/60">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 via-transparent to-rose-500/5 opacity-50" />
              
              <div className="relative z-10 w-full h-full rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center p-2 shadow-inner">
                <img
                  src={shareData.image_url}
                  alt={shareData.city_name}
                  className="max-w-full max-h-full object-contain pointer-events-none shadow-md"
                />
              </div>
            </div>

            {/* Glowing background ring */}
            <div
              className="absolute -inset-4 rounded-[32px] opacity-10 group-hover:opacity-20 blur-2xl -z-10 transition-opacity duration-700"
              style={{ backgroundColor: ambientColor }}
            />
          </motion.div>

          {/* Description & Details Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col max-w-md text-center lg:text-left gap-6 lg:gap-8"
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800/80 text-zinc-400 text-xs mx-auto lg:mx-0">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>Custom City Map</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                {shareData.city_name}
              </h1>

              {/* Dynamic curator signature label */}
              {shareData.creator_name && (
                <div className="pt-0.5 pb-2">
                  <span className="text-zinc-500 text-xs font-mono">Curated by </span>
                  <span className="text-indigo-400 font-bold text-sm tracking-wide font-sans underline decoration-indigo-500/30 decoration-2 underline-offset-4">
                    {shareData.creator_name}
                  </span>
                </div>
              )}
              
              <p className="text-zinc-400 leading-relaxed text-sm">
                A premium, minimalist design showing the precise street grids, pathways, and unique signature contours of {shareData.city_name}. Designed and curated using City Lines custom map compiler.
              </p>
            </div>

            {/* Details Table */}
            <div className="grid grid-cols-2 gap-4 py-4 border-y border-zinc-900 text-left">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Platform
                </span>
                <p className="text-zinc-300 font-medium text-xs mt-0.5">City Lines Canvas</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Curated Date
                </span>
                <p className="text-zinc-300 font-medium text-xs mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  {new Date(shareData.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Actions CTA */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="flex-1 bg-white hover:bg-zinc-100 text-zinc-950 font-bold border-0 px-6 py-5 rounded-full shadow-lg shadow-white/5 transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <Download className="w-4 h-4" />
                {downloading ? "Downloading..." : "Download High-Res"}
              </Button>
              
              <Button
                onClick={() => navigate("/")}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold border-0 px-6 py-5 rounded-full shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Create Your Own
              </Button>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Footer Branding */}
      <footer className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between border-t border-zinc-900/80 pt-6 pb-2 text-zinc-500 text-xs gap-3 z-20">
        <p>© {new Date().getFullYear()} City Lines. Handcrafted minimal maps.</p>
        <div className="flex items-center gap-1">
          <span>Made with love on</span>
          <a
            href="/"
            className="text-zinc-300 hover:text-white font-semibold transition-colors flex items-center gap-0.5"
          >
            City Lines Editor
            <Compass className="w-3.5 h-3.5 ml-0.5" />
          </a>
        </div>
      </footer>
    </div>
  );
};
