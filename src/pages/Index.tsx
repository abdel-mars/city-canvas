import { useState, useRef, useCallback, useEffect } from 'react';
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
    textSize: 50,
    customName: '',
    showCustomName: false,
  });

  const [transparent, setTransparent] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const mainRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { roads, bbox, isLoading, error, loadRoads } = useRoadData();
  const svgRef = useRef<SVGSVGElement>(null);

  const handleTransparentChange = useCallback((value: boolean) => {
    setTransparent(value);
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      setView((prev) => {
        const nextScale = Math.min(4, Math.max(0.5, prev.scale * factor));
        const actual = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: px - (px - prev.x) * actual,
          y: py - (py - prev.y) * actual,
        };
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      setView((prev) => {
        if (prev.scale <= 1) return prev;
        dragStartRef.current = { px: e.clientX, py: e.clientY, x: prev.x, y: prev.y };
        setDragging(true);
        return prev;
      });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.px;
      const dy = e.clientY - dragStartRef.current.py;
      setView((prev) => ({
        ...prev,
        x: dragStartRef.current!.x + dx,
        y: dragStartRef.current!.y + dy,
      }));
    };
    const endDrag = () => {
      dragStartRef.current = null;
      setDragging(false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [selectedCity, dragging]);

  const handleCitySelect = (city: City) => {
    setSelectedCity(city);
    loadRoads(city);
    setView({ scale: 1, x: 0, y: 0 });
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
              className={`w-full max-w-md backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border ${
                isDark ? 'bg-white/10 border-white/15' : 'bg-white/40 border-white/50'
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
            className="min-h-screen flex flex-col lg:flex-row lg:h-screen"
          >
            {/* Left column: header + artwork */}
            <div className="shrink-0 h-[55dvh] lg:h-auto lg:flex-1 min-w-0 flex flex-col relative">
              <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-4 px-5 py-3.5 bg-transparent border-none pointer-events-none">
                <div className="w-full max-w-sm pointer-events-auto">
                  <CitySearch onSelect={handleCitySelect} compact />
                </div>
              </header>

              {/* Artwork area */}
              <main
                ref={mainRef}
                className="flex-1 relative overflow-hidden"
                style={{
                  ...(transparent
                    ? {
                        backgroundColor: 'transparent',
                        backgroundImage:
                          'radial-gradient(circle, #d4d4d4 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                      }
                    : { backgroundColor: settings.background }),
                  cursor: dragging ? 'grabbing' : view.scale > 1 ? 'grab' : 'default',
                  userSelect: 'none',
                }}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ touchAction: 'none', overflow: 'hidden' }}
                >
                  <div
                    style={{
                      transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                      transformOrigin: '0 0',
                      width: '100%',
                      height: '100%',
                    }}
                  >
                    <ArtworkCanvas
                      ref={svgRef}
                      city={selectedCity}
                      roads={roads}
                      bbox={bbox ?? undefined}
                      settings={settings}
                      isLoading={isLoading}
                      transparent={transparent}
                      size="100%"
                    />
                  </div>
                </div>

                {error && (
                  <div className="px-6 pb-4 lg:hidden">
                    <p className="text-sm text-muted-foreground text-center">{error}</p>
                  </div>
                )}

                {(view.scale !== 1 || view.x !== 0 || view.y !== 0) && (
                  <button
                    type="button"
                    onClick={() => setView({ scale: 1, x: 0, y: 0 })}
                    className="absolute bottom-4 right-4 z-20 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-foreground backdrop-blur transition-colors hover:bg-card"
                  >
                    Reset view
                  </button>
                )}
              </main>
            </div>

            {/* Right panel: full height from top to bottom */}
            <aside className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/40 shadow-[0_-8px_3px_0px_rgba(0,0,0,0.25)] lg:shadow-[-11px_8px_3px_0px_rgba(0,0,0,0.25)] overflow-y-auto overflow-x-hidden lg:h-screen">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/40">
                <button
                  onClick={() => setSelectedCity(null)}
                  className="text-lg font-display tracking-tight text-foreground hover:opacity-60 transition-opacity duration-200 shrink-0"
                >
                  City Lines
                </button>
                <ThemeToggle />
              </div>

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
                bbox={bbox ?? undefined}
                hasRoads={roads.length > 0}
                onTransparentChange={handleTransparentChange}
              />
            </aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
