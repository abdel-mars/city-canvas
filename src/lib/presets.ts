import { ColorPreset, FontFamily } from '@/types/artwork';

export const colorPresets: ColorPreset[] = [
  { name: 'Classic', background: '#111111', road: '#FFFFFF', text: '#FFFFFF' },
  { name: 'Minimal', background: '#FAF8F5', road: '#2D2D2D', text: '#2D2D2D' },
  { name: 'Sand', background: '#E8DDD3', road: '#3D3D3D', text: '#3D3D3D' },
  { name: 'Navy', background: '#1B2838', road: '#F5E6D3', text: '#F5E6D3' },
  { name: 'Mars', background: '#8B2500', road: '#FAF0E6', text: '#FAF0E6' },
  { name: 'Neon', background: '#0A0A0A', road: '#00FF88', text: '#00FF88', isNeon: true },
];

export const fontMap: Record<FontFamily, string> = {
  serif: "'Cormorant Garamond', Georgia, serif",
  sans: "'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  handwritten: "'Caveat', cursive",
};

export const fontLabels: Record<FontFamily, string> = {
  serif: 'Elegant',
  sans: 'Modern',
  mono: 'Technical',
  handwritten: 'Personal',
};
