export interface ProjectionConfig {
  bbox: [number, number, number, number]; // south, west, north, east
  width: number;
  height: number;
  padding: number;
}

export function createProjection(config: ProjectionConfig) {
  const { bbox, width, height, padding } = config;
  const [south, west, north, east] = bbox;

  const latCenter = (south + north) / 2;
  const latCorrection = Math.cos(latCenter * Math.PI / 180);

  const geoWidth = (east - west) * latCorrection;
  const geoHeight = north - south;

  const availWidth = width - padding * 2;
  const availHeight = height - padding * 2;

  const scale = Math.min(availWidth / geoWidth, availHeight / geoHeight);

  const offsetX = padding + (availWidth - geoWidth * scale) / 2;
  const offsetY = padding + (availHeight - geoHeight * scale) / 2;

  return (lat: number, lon: number): [number, number] => {
    const x = offsetX + (lon - west) * latCorrection * scale;
    const y = offsetY + (north - lat) * scale;
    return [x, y];
  };
}

export function getStrokeWidth(type: string, baseWidth: number = 1): number {
  const widths: Record<string, number> = {
    motorway: 2.5,
    trunk: 2,
    primary: 1.6,
    secondary: 1.3,
    tertiary: 1,
    residential: 0.5,
    unclassified: 0.4,
    living_street: 0.3,
    motorway_link: 1.5,
    trunk_link: 1.2,
    primary_link: 1,
    secondary_link: 0.8,
    tertiary_link: 0.7,
  };
  return (widths[type] || 0.4) * baseWidth;
}
