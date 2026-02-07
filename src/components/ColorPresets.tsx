import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { ColorPreset } from '@/types/artwork';
import { colorPresets } from '@/lib/presets';

interface ColorPresetsProps {
  selected: ColorPreset;
  onSelect: (preset: ColorPreset) => void;
}

const ColorPresets = ({ selected, onSelect }: ColorPresetsProps) => {
  return (
    <div className="space-y-3">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
        Palette
      </span>
      <div className="flex gap-3 flex-wrap">
        {colorPresets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onSelect(preset)}
            className="group relative"
            title={preset.name}
          >
            <motion.div
              className={`w-10 h-10 rounded-full overflow-hidden flex border-2 transition-colors duration-200 ${
                selected.name === preset.name
                  ? 'border-foreground'
                  : 'border-border hover:border-foreground/30'
              }`}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <div
                className="w-1/2 h-full"
                style={{ backgroundColor: preset.background }}
              />
              <div
                className="w-1/2 h-full"
                style={{ backgroundColor: preset.road }}
              />
            </motion.div>
            {preset.isNeon && (
              <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-accent" />
            )}
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {preset.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ColorPresets;
