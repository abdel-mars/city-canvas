import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { AdminRoute } from "@/components/AdminRoute";
import Index from "./pages/Index";
import { ShareGallery } from "./pages/ShareGallery";
import { AuthCallback } from "./pages/AuthCallback";
import { SocialStudio } from "./pages/SocialStudio";
import GiftPage from "./pages/GiftPage";
import Verify from "./pages/Verify";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/gallery" element={<Navigate to="/" replace />} />
            <Route path="/gallery/:username" element={<Navigate to="/" replace />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/studio/social"
              element={
                <AdminRoute>
                  <SocialStudio />
                </AdminRoute>
              }
            />
            <Route path="/share/:creator/:id" element={<ShareGallery />} />
            <Route path="/share/:id" element={<ShareGallery />} />
            <Route path="/gift" element={<GiftPage />} />
            <Route path="/verify" element={<Verify />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
