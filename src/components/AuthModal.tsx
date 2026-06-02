import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Mail, Loader2, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { sendMagicLink } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const handleClose = () => {
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setLinkSent(false);
      setEmail("");
      setUsername("");
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

    setLoading(true);
    try {
      await sendMagicLink(email, cleanUsername || undefined);
      setLinkSent(true);
    } catch (err: any) {
      console.error("Magic link request failed:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className={`sm:max-w-[360px] w-full p-0 border shadow-xl rounded-2xl overflow-hidden transition-all duration-300 ${
          isDark
            ? "bg-zinc-950 border-zinc-900"
            : "bg-white border-zinc-100"
        }`}
      >
        <AnimatePresence mode="wait">
          {!linkSent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="px-6 py-8 space-y-6"
            >
              {/* Header */}
              <div className="space-y-1.5 text-center">
                <h2
                  className={`text-lg font-semibold tracking-tight ${
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  }`}
                >
                  City Lines Identity
                </h2>
                <p
                  className={`text-xs px-2 leading-relaxed ${
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  }`}
                >
                  Access your personal maps and collection gallery. Magic link validation, no password required.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className={`text-[9px] uppercase tracking-[0.15em] font-semibold ${
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    }`}
                  >
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoFocus
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-all duration-300 ${
                      isDark
                        ? "bg-zinc-950 border-zinc-900 text-zinc-100 placeholder-zinc-800 focus:border-zinc-700"
                        : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400"
                    }`}
                  />
                </div>

                {/* Username field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-username"
                    className={`text-[9px] uppercase tracking-[0.15em] font-semibold flex items-center justify-between ${
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    }`}
                  >
                    <span>Username</span>
                    <span className="text-[8px] font-normal lowercase tracking-normal italic text-zinc-500">
                      optional
                    </span>
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    placeholder="e.g. abdel"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                    }
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border outline-none font-mono transition-all duration-300 ${
                      isDark
                        ? "bg-zinc-950 border-zinc-900 text-zinc-100 placeholder-zinc-800 focus:border-zinc-700"
                        : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400"
                    }`}
                  />
                  {username && (
                    <p
                      className={`text-[10px] tracking-wide font-mono ${
                        isDark ? "text-zinc-650 text-zinc-600" : "text-zinc-400"
                      }`}
                    >
                      gallery link: <span className="font-semibold">/share/{username}/…</span>
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className={`w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs tracking-wider uppercase font-semibold transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed border ${
                    isDark
                      ? "bg-white hover:bg-zinc-200 text-zinc-950 border-white"
                      : "bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Trust footer */}
              <p
                className={`text-center text-[10px] leading-relaxed font-light tracking-wide ${
                  isDark ? "text-zinc-600" : "text-zinc-400/80"
                }`}
              >
                A single-use magic link will be sent to your inbox.
                <br />Secure validation. No password required.
              </p>
            </motion.div>
          ) : (
            /* ── Success State ── */
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="px-6 py-10 flex flex-col items-center text-center space-y-6"
            >
              {/* Simple Monochrome Icon */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                  isDark
                    ? "bg-zinc-950 border-zinc-900 text-zinc-400"
                    : "bg-zinc-50 border-zinc-200 text-zinc-500"
                }`}
              >
                <CheckCircle2 className="w-5 h-5 text-zinc-450 text-zinc-500" />
              </div>

              {/* Text */}
              <div className="space-y-2">
                <h2
                  className={`text-lg font-semibold tracking-tight ${
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  }`}
                >
                  Validation Link Sent
                </h2>
                <p
                  className={`text-xs leading-relaxed max-w-xs ${
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  }`}
                >
                  We have dispatched a magic login link to{" "}
                  <span className={`font-mono text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                    {email}
                  </span>
                  . Please check your inbox.
                </p>
              </div>

              {/* Open Gmail */}
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs tracking-wider uppercase font-semibold border transition-all duration-300 ${
                  isDark
                    ? "bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                    : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Open Gmail</span>
                <ExternalLink className="w-3 h-3 opacity-40" />
              </a>

              {/* Back Link */}
              <button
                onClick={() => {
                  setLinkSent(false);
                  setEmail("");
                }}
                className={`text-[10px] tracking-wide transition-colors underline underline-offset-4 ${
                  isDark
                    ? "text-zinc-650 hover:text-zinc-400 text-zinc-600"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Try a different email
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
