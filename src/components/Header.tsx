import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { AuthModal } from "./AuthModal";
import CitySearch from "./CitySearch";
import { Compass, User, LogOut, Image, Menu, X, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { City } from "@/types/artwork";
import logoUrl from "@/assets/casanobg.png";

interface HeaderProps {
  /** When provided, renders a compact city search bar in the center of the header */
  onCitySelect?: (city: City) => void;
  showSearch?: boolean;
  onLogoClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onCitySelect, showSearch = false, onLogoClick }) => {
  const { user, profile, logout, loading } = useAuth();
  const { theme, toggleTheme, isTransitioning } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const isDark = theme === "dark";

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full border-b transition-colors duration-500 ${
          isDark
            ? "border-zinc-900 bg-zinc-950/80 backdrop-blur-md"
            : "border-zinc-200 bg-white/80 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">

          {/* Logo & Brand */}
          <Link
            to="/"
            onClick={() => {
              if (onLogoClick) {
                onLogoClick();
              }
            }}
            className="flex items-center gap-2 group shrink-0"
          >
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl overflow-hidden flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors duration-500 shrink-0">
              <img
                src={logoUrl}
                alt="City Lines"
                className="h-full w-full object-contain scale-[2.2]"
                style={{
                  filter: isDark ? "brightness(0) invert(1)" : "none",
                }}
              />
            </div>
            <span
              className={`hidden sm:block text-base sm:text-lg font-bold tracking-tight font-display transition-colors duration-500 ${
                isDark ? "text-white" : "text-zinc-900"
              }`}
            >
              City Lines
            </span>
          </Link>

          {/* Center: Compact Search Bar (only in workspace mode) */}
          {showSearch && onCitySelect && (
            <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-auto">
              <CitySearch onSelect={onCitySelect} compact />
            </div>
          )}

          {/* Spacer when no search */}
          {!showSearch && <div className="flex-1" />}

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

            {/* Desktop Nav: My Gallery (first — primary action) */}
            <nav className="hidden md:flex items-center gap-4">
              <button
                onClick={() => {
                  if (user) {
                    navigate('/gallery');
                  } else {
                    setAuthOpen(true);
                  }
                }}
                className={`text-sm font-medium flex items-center gap-1.5 transition-colors duration-300 ${
                  isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Image className="w-4 h-4 text-indigo-500" />
                My Gallery
              </button>
            </nav>

            {/* Theme Toggle Button (utility — after nav) */}
            <motion.button
              onClick={toggleTheme}
              disabled={isTransitioning}
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.08 }}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className={`relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition-all duration-500 ${
                isDark
                  ? "border-zinc-800 bg-zinc-900 text-amber-300 hover:border-zinc-700 hover:bg-zinc-800"
                  : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-200"
              }`}
            >
              <AnimatePresence mode="wait">
                {isDark ? (
                  <motion.span
                    key="sun"
                    initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Sun className="w-4 h-4" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="moon"
                    initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Moon className="w-4 h-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Desktop Auth */}
            {!loading && (
              <div className="hidden md:flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-3">
                    {/* Profile Badge */}
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                        isDark
                          ? "bg-zinc-900 border-zinc-800 text-zinc-200"
                          : "bg-zinc-100 border-zinc-200 text-zinc-700"
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                        {(profile?.username || user.email)?.[0] || "U"}
                      </div>
                      <span className="text-xs font-mono max-w-[100px] truncate">
                        {profile?.username || user.email?.split("@")[0]}
                      </span>
                    </div>
                    <Button
                      onClick={handleLogout}
                      variant="ghost"
                      size="sm"
                      className={`flex items-center gap-1.5 text-xs ${
                        isDark
                          ? "text-zinc-400 hover:text-white hover:bg-zinc-900"
                          : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                      }`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log Out
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setAuthOpen(true)}
                    size="sm"
                    className={`flex items-center gap-1.5 px-4 rounded-xl text-sm font-medium border transition-colors ${
                      isDark
                        ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-200"
                        : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                    Sign In
                  </Button>
                )}
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                isDark
                  ? "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                  : "border-zinc-200 bg-zinc-100 text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={`md:hidden border-t px-4 py-4 space-y-4 overflow-hidden ${
                isDark ? "border-zinc-900 bg-zinc-950" : "border-zinc-200 bg-white"
              }`}
            >
              <nav className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (user) {
                      navigate('/gallery');
                    } else {
                      setAuthOpen(true);
                    }
                  }}
                  className={`text-sm font-medium py-1 flex items-center gap-1.5 text-left transition-colors ${
                    isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Image className="w-4 h-4 text-indigo-500" />
                  My Gallery
                </button>
              </nav>

              <div
                className={`border-t pt-4 flex flex-col gap-3 ${
                  isDark ? "border-zinc-900" : "border-zinc-200"
                }`}
              >
                {user ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                        {(profile?.username || user.email)?.[0] || "U"}
                      </div>
                      <span
                        className={`text-sm font-mono truncate ${
                          isDark ? "text-zinc-300" : "text-zinc-700"
                        }`}
                      >
                        {profile?.username || user.email}
                      </span>
                    </div>
                    <Button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      variant="outline"
                      className={`w-full justify-center flex items-center gap-1.5 ${
                        isDark
                          ? "bg-transparent border-zinc-800 text-zinc-400 hover:text-white"
                          : "bg-transparent border-zinc-200 text-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthOpen(true);
                    }}
                    className={`w-full justify-center flex items-center gap-1.5 border ${
                      isDark
                        ? "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-200"
                        : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    <User className="w-4 h-4 text-indigo-500" />
                    Sign In
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
};
