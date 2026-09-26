import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    async function handleSession(session: any) {
      if (handledRef.current) return;
      handledRef.current = true;

      if (!session?.user) return;

      const requestedUsername = session.user.user_metadata?.username;

      if (requestedUsername) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: session.user.id,
              username: requestedUsername,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (profileError) {
          console.error("Failed to insert/update profile:", profileError);
        }
      }

      // Link any anonymous shares created with this email to the user
      if (session.user.email) {
        await supabase
          .from("shares")
          .update({ user_id: session.user.id })
          .eq("creator_email", session.user.email)
          .is("user_id", null);
      }

      toast.success("Identity verified successfully! Welcome back.");
      navigate("/gallery");
    }

    // 1. Listen for auth state changes (handles PKCE code exchange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        handleSession(session);
      }
    });

    // 2. Also try getSession immediately (session may already exist)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleSession(session);
      }
    });

    // 3. Timeout fallback — if neither fires, redirect to home
    const timer = setTimeout(() => {
      if (!handledRef.current) {
        handledRef.current = true;
        toast.error("Verification link expired or invalid. Please try again.");
        navigate("/");
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
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
