/**
 * Poster shapes.
 *
 * The shop frames prints in three proportions, and a city's road network already has a natural one:
 * a city that sprawls east-west wants a landscape sheet, a compact one a square, a long narrow one
 * a portrait. Rather than force every map into one canvas, we measure the window we were given and
 * snap it to the nearest of the three. The same measurement drives the creator, the gift-page
 * mockup and the printed product, so all three agree.
 *
 * Shape is a pure function of the bounding box, which is itself part of `designHash` — so it needs
 * no separate place in the gift URL or the design fingerprint.
 */

export type PosterShape = 'square' | 'horizontal' | 'vertical';

export interface ShapeGeometry {
  /** Canvas aspect ratio, width / height. */
  ratio: number;
  /** SVG user units. The long side is held at 800 so stroke weights read the same at every shape. */
  width: number;
  height: number;
  /**
   * Fourthwall frame size titles for this shape.
   *
   * Rectangular posters are sold through the template's portrait frames; a landscape design is a
   * 3:4 frame hung on its side, which is why both non-square shapes share the same titles.
   */
  sizeTitles: string[];
}

export const POSTER_SHAPES: Record<PosterShape, ShapeGeometry> = {
  square: {
    ratio: 1,
    width: 800,
    height: 800,
    sizeTitles: ['10" x 10"', '14" x 14"', '18" x 18"'],
  },
  horizontal: {
    ratio: 4 / 3,
    width: 800,
    height: 600,
    sizeTitles: ['12" x 16"', '18" x 24"'],
  },
  vertical: {
    ratio: 3 / 4,
    width: 600,
    height: 800,
    sizeTitles: ['12" x 16"', '18" x 24"'],
  },
};

/** The three target aspects, largest first, with the shape each represents. */
const TARGETS: { shape: PosterShape; ratio: number }[] = [
  { shape: 'horizontal', ratio: 4 / 3 },
  { shape: 'square', ratio: 1 },
  { shape: 'vertical', ratio: 3 / 4 },
];

export type BBox = [number, number, number, number]; // south, west, north, east

/**
 * Latitude-corrected aspect of a window, matching `createProjection`'s own correction.
 *
 * Longitude degrees shrink toward the poles, so an uncorrected box would call a square city
 * landscape. Correcting here keeps the shape consistent with what the map actually looks like.
 */
export function bboxAspect(bbox: BBox): number {
  const [south, west, north, east] = bbox;
  const latCenter = (south + north) / 2;
  const latCorrection = Math.cos((latCenter * Math.PI) / 180);
  const geoWidth = (east - west) * latCorrection;
  const geoHeight = north - south;
  if (!(geoWidth > 0) || !(geoHeight > 0)) return 1;
  return geoWidth / geoHeight;
}

/**
 * Snap a window to the closest shape.
 *
 * Compared in log space because aspect is multiplicative: 4:3 and 3:4 are equally far from square,
 * whereas a linear comparison would bias toward the wider shapes.
 */
export function shapeForBbox(bbox: BBox): PosterShape {
  const ratio = bboxAspect(bbox);
  const target = Math.log(ratio);
  let best = TARGETS[0];
  let bestDistance = Infinity;
  for (const candidate of TARGETS) {
    const distance = Math.abs(target - Math.log(candidate.ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.shape;
}

export function shapeGeometry(shape: PosterShape): ShapeGeometry {
  return POSTER_SHAPES[shape];
}

/** Narrow an untrusted value (a query-string field, an API body) to a shape. */
export function isPosterShape(value: unknown): value is PosterShape {
  return value === 'square' || value === 'horizontal' || value === 'vertical';
}
