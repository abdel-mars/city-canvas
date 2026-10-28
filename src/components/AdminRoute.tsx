import React, { useState } from "react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "./AuthModal";
import { Button } from "@/components/ui/button";

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isAdmin, user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10">
            <ShieldCheck className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">Social Studio</h1>

          {user ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                You are signed in as{" "}
                <span className="font-mono text-zinc-200">{user.email ?? "an unknown account"}</span>.
                This account is not authorized to open the studio.
              </p>
              <Button
                onClick={() => void handleLogout()}
                className="mt-6 w-full bg-white text-zinc-950 hover:bg-zinc-200"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Sign in with the City Lines administrator account to manage scheduled posts.
              </p>
              <Button
                onClick={() => setAuthOpen(true)}
                className="mt-6 w-full bg-white text-zinc-950 hover:bg-zinc-200"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Sign in
              </Button>
            </>
          )}

          <a
            href="/"
            className="mt-5 inline-block text-xs text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-300"
          >
            Return to City Lines
          </a>
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
};
