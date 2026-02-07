import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CitySearch from '@/components/CitySearch';
import ArtworkCanvas from '@/components/ArtworkCanvas';
import ControlPanel from '@/components/ControlPanel';
import { City, ArtworkSettings } from '@/types/artwork';
import { colorPresets } from '@/lib/presets';
import { useRoadData } from '@/hooks/useRoadData';

const Index = () => {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [settings, setSettings] = useState<ArtworkSettings>({
    preset: colorPresets[0],
    font: 'serif',
    textPosition: 'bottom',
    customName: '',
    showCustomName: false,
  });
  const { roads, isLoading, error, loadRoads } = useRoadData();
  const svgRef = useRef<SVGSVGElement>(null);

  const handleCitySelect = (city: City) => {
    setSelectedCity(city);
    loadRoads(city);
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {!selectedCity ? (
          /* ── Empty state: centered search ── */
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="min-h-screen flex flex-col items-center justify-center px-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6, ease: 'easeOut' }}
              className="text-center mb-10"
            >
              <h1 className="text-5xl md:text-6xl font-display tracking-tight text-foreground mb-3">
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
              className="w-full max-w-md"
            >
              <CitySearch onSelect={handleCitySelect} />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="mt-16 text-xs text-muted-foreground/50 tracking-wide"
            >
              Powered by OpenStreetMap
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
                onClick={() => {
                  setSelectedCity(null);
                }}
                className="text-lg font-display tracking-tight text-foreground hover:opacity-60 transition-opacity duration-200 shrink-0"
              >
                City Lines
              </button>
              <div className="flex-1 max-w-sm">
                <CitySearch onSelect={handleCitySelect} compact />
              </div>
            </header>

            {/* Main content */}
            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Artwork area */}
              <div className="flex-1 flex items-center justify-center p-6 lg:p-10 min-h-0">
                <ArtworkCanvas
                  ref={svgRef}
                  city={selectedCity}
                  roads={roads}
                  settings={settings}
                  isLoading={isLoading}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="px-6 pb-4 lg:hidden">
                  <p className="text-sm text-muted-foreground text-center">{error}</p>
                </div>
              )}

              {/* Controls sidebar */}
              <aside className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/40 overflow-y-auto">
                {error && (
                  <div className="px-6 pt-6 hidden lg:block">
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                )}
                <ControlPanel
                  settings={settings}
                  onSettingsChange={setSettings}
                  svgRef={svgRef}
                  cityName={selectedCity.name}
                  hasRoads={roads.length > 0}
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
