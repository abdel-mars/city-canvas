import { ColorPreset, FontFamily, City } from '@/types/artwork';

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

/** Cities used for the landing page background art */
export const featuredCities: City[] = [
  { name: 'Paris', displayName: 'Paris, France', lat: 48.8566, lon: 2.3522, boundingBox: [48.815, 2.225, 48.902, 2.420] },
  { name: 'Tokyo', displayName: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503, boundingBox: [35.620, 139.690, 35.720, 139.810] },
  { name: 'New York', displayName: 'New York, USA', lat: 40.7128, lon: -74.006, boundingBox: [40.700, -74.020, 40.800, -73.930] },
  { name: 'London', displayName: 'London, UK', lat: 51.5074, lon: -0.1278, boundingBox: [51.480, -0.160, 51.540, -0.040] },
  { name: 'Rome', displayName: 'Rome, Italy', lat: 41.9028, lon: 12.4964, boundingBox: [41.870, 12.430, 41.920, 12.520] },
  { name: 'Barcelona', displayName: 'Barcelona, Spain', lat: 41.3874, lon: 2.1686, boundingBox: [41.360, 2.110, 41.420, 2.200] },
];
