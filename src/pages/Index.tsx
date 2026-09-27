import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CitySearch from '@/components/CitySearch';
import ArtworkCanvas from '@/components/ArtworkCanvas';
import ControlPanel from '@/components/ControlPanel';
import BackgroundArt from '@/components/BackgroundArt';
import { ThemeToggle } from '@/components/ThemeToggle';
import { City, ArtworkSettings } from '@/types/artwork';
import { colorPresets } from '@/lib/presets';
import { useRoadData } from '@/hooks/useRoadData';
import { useTheme } from '@/hooks/useTheme';

/** Shared by the OpenStreetMap and Mars links so both read identically. */
const CREDIT_LINK =
  'underline underline-offset-[3px] decoration-muted-foreground/30 transition-colors duration-200 ' +
  'hover:text-foreground hover:decoration-foreground/60 rounded-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const Index = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [settings, setSettings] = useState<ArtworkSettings>({
    preset: colorPresets[0],
    background: colorPresets[0].background,
    road: colorPresets[0].road,
    text: colorPresets[0].text,
    font: 'serif',
    textPositionY: 90,
    customName: '',
    showCustomName: false,
  });

  const [transparent, setTransparent] = useState(false);
  const { roads, isLoading, error, loadRoads } = useRoadData();
  const svgRef = useRef<SVGSVGElement>(null);

  const handleTransparentChange = useCallback((value: boolean) => {
    setTransparent(value);
  }, []);

  const handleCitySelect = (city: City) => {
    setSelectedCity(city);
    loadRoads(city);
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatePresence mode="wait">
        {!selectedCity ? (
          /* ── Landing: centered search + background art ── */
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            {/* Outside the centred flow, so the hero composition does not shift. */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-6">
              <ThemeToggle />
            </div>

            <BackgroundArt />

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6, ease: 'easeOut' }}
              className="text-center mb-10"
            >
              {/* A dark glow only makes sense behind light text on a dark page. */}
              <h1
                className="text-5xl md:text-6xl font-display tracking-tight text-foreground mb-3"
                style={
                  isDark
                    ? { textShadow: '0 4px 24px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.15)' }
                    : undefined
                }
              >
                City Lines
              </h1>
              <p className="text-muted-foreground text-lg font-light">
                Turn your city into art
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: 'easeOut' }}
              /* White glass on a cream page loses its edge, so light mode gets a real border. */
              className={`w-full max-w-md backdrop-blur-xl rounded-2xl shadow-2xl border ${
                isDark ? 'bg-white/40 border-white/20' : 'bg-white/70 border-zinc-200'
              }`}
            >
              <CitySearch onSelect={handleCitySelect} />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="mt-16 text-xs text-muted-foreground/50 tracking-wide"
            >
              Powered by{' '}
              {/* ODbL asks that attribution link to the copyright page. */}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className={CREDIT_LINK}
              >
                OpenStreetMap
              </a>
              <span aria-hidden="true"> · </span>
              Designed by{' '}
              <a
                href="https://elmahmoudi.42web.io/?i=1"
                target="_blank"
                rel="noopener noreferrer"
                className={CREDIT_LINK}
              >
                Mars
              </a>
            </motion.p>
          </motion.div>
        ) : (
          /* ── Workspace: artwork + controls ── */
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="min-h-screen flex flex-col"
          >
            {/* Header */}
            <header className="flex items-center gap-4 px-5 py-3.5 border-b border-border">
              <button
                onClick={() => setSelectedCity(null)}
                className="text-lg font-display tracking-tight text-foreground hover:opacity-60 transition-opacity duration-200 shrink-0"
              >
                City Lines
              </button>
              <div className="flex-1 max-w-sm">
                <CitySearch onSelect={handleCitySelect} compact />
              </div>
              <ThemeToggle />
            </header>

            {/* Main content */}
            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
            {/* Artwork area */}
              <div className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8 min-h-0">
                <ArtworkCanvas
                  ref={svgRef}
                  city={selectedCity}
                  roads={roads}
                  settings={settings}
                  isLoading={isLoading}
                  transparent={transparent}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="px-6 pb-4 lg:hidden">
                  <p className="text-sm text-muted-foreground text-center">{error}</p>
                </div>
              )}

              {/* Controls sidebar */}
              <aside className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/40 overflow-y-auto overflow-x-hidden">
                {error && (
                  <div className="px-6 pt-6 hidden lg:block">
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                )}
                <ControlPanel
                  settings={settings}
                  onSettingsChange={setSettings}
                  svgRef={svgRef}
                  city={selectedCity}
                  hasRoads={roads.length > 0}
                  onTransparentChange={handleTransparentChange}
                />
              </aside>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
