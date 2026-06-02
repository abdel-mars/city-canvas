import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        // Supabase JS SDK automatically handles parsing the code/tokens from hash/query in URL
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (session?.user) {
          const user = session.user;
          const requestedUsername = user.user_metadata?.username;

          // If a custom username was specified during signup, create/upsert their profile
          if (requestedUsername) {
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: user.id,
                  username: requestedUsername,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "id" }
              );

            if (profileError) {
              console.error("Failed to insert/update profile:", profileError);
            }
          }

          toast.success("Identity verified successfully! Welcome back.");
          // Check if there was a saved redirect, otherwise go to gallery
          navigate("/gallery");
        } else {
          // If no session found, redirect back to home page
          navigate("/");
        }
      } catch (err: any) {
        console.error("Authentication callback error:", err);
        toast.error(err.message || "Email verification failed or link expired.");
        navigate("/");
      }
    }

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background radial effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <div className="text-center space-y-6 max-w-sm z-10">
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <ShieldCheck className="absolute -top-1 -right-1 w-5 h-5 text-emerald-400 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">Verifying Curation Link</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Securing connection with your Gmail account and establishing your art exhibition platform session...
          </p>
        </div>
      </div>
    </div>
  );
};
