import { motion, AnimatePresence } from 'framer-motion';
import { FontFamily, TextPosition } from '@/types/artwork';
import { fontLabels, fontMap } from '@/lib/presets';

interface TypographyControlsProps {
  font: FontFamily;
  textPosition: TextPosition;
  customName: string;
  showCustomName: boolean;
  onFontChange: (font: FontFamily) => void;
  onPositionChange: (position: TextPosition) => void;
  onCustomNameChange: (name: string) => void;
  onShowCustomNameChange: (show: boolean) => void;
}

const fonts: FontFamily[] = ['serif', 'sans', 'mono', 'handwritten'];
const positions: { value: TextPosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const TypographyControls = ({
  font,
  textPosition,
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
          Typography
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

      {/* Text position */}
      <div className="space-y-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
          Position
        </span>
        <div className="flex gap-2">
          {positions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onPositionChange(value)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 ${
                textPosition === value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border hover:border-foreground/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom name */}
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
            Personal touch
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
