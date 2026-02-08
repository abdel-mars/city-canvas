import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Maximize2, Minimize2, Settings } from 'lucide-react';
import CitySearch from '@/components/CitySearch';
import ArtworkCanvas from '@/components/ArtworkCanvas';
import ControlPanel from '@/components/ControlPanel';
import BackgroundArt from '@/components/BackgroundArt';
import { City, ArtworkSettings, ColorPreset } from '@/types/artwork';
import { colorPresets } from '@/lib/presets';
import { useRoadData } from '@/hooks/useRoadData';

const Index = () => {
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
    canvasWidth: 800,
    canvasHeight: 800,
  });

  const handleCanvasResize = useCallback((width: number, height: number) => {
    setSettings(prev => ({ ...prev, canvasWidth: width, canvasHeight: height }));
  }, []);
  const [panelOpen, setPanelOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { roads, isLoading, error, loadRoads } = useRoadData();
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Cache for generated artworks by preset index
  const [presetCache, setPresetCache] = useState<Map<number, Partial<ArtworkSettings>>>(new Map());
  const [currentPresetIndex, setCurrentPresetIndex] = useState(0);

  const handleCitySelect = (city: City) => {
    setSelectedCity(city);
    loadRoads(city);
    // Reset preset index and cache when selecting a new city
    setCurrentPresetIndex(0);
    setPresetCache(new Map());
  };

  const handlePresetChange = useCallback((index: number) => {
    setCurrentPresetIndex(index);
    const preset = colorPresets[index];
    
    // Update settings with the new preset
    setSettings(prev => ({
      ...prev,
      preset,
      background: preset.background,
      road: preset.road,
      text: preset.text,
    }));

    // Cache the current settings for this preset if roads are loaded
    // The actual caching of road positions would need to be handled differently
    // since road positions are fetched from the API based on city
  }, []);

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
            <BackgroundArt />

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6, ease: 'easeOut' }}
              className="text-center mb-10"
            >
              <h1 className="text-5xl md:text-6xl font-display tracking-tight text-foreground mb-3" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.15)' }}>
                City Lines
              </h1>
              <p className="text-muted-foreground text-lg font-light" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.10)' }}>
                Turn your city into art
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: 'easeOut' }}
              className="w-full max-w-md bg-white/60 backdrop-blur-md rounded-xl shadow-lg"
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
            {!isFullscreen && (
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
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-2 rounded-lg border border-border hover:border-foreground/20 transition-colors"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setPanelOpen(!panelOpen)}
                    className="p-2 rounded-lg border border-border hover:border-foreground/20 transition-colors lg:flex hidden"
                    title="Toggle controls"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </header>
            )}

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
                  isFullscreen={isFullscreen}
                  showControls={panelOpen && !isFullscreen}
                  presets={colorPresets}
                  currentPresetIndex={currentPresetIndex}
                  onPresetChange={handlePresetChange}
                  onCanvasResize={handleCanvasResize}
                />

                {/* Fullscreen exit button */}
                {isFullscreen && (
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="fixed top-6 right-6 z-[60] p-2.5 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition-colors"
                  >
                    <Minimize2 className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="px-6 pb-4 lg:hidden">
                  <p className="text-sm text-muted-foreground text-center">{error}</p>
                </div>
              )}

              {/* Controls sidebar — collapsible on desktop */}
              <AnimatePresence>
                {panelOpen && !isFullscreen && (
                  <motion.aside
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/40 overflow-y-auto overflow-x-hidden"
                  >
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
                  </motion.aside>
                )}
              </AnimatePresence>

              {/* Mobile controls toggle */}
              {!panelOpen && !isFullscreen && (
                <button
                  onClick={() => setPanelOpen(true)}
                  className="lg:hidden fixed bottom-6 right-6 z-30 p-3 bg-foreground text-background rounded-full shadow-lg"
                >
                  <ChevronRight className="w-5 h-5 rotate-[-90deg]" />
                </button>
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
