import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2, ExternalLink, Copy, Check, Compass, Image, Plus,
  Globe, Eye, EyeOff, Settings2, Link2, User2, Save, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Artwork {
  id: string;
  city_name: string;
  image_url: string;
  settings_json: any;
  created_at: string;
  is_published?: boolean;
}

export const PersonalGallery: React.FC = () => {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Profile settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [printLink, setPrintLink] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Please sign in to access your gallery");
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Sync profile values into form
  useEffect(() => {
    if (profile) {
      setPrintLink(profile.print_link || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  const fetchArtworks = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("shares")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load your artworks");
        console.error(error);
      } else {
        setArtworks(data as Artwork[]);
      }
    } catch (err) {
      console.error("Error loading artworks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchArtworks();
    }
  }, [user]);

  const handleCopyLink = async (id: string) => {
    const slug = profile?.username || "anonymous";
    const shareUrl = `${window.location.origin}/share/${slug}/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(id);
      toast.success("Exhibition link copied!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleCopyGalleryLink = async () => {
    const slug = profile?.username || "anonymous";
    const galleryUrl = `${window.location.origin}/gallery/${slug}`;
    try {
      await navigator.clipboard.writeText(galleryUrl);
      toast.success("Gallery link copied!");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleTogglePublish = async (art: Artwork) => {
    setTogglingId(art.id);
    const newValue = !art.is_published;
    try {
      const { error } = await supabase
        .from("shares")
        .update({ is_published: newValue })
        .eq("id", art.id);

      if (error) {
        toast.error("Could not update artwork visibility");
        console.error(error);
      } else {
        setArtworks((prev) =>
          prev.map((a) => (a.id === art.id ? { ...a, is_published: newValue } : a))
        );
        toast.success(newValue ? "Published to your gallery" : "Removed from gallery");
      }
    } catch (err) {
      console.error("Toggle publish failed:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this artwork from your gallery?")) return;
    try {
      const { error } = await supabase.from("shares").delete().eq("id", id);
      if (error) {
        toast.error("Could not delete artwork");
      } else {
        setArtworks((prev) => prev.filter((art) => art.id !== id));
        toast.success("Artwork deleted from your collection");
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ print_link: printLink || null, bio: bio || null })
        .eq("id", user.id);

      if (error) {
        toast.error("Could not save profile settings");
        console.error(error);
      } else {
        toast.success("Profile settings saved!");
        refreshProfile && refreshProfile();
        setShowSettings(false);
      }
    } catch (err) {
      console.error("Save profile failed:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  if (authLoading || (loading && artworks.length === 0)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div className="space-y-2">
            <Skeleton className="w-56 h-8 bg-zinc-900" />
            <Skeleton className="w-96 h-4 bg-zinc-900" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-96 rounded-2xl bg-zinc-900 border border-zinc-800" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const curatorSlug = profile?.username || "anonymous";
  const publishedCount = artworks.filter((a) => a.is_published).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.005)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.005)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 z-10">

        {/* ── Studio Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-900 pb-8 mb-10">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <Image className="w-7 h-7 text-zinc-400" />
              Creator Studio
            </h1>
            <p className="text-zinc-500 text-sm">
              Manage your maps and control your public gallery.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Public gallery link */}
            {publishedCount > 0 && (
              <Button
                variant="ghost"
                onClick={() => navigate(`/gallery/${curatorSlug}`)}
                className="gap-1.5 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-transparent text-xs"
              >
                <Globe className="w-3.5 h-3.5" />
                My Gallery
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Button>
            )}

            {/* Copy gallery link */}
            {publishedCount > 0 && (
              <Button
                variant="ghost"
                onClick={handleCopyGalleryLink}
                className="gap-1.5 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-transparent text-xs"
              >
                <Link2 className="w-3.5 h-3.5" />
                Copy Link
              </Button>
            )}

            {/* Profile settings */}
            <Button
              variant="ghost"
              onClick={() => setShowSettings(!showSettings)}
              className="gap-1.5 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-transparent text-xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Settings
            </Button>

            {/* New map */}
            <Button
              onClick={() => navigate("/")}
              className="bg-white hover:bg-zinc-200 text-zinc-950 border-0 text-xs px-4 gap-1.5 rounded-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              Design Map
            </Button>
          </div>
        </div>

        {/* ── Profile Settings Panel ─────────────────────────────────────── */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mb-8"
            >
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User2 className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">Gallery Profile</h3>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Print Link */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500">
                      Print Link
                    </label>
                    <input
                      type="url"
                      value={printLink}
                      onChange={(e) => setPrintLink(e.target.value)}
                      placeholder="https://etsy.com/your-shop or Printify link…"
                      className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all duration-200 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 focus:border-zinc-600"
                    />
                    <p className="text-[10px] text-zinc-600">
                      Visitors will see an "Order a Print" button linking here.
                    </p>
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500">
                      Short Bio
                    </label>
                    <input
                      type="text"
                      value={bio}
                      maxLength={120}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Map enthusiast from Casablanca…"
                      className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all duration-200 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-700 focus:border-zinc-600"
                    />
                    <p className="text-[10px] text-zinc-600">
                      {120 - bio.length} characters remaining.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="bg-white hover:bg-zinc-200 text-zinc-950 border-0 text-xs px-5 gap-1.5 rounded-xl disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingProfile ? "Saving…" : "Save Settings"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Gallery Stats Bar ─────────────────────────────────────────── */}
        {artworks.length > 0 && (
          <div className="flex items-center gap-4 mb-6 text-xs text-zinc-500">
            <span>{artworks.length} map{artworks.length !== 1 ? "s" : ""} total</span>
            <span className="text-zinc-800">·</span>
            <span className="text-zinc-400 font-medium">{publishedCount} published</span>
            {publishedCount > 0 && (
              <>
                <span className="text-zinc-800">·</span>
                <a
                  href={`/gallery/${curatorSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white transition-colors underline underline-offset-4"
                >
                  citylines.co/gallery/{curatorSlug}
                </a>
              </>
            )}
          </div>
        )}

        {/* ── Artwork Grid ──────────────────────────────────────────────── */}
        <AnimatePresence mode="popLayout">
          {artworks.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {artworks.map((art) => {
                const settings = art.settings_json || {};
                const customBg = settings.background || "#18181b";

                return (
                  <motion.div
                    key={art.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className={`group bg-zinc-900/40 border rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col justify-between transition-colors ${
                      art.is_published
                        ? "border-zinc-700/60"
                        : "border-zinc-800/60 hover:border-zinc-700/40"
                    }`}
                  >
                    {/* Published badge */}
                    {art.is_published && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono uppercase tracking-wider">
                          <Globe className="w-2.5 h-2.5" />
                          Live
                        </span>
                      </div>
                    )}

                    {/* Artwork thumbnail */}
                    <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center p-2 mb-4 group-hover:shadow-[0_10px_25px_rgba(0,0,0,0.4)] transition-shadow duration-300">
                      <img
                        src={art.image_url}
                        alt={art.city_name}
                        className="max-w-full max-h-full object-contain pointer-events-none shadow-md"
                      />
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 pointer-events-none"
                        style={{ backgroundColor: customBg }}
                      />
                    </div>

                    {/* Artwork info */}
                    <div className="space-y-3 relative">
                      <div>
                        <h3 className="font-bold text-white text-sm truncate">{art.city_name}</h3>
                        <p className="text-zinc-500 text-[10px] uppercase font-mono mt-0.5 tracking-wider">
                          {new Date(art.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      {/* Action bar */}
                      <div className="flex gap-1.5 border-t border-zinc-900 pt-3.5">
                        {/* Publish toggle */}
                        <Button
                          onClick={() => handleTogglePublish(art)}
                          disabled={togglingId === art.id}
                          variant="ghost"
                          size="icon"
                          className={`shrink-0 transition-colors ${
                            art.is_published
                              ? "bg-zinc-800 text-zinc-200 hover:bg-red-950/40 hover:text-red-400"
                              : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
                          }`}
                          title={art.is_published ? "Unpublish from gallery" : "Publish to gallery"}
                        >
                          {art.is_published ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Copy share link */}
                        <Button
                          onClick={() => handleCopyLink(art.id)}
                          variant="ghost"
                          size="icon"
                          className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0"
                          title="Copy share URL"
                        >
                          {copiedId === art.id ? (
                            <Check className="w-4 h-4 text-zinc-300" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Open single share */}
                        <Button
                          asChild
                          variant="ghost"
                          className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white justify-center text-xs font-semibold gap-1"
                        >
                          <a
                            href={`/share/${curatorSlug}/${art.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>

                        {/* Delete */}
                        <Button
                          onClick={() => handleDelete(art.id)}
                          variant="ghost"
                          size="icon"
                          className="bg-zinc-900 hover:bg-red-950/40 text-zinc-500 hover:text-red-400 shrink-0"
                          title="Delete artwork"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-6 max-w-md mx-auto py-20"
            >
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
                <Compass className="w-8 h-8 text-zinc-600 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Your Studio is Empty</h2>
                <p className="text-zinc-500 leading-relaxed text-sm">
                  You haven't published any city map designs yet. Head to the design studio and create your first one!
                </p>
              </div>
              <Button
                onClick={() => navigate("/")}
                className="bg-white hover:bg-zinc-200 text-zinc-950 border-0 px-6 py-5 rounded-full text-sm"
              >
                Create Your First Map
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
