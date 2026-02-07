import { Road } from '@/types/artwork';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export async function fetchRoads(bbox: [number, number, number, number]): Promise<Road[]> {
  const [south, west, north, east] = bbox;

  const query = `
    [out:json][timeout:30];
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

  return data.elements
    .filter((el: any) => el.type === 'way' && el.geometry)
    .map((el: any) => ({
      id: el.id,
      type: el.tags?.highway || 'unknown',
      geometry: el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon })),
    }));
}
