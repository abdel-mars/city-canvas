export interface City {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  boundingBox: [number, number, number, number]; // south, west, north, east
}

export interface Road {
  id: number;
  type: string;
  geometry: { lat: number; lon: number }[];
}

export interface ColorPreset {
  name: string;
  background: string;
  road: string;
  text: string;
  isNeon?: boolean;
}

export type FontFamily = 'serif' | 'sans' | 'mono' | 'handwritten';
export type TextPosition = 'bottom' | 'center' | 'top';

export interface ArtworkSettings {
  preset: ColorPreset;
  font: FontFamily;
  textPosition: TextPosition;
  customName: string;
  showCustomName: boolean;
}
