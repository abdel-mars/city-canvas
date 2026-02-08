import { motion, AnimatePresence } from 'framer-motion';
import { FontFamily } from '@/types/artwork';
import { fontLabels, fontMap } from '@/lib/presets';

interface TypographyControlsProps {
  font: FontFamily;
  textPositionY: number;
  customName: string;
  showCustomName: boolean;
  onFontChange: (font: FontFamily) => void;
  onPositionChange: (y: number) => void;
  onCustomNameChange: (name: string) => void;
  onShowCustomNameChange: (show: boolean) => void;
}

const fonts: FontFamily[] = ['serif', 'sans', 'mono', 'handwritten'];

const TypographyControls = ({
  font,
  textPositionY,
  customName,
  showCustomName,
  onFontChange,
  onPositionChange,
  onCustomNameChange,
  onShowCustomNameChange,
}: TypographyControlsProps) => {
  return (
    <div className="space-y-5">
      {/* Font selection */}
      <div className="space-y-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
          Text
        </span>
        <div className="grid grid-cols-2 gap-2">
          {fonts.map((f) => (
            <button
              key={f}
              onClick={() => onFontChange(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-all duration-200 ${
                font === f
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-transparent hover:border-foreground/20'
              }`}
              style={{ fontFamily: fontMap[f] }}
            >
              {fontLabels[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Text position slider */}
      <div className="space-y-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
          Position
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/60">Top</span>
          <input
            type="range"
            min={0}
            max={100}
            value={textPositionY}
            onChange={(e) => onPositionChange(Number(e.target.value))}
            className="flex-1 h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-foreground [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-[10px] text-muted-foreground/60">Bottom</span>
        </div>
      </div>

      {/* Custom name - Details section */}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <div
            onClick={() => onShowCustomNameChange(!showCustomName)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 ${
              showCustomName
                ? 'bg-foreground border-foreground'
                : 'border-border hover:border-foreground/30'
            }`}
          >
            {showCustomName && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path
                  d="M1 4L3.5 6.5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-background"
                />
              </svg>
            )}
          </div>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
            Details
          </span>
        </label>

        <AnimatePresence>
          {showCustomName && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <input
                type="text"
                value={customName}
                onChange={(e) => onCustomNameChange(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg outline-none focus:border-foreground/20 transition-colors"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Displays as "City of {customName || '...'}"
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TypographyControls;
