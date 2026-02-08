import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { ColorPreset } from '@/types/artwork';
import { colorPresets } from '@/lib/presets';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ColorPresetsProps {
  selected: ColorPreset;
  onSelect: (preset: ColorPreset) => void;
  background: string;
  road: string;
  text: string;
  onBackgroundChange: (color: string) => void;
  onRoadChange: (color: string) => void;
  onTextChange: (color: string) => void;
}

const ColorPresets = ({
  selected,
  onSelect,
  background,
  road,
  text,
  onBackgroundChange,
  onRoadChange,
  onTextChange,
}: ColorPresetsProps) => {
  return (
    <div className="space-y-4">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
        Mood
      </span>
      <div className="flex gap-3 flex-wrap">
        {colorPresets.map((preset) => (
          <Tooltip key={preset.name}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelect(preset)}
                className="group relative"
              >
                <motion.div
                  className={`w-10 h-10 rounded-full overflow-hidden flex border-2 transition-colors duration-200 ${
                    selected.name === preset.name
                      ? 'border-foreground'
                      : 'border-border hover:border-foreground/30'
                  } ${preset.isNeon ? 'opacity-70 hover:opacity-100' : ''}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="w-1/2 h-full" style={{ backgroundColor: preset.background }} />
                  <div className="w-1/2 h-full" style={{ backgroundColor: preset.road }} />
                </motion.div>
                {preset.isNeon && (
                  <Lock className="absolute -top-1 -right-1 w-3 h-3 text-muted-foreground/60" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {preset.isNeon ? (
                <span className="italic">Limited edition style</span>
              ) : (
                preset.name
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Custom color pickers */}
      <div className="space-y-2.5 pt-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
          Adjust
        </span>
        <ColorRow label="Background" value={background} onChange={onBackgroundChange} />
        <ColorRow label="Roads" value={road} onChange={onRoadChange} />
        <ColorRow label="Text" value={text} onChange={onTextChange} />
      </div>
    </div>
  );
};

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-muted-foreground w-20">{label}</label>
      <div className="relative flex-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded-md border border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
        />
        <span className="text-[11px] text-muted-foreground/60 font-mono">{value}</span>
      </div>
    </div>
  );
}

export default ColorPresets;
