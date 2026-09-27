import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import { ShareGallery } from "./pages/ShareGallery";
import { PersonalGallery } from "./pages/PersonalGallery";
import { AuthCallback } from "./pages/AuthCallback";
import { CreatorGallery } from "./pages/CreatorGallery";
import GiftPage from "./pages/GiftPage";
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
            <Route path="/gallery" element={<PersonalGallery />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/gallery/:username" element={<CreatorGallery />} />
            <Route path="/share/:creator/:id" element={<ShareGallery />} />
            <Route path="/share/:id" element={<ShareGallery />} />
            <Route path="/gift" element={<GiftPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
