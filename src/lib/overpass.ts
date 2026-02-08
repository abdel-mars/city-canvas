import { Road } from '@/types/artwork';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Douglas-Peucker line simplification for visual quality */
function perpendicularDist(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.lon - a.lon) ** 2 + (p.lat - a.lat) ** 2);
  const t = Math.max(0, Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq));
  const projLon = a.lon + t * dx;
  const projLat = a.lat + t * dy;
  return Math.sqrt((p.lon - projLon) ** 2 + (p.lat - projLat) ** 2);
}

function simplifyLine(
  points: { lat: number; lon: number }[],
  epsilon: number,
): { lat: number; lon: number }[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDist(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyLine(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyLine(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

export async function fetchRoads(bbox: [number, number, number, number]): Promise<Road[]> {
  const [south, west, north, east] = bbox;

  const query = `
    [out:json][timeout:25][maxsize:8388608];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${south},${west},${north},${east});
    );
    out geom;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch road data');
  }

  const data = await response.json();

  // Simplification tolerance — ~5m at equator
  const epsilon = 0.00005;

  return data.elements
    .filter((el: any) => el.type === 'way' && el.geometry)
    .map((el: any) => {
      const rawPoints = el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon }));
      return {
        id: el.id,
        type: el.tags?.highway || 'unknown',
        geometry: simplifyLine(rawPoints, epsilon),
      };
    })
    .filter((r: Road) => r.geometry.length >= 2);
}
