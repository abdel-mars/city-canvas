import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Road, ArtworkSettings, City } from '@/types/artwork';
import { createProjection, getStrokeWidth } from '@/lib/projection';
import { fontMap } from '@/lib/presets';

interface ArtworkCanvasProps {
  city: City;
  roads: Road[];
  settings: ArtworkSettings;
  isLoading: boolean;
  isFullscreen?: boolean;
}

const CANVAS_SIZE = 800;
const PADDING = 60;

const ArtworkCanvas = forwardRef<SVGSVGElement, ArtworkCanvasProps>(
  ({ city, roads, settings, isLoading, isFullscreen }, ref) => {
    const { background, road, text, font, textPositionY, customName, showCustomName, preset } = settings;

    const project = useMemo(() => {
      return createProjection({
        bbox: city.boundingBox,
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        padding: PADDING,
      });
    }, [city.boundingBox]);

    const paths = useMemo(() => {
      return roads.map((r) => {
        const d = r.geometry
          .map((p, i) => {
            const [x, y] = project(p.lat, p.lon);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        return { id: r.id, d, type: r.type };
      });
    }, [roads, project]);

    // Map 0–100 slider to canvas Y
    const textY = 30 + (textPositionY / 100) * (CANVAS_SIZE - 55);
    const dominantBaseline =
      textPositionY < 20 ? 'hanging' : textPositionY > 80 ? 'auto' : 'central';

    const displayText =
      showCustomName && customName ? `City of ${customName}` : city.name;

    const fontSize = font === 'handwritten' ? 32 : 22;
    const letterSpacing = font === 'mono' ? 6 : font === 'sans' ? 4 : 2;

    return (
      <motion.div
        className={`relative flex items-center justify-center ${
          isFullscreen
            ? 'fixed inset-0 z-50 bg-black/90 p-6'
            : 'w-full'
        }`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div
          className={isFullscreen ? 'w-full h-full flex items-center justify-center' : ''}
          style={
            !isFullscreen
              ? {
                  boxShadow:
                    '0 8px 40px -8px rgba(0,0,0,0.15), 0 2px 12px -4px rgba(0,0,0,0.08)',
                  borderRadius: '12px',
                }
              : undefined
          }
        >
          <svg
            ref={ref}
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            className="w-full h-full rounded-lg"
            style={{
              maxHeight: isFullscreen ? '92vh' : '72vh',
              maxWidth: isFullscreen ? '92vh' : '72vh',
              aspectRatio: '1 / 1',
            }}
          >
            {/* Background */}
            <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill={background} rx={isFullscreen ? 0 : 8} />

            {/* Neon glow filter */}
            {preset.isNeon && (
              <defs>
                <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur1" />
                  <feGaussianBlur stdDeviation="4" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur2" />
                    <feMergeNode in="blur1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            )}

            {/* Roads */}
            <motion.g
              filter={preset.isNeon ? 'url(#neon-glow)' : undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: roads.length > 0 ? 1 : 0 }}
              transition={{ duration: 1, delay: 0.2 }}
            >
              {paths.map(({ id, d, type }) => (
                <path
                  key={id}
                  d={d}
                  fill="none"
                  stroke={road}
                  strokeWidth={getStrokeWidth(type)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </motion.g>

            {/* City name */}
            {roads.length > 0 && (
              <motion.text
                x={CANVAS_SIZE / 2}
                y={textY}
                textAnchor="middle"
                dominantBaseline={dominantBaseline}
                fill={text}
                fontFamily={fontMap[font]}
                fontSize={fontSize}
                fontWeight={font === 'serif' ? 400 : 300}
                letterSpacing={letterSpacing}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                {displayText.toUpperCase()}
              </motion.text>
            )}
          </svg>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: text }}
                  animate={{ opacity: [0.2, 0.7, 0.2] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.25,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  },
);

ArtworkCanvas.displayName = 'ArtworkCanvas';
export default ArtworkCanvas;
