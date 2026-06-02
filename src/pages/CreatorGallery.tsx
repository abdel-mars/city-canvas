import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Compass, ArrowLeft, ShoppingBag } from "lucide-react";
import casanobgUrl from "@/assets/casanobg.png";

interface CreatorProfile {
  id: string;
  username: string;
  bio: string | null;
  print_link: string | null;
  avatar_url: string | null;
}

interface PublishedArtwork {
  id: string;
  city_name: string;
  image_url: string;
  settings_json: any;
  created_at: string;
}

export const CreatorGallery: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [artworks, setArtworks] = useState<PublishedArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PublishedArtwork | null>(null);

  useEffect(() => {
    async function load() {
      if (!username) return;
      try {
        // 1. Fetch the creator profile by username
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, bio, print_link, avatar_url")
          .eq("username", username)
          .single();

        if (profileError || !profileData) {
          setLoading(false);
          return;
        }
        setProfile(profileData as CreatorProfile);

        // 2. Fetch their published artworks
        const { data: artworksData, error: artworksError } = await supabase
          .from("shares")
          .select("id, city_name, image_url, settings_json, created_at")
          .eq("user_id", profileData.id)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (!artworksError && artworksData) {
          setArtworks(artworksData as PublishedArtwork[]);
        }
      } catch (err) {
        console.error("Gallery load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [username]);

  // Update page title
  useEffect(() => {
    if (profile) {
      document.title = `${profile.username}'s Gallery — City Lines`;
    }
  }, [profile]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-10 pb-20 space-y-10">
          <div className="flex items-center gap-4 border-b border-zinc-900 pb-8">
            <Skeleton className="w-16 h-16 rounded-full bg-zinc-900" />
            <div className="space-y-2">
              <Skeleton className="w-40 h-6 bg-zinc-900" />
              <Skeleton className="w-64 h-3 bg-zinc-900" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl bg-zinc-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Not Found ─────────────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
            <Compass className="w-6 h-6 text-zinc-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Gallery not found</h1>
          <p className="text-zinc-500 text-sm leading-relaxed">
            This creator hasn't set up their gallery yet, or the username doesn't exist.
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mt-2 underline underline-offset-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Create your own map
          </button>
        </div>
      </div>
    );
  }

  const initials = profile.username.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col relative overflow-hidden">
      {/* Subtle ambient top gradient */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-zinc-900/40 to-transparent pointer-events-none" />

      {/* ── Top nav bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          {/* Brand */}
          <a href="/" className="flex items-center gap-2 group shrink-0">
            <div className="h-7 w-7 rounded-lg overflow-hidden flex items-center justify-center bg-zinc-900 border border-zinc-800 shrink-0">
              <img
                src={casanobgUrl}
                alt="City Lines"
                className="h-full w-full object-contain scale-[2.2]"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <span className="text-xs font-semibold tracking-wide text-zinc-400 group-hover:text-white transition-colors">
              City Lines
            </span>
          </a>

          {/* Print CTA — only if creator has a print link set */}
          {profile.print_link && (
            <a
              href={profile.print_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white transition-all duration-200"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Order a Print
            </a>
          )}
        </div>
      </header>

      {/* ── Creator Identity Header ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-12 pb-10 z-10 relative"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 border-b border-zinc-900 pb-10">
          {/* Avatar initials */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
            <span className="text-xl sm:text-2xl font-bold text-zinc-300 tracking-tight font-mono">
              {initials}
            </span>
          </div>

          <div className="text-center sm:text-left space-y-1 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold font-mono">
              Creator Gallery
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {profile.username}
            </h1>
            {profile.bio && (
              <p className="text-sm text-zinc-400 leading-relaxed max-w-lg mt-1">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-center shrink-0">
            <div>
              <p className="text-xl font-bold text-white">{artworks.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mt-0.5">
                Maps
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Artwork Grid ─────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 pb-24 z-10 relative flex-1">
        {artworks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
              <Compass className="w-5 h-5 text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm">No published maps yet.</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5"
          >
            {artworks.map((art, i) => {
              const bg = art.settings_json?.background || "#18181b";
              return (
                <motion.div
                  key={art.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.4 }}
                  onClick={() => setSelected(art)}
                  className="group relative cursor-pointer rounded-2xl overflow-hidden border border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700/60 transition-all duration-300 hover:shadow-xl"
                  style={{
                    boxShadow: `0 0 0 0 ${bg}`,
                  }}
                >
                  {/* Artwork image */}
                  <div className="aspect-[3/4] flex items-center justify-center p-3 overflow-hidden">
                    <img
                      src={art.image_url}
                      alt={art.city_name}
                      className="max-w-full max-h-full object-contain shadow-md group-hover:scale-[1.02] transition-transform duration-500"
                    />
                  </div>

                  {/* Hover ambient glow */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-8 transition-opacity duration-500 pointer-events-none rounded-2xl"
                    style={{ backgroundColor: bg }}
                  />

                  {/* Bottom label */}
                  <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-zinc-950/90 via-zinc-950/40 to-transparent">
                    <p className="text-white text-xs font-semibold truncate">{art.city_name}</p>
                    <p className="text-zinc-500 text-[10px] font-mono mt-0.5">
                      {new Date(art.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              transition={{ duration: 0.25 }}
              className="relative max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close hint */}
              <button
                onClick={() => setSelected(null)}
                className="absolute -top-10 right-0 text-xs text-zinc-500 hover:text-white transition-colors tracking-wide"
              >
                Close ✕
              </button>

              {/* Framed artwork */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
                <img
                  src={selected.image_url}
                  alt={selected.city_name}
                  className="w-full object-contain rounded-xl max-h-[70vh]"
                />
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{selected.city_name}</p>
                    <p className="text-zinc-500 text-xs font-mono mt-0.5">
                      by {profile.username}
                    </p>
                  </div>
                  {profile.print_link && (
                    <a
                      href={profile.print_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Order Print
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Viral Footer Badge ───────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 py-6 z-10 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-zinc-600 text-[11px]">
            © {new Date().getFullYear()} {profile.username}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/50 hover:bg-zinc-900 transition-colors group"
          >
            <div className="h-4 w-4 rounded overflow-hidden flex items-center justify-center shrink-0">
              <img
                src={casanobgUrl}
                alt="City Lines"
                className="h-full w-full object-contain scale-[2.2]"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <span className="text-[10px] font-semibold text-zinc-500 group-hover:text-zinc-300 transition-colors tracking-wider uppercase">
              Made with City Lines
            </span>
            <ExternalLink className="w-2.5 h-2.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </a>
        </div>
      </footer>
    </div>
  );
};
