import { forwardRef, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Road, ArtworkSettings, City } from '@/types/artwork';
import { createProjection, getStrokeWidth } from '@/lib/projection';
import { fontMap } from '@/lib/presets';
import type { BBox } from '@/lib/overpass';

const CANVAS_SIZE = 800;
const FRAMED_SHADOW = '0px 8px 30px rgba(0, 0, 0, 0.15)';

interface MockupFrameProps {
  city: City;
  roads: Road[];
  settings: ArtworkSettings;
  isLoading: boolean;
  bbox?: BBox;
  transparent?: boolean;
  label?: string;
  className?: string;
}

export const MockupFrame = forwardRef<SVGSVGElement, MockupFrameProps>(
  ({ city, roads, settings, isLoading, bbox, transparent = false, label, className = '' }, ref) => {
    const { preset, background, road, text, font, textPositionY, textSize, customName, showCustomName } = settings;
    const name = showCustomName && customName ? customName : city.name;
    const [hovered, setHovered] = useState(false);

    const projection = useMemo(
      () =>
        createProjection({
          bbox: bbox ?? city.boundingBox,
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          padding: 0,
        }),
      [bbox, city.boundingBox]
    );

    const groupedPaths = useMemo(() => {
      const groups = new Map<number, string[]>();
      roads.forEach((r) => {
        const sw = getStrokeWidth(r.type);
        const d = r.geometry
          .map(([lat, lon], i) => {
            const [x, y] = projection(lat, lon);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
          })
          .join(' ');
        const k = groups.get(sw) ?? [];
        k.push(d);
        groups.set(sw, k);
      });
      return Array.from(groups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([strokeWidth, dList]) => ({ strokeWidth, d: dList.join(' ') }));
    }, [roads, projection]);

    const textSizeFactor = 0.5 + Math.max(50, textSize) / 100;
    const baseFontSize = font === 'handwritten' ? 32 : 22;
    const fontSize = Math.round(baseFontSize * textSizeFactor);
    const letterSpacing = font === 'mono' ? 6 : font === 'sans' ? 4 : 2;

    // Loading: flat 3 dots (no skeleton)
    if (isLoading && roads.length === 0) {
      return (
        <motion.div
          className={`w-full h-full flex items-center justify-center ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex gap-2.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-foreground/50"
                animate={{ opacity: [0.25, 0.9, 0.25], scale: [0.85, 1, 0.85] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </motion.div>
      );
    }

    // Only the black frame is used, in both the resting and hover states.
    const FRAME_COLOR = '#252525';

    return (
      <motion.div
        className={`relative flex items-center justify-center [perspective:1600px] ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {/* The framed print: square with hard corners and a thin black frame. Front-on at rest,
            tilted in perspective on hover so it reads as a physical object. */}
        <motion.div
          className="relative rounded-none p-3 sm:p-4"
          style={{ backgroundColor: FRAME_COLOR, transformStyle: 'preserve-3d' }}
          animate={{
            rotateY: hovered ? 18 : 0,
            rotateX: hovered ? 4 : 0,
            scale: hovered ? 1.02 : 1,
            boxShadow: hovered
              ? '30px 26px 60px rgba(0, 0, 0, 0.45)'
              : FRAMED_SHADOW,
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Inner mat/art area */}
          <div
            className="relative rounded-none overflow-hidden"
            style={{
              width: 'min(64vh, 64vw, 560px)',
              height: 'min(64vh, 64vw, 560px)',
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: '1 / 1',
            }}
          >
            <svg
              ref={ref}
              viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
              className="w-full h-full"
              role={label ? 'img' : undefined}
              aria-label={label}
              style={{ aspectRatio: '1 / 1' }}
            >
              {!transparent && (
                <rect
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  fill={background}
                  rx={0}
                  style={{ transition: 'fill 0.4s ease' }}
                />
              )}

              {preset.isNeon && (
                <defs>
                  <filter id="mockup-neon-glow" x="-50%" y="-50%" width="200%" height="200%">
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

              <motion.g
                filter={preset.isNeon ? 'url(#mockup-neon-glow)' : undefined}
                initial={{ opacity: 0 }}
                animate={{ opacity: roads.length > 0 ? 1 : 0 }}
                transition={{ duration: 1, delay: 0.2 }}
              >
                {groupedPaths.map(({ strokeWidth, d }) => (
                  <path
                    key={strokeWidth}
                    d={d}
                    fill="none"
                    stroke={road}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'stroke 0.4s ease' }}
                  />
                ))}
              </motion.g>

              <motion.text
                initial={{ opacity: 0 }}
                animate={{ opacity: roads.length > 0 ? 1 : 0 }}
                transition={{ duration: 1.2, delay: 0.6 }}
                x={CANVAS_SIZE / 2}
                y={textPositionY * (CANVAS_SIZE / 100)}
                fill={text}
                fontFamily={fontMap[font]}
                fontSize={fontSize}
                textAnchor="middle"
                letterSpacing={`${letterSpacing}px`}
                style={{ transition: 'fill 0.4s ease', pointerEvents: 'none' }}
              >
                {name}
                {city.country && (
                  <tspan
                    x={CANVAS_SIZE / 2}
                    dy={fontSize + 2}
                    fontSize={Math.round(fontSize * 0.45)}
                    letterSpacing="2px"
                  >
                    {city.country}
                  </tspan>
                )}
              </motion.text>
            </svg>
          </div>
        </motion.div>
      </motion.div>
    );
  }
);

MockupFrame.displayName = 'MockupFrame';
