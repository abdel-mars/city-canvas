import { useEffect, useMemo, useState } from 'react';
import { Road } from '@/types/artwork';
import { createProjection, getStrokeWidth } from '@/lib/projection';
import { featuredCities } from '@/lib/presets';
import { fetchRoads } from '@/lib/overpass';

const CANVAS = 800;
const PAD = 40;

const BackgroundArt = () => {
  const [roads, setRoads] = useState<Road[]>([]);

  const city = useMemo(
    () => featuredCities[Math.floor(Math.random() * featuredCities.length)],
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchRoads(city.boundingBox)
      .then((r) => {
        if (!cancelled) setRoads(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city]);

  const project = useMemo(
    () => createProjection({ bbox: city.boundingBox, width: CANVAS, height: CANVAS, padding: PAD }),
    [city],
  );

  const paths = useMemo(
    () =>
      roads.map((r) => {
        const d = r.geometry
          .map((p, i) => {
            const [x, y] = project(p.lat, p.lon);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        return { id: r.id, d, type: r.type };
      }),
    [roads, project],
  );

  if (paths.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.04]">
      <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        {paths.map(({ id, d, type }) => (
          <path
            key={id}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={getStrokeWidth(type)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
};

export default BackgroundArt;
