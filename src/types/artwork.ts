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
  /** Compact [lat, lon] tuples, produced by the geo proxy. */
  geometry: [number, number][];
}

export interface ColorPreset {
  name: string;
  background: string;
  road: string;
  text: string;
  isNeon?: boolean;
}

export type FontFamily = 'serif' | 'sans' | 'mono' | 'handwritten';

export interface ArtworkSettings {
  preset: ColorPreset;
  background: string;
  road: string;
  text: string;
  font: FontFamily;
  textPositionY: number; // 0–100
  customName: string;
  showCustomName: boolean;
}
