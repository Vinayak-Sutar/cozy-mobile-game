import { type Shape, shapeDistance, waterDistance, type WaterScene } from '../boats/maps';
import { drawRock, paintScenery, seeded } from '../boats/scenery';

/**
 * Penguin Island: a snowy island in an icy sea, in map units (1 unit = the
 * screen's short side, y down). The land is a cluster of overlapping circles;
 * on it are ice sheets (slippery), deep powder (slow), a slope (speeds you
 * downhill), fishing holes, rocks, pines and igloos.
 */
export const ISLAND_W = 3;
export const ISLAND_H = 4.2;

const LAND: [number, number, number][] = [
  [1.5, 0.55, 0.32],
  [1.5, 0.95, 0.5],
  [0.95, 1.3, 0.48],
  [2.05, 1.3, 0.5],
  [1.5, 1.75, 0.6],
  [0.55, 1.75, 0.32],
  [2.45, 1.9, 0.38],
  [0.85, 2.25, 0.55],
  [2.1, 2.35, 0.58],
  [1.45, 2.65, 0.6],
  [0.95, 3.1, 0.5],
  [2.0, 3.15, 0.5],
  [1.5, 3.5, 0.5],
];

export const SCENE: WaterScene = {
  id: 'penguin-island',
  size: [ISLAND_W, ISLAND_H],
  water: [{ kind: 'rect', x: -2, y: -2, w: ISLAND_W + 4, h: ISLAND_H + 4, r: 0 }],
  islands: LAND.map(([x, y, r]) => ({ x, y, r, decor: 'none' as const })),
  docks: [],
  ground: 'snow',
};

export type Terrain = 'snow' | 'ice' | 'powder';

interface Zone {
  kind: Terrain | 'slope';
  shape: Shape;
  /** Downhill direction, for slopes. */
  dir?: [number, number];
}

/** The big ice field with a snowy islet (a chick waits there), the frozen pond, deep powder, and a slope. */
export const ZONES: Zone[] = [
  { kind: 'ice', shape: { kind: 'rect', x: 1.05, y: 1.02, w: 0.92, h: 0.62, r: 0.14 } },
  { kind: 'ice', shape: { kind: 'circle', x: 0.85, y: 2.3, r: 0.3 } },
  { kind: 'powder', shape: { kind: 'circle', x: 2.15, y: 2.55, r: 0.3 } },
  { kind: 'slope', shape: { kind: 'rect', x: 1.2, y: 1.98, w: 0.6, h: 0.36, r: 0.1 }, dir: [0, 1] },
];

/** Snowy spots inside ice fields where you can stop. */
export const ISLETS: [number, number, number][] = [[1.8, 1.2, 0.075]];

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  kind: 'rock' | 'pine' | 'igloo' | 'lighthouse' | 'snowman';
  /** Pines vary a little. */
  size?: number;
}

export const HOME = { x: 1.5, y: 3.66 };
export const START: [number, number] = [1.5, 3.36];

export const VILLAGERS = {
  grandpa: { x: 1.08, y: 3.44, home: [0.8, 3.32] as [number, number] },
  skipper: { x: 2.42, y: 2.02, home: [2.64, 1.84] as [number, number] },
  auntie: { x: 0.66, y: 1.9, home: [0.44, 1.7] as [number, number] },
};

export const FISHING_HOLES: [number, number][] = [
  [0.78, 2.24],
  [0.96, 2.42],
  [2.12, 1.05],
  [1.28, 2.98],
  [2.33, 3.04],
];

/** Where lost chicks can be hiding. The first six are where they start. */
export const CHICK_SPOTS: [number, number][] = [
  [1.8, 1.2],
  [0.42, 2.22],
  [2.2, 2.6],
  [1.5, 0.4],
  [2.7, 2.12],
  [0.6, 2.86],
  [2.3, 3.36],
  [1.15, 0.9],
  [2.35, 1.0],
  [0.75, 1.15],
  [1.9, 2.9],
  [1.1, 2.6],
];

export const PEBBLES: [number, number][] = [
  [1.0, 1.72],
  [2.74, 1.74],
  [0.32, 1.86],
  [1.62, 0.3],
  [2.45, 3.2],
  [0.72, 3.5],
  [1.55, 1.34],
  [1.32, 2.28],
];

/** Auntie Flo's lost mitten, out on the frozen pond. */
export const MITTEN: [number, number] = [0.98, 2.16];

/** Rocks dotted over the big ice field: things to slide into and stop against. */
const ICE_ROCKS: [number, number, number][] = [
  [1.22, 1.16, 0.045],
  [1.62, 1.1, 0.05],
  [1.92, 1.44, 0.045],
  [1.42, 1.5, 0.05],
  [1.15, 1.52, 0.04],
  [1.72, 1.36, 0.04],
];

export const OBSTACLES: Obstacle[] = (() => {
  const list: Obstacle[] = [];
  for (const [x, y, r] of ICE_ROCKS) list.push({ x, y, r, kind: 'rock' });
  list.push({ x: HOME.x, y: HOME.y - 0.06, r: 0.13, kind: 'igloo' });
  for (const v of Object.values(VILLAGERS)) {
    const lighthouse = v === VILLAGERS.skipper;
    list.push({ x: v.home[0], y: v.home[1] - 0.05, r: lighthouse ? 0.06 : 0.11, kind: lighthouse ? 'lighthouse' : 'igloo' });
  }
  list.push({ x: 1.86, y: 3.5, r: 0.05, kind: 'snowman' });
  // Pines and rocks, kept away from paths, ice, chicks and places of interest.
  const random = seeded(4242);
  const keep: [number, number][] = [
    ...CHICK_SPOTS,
    ...PEBBLES,
    ...FISHING_HOLES,
    MITTEN,
    START,
    [HOME.x, HOME.y],
    ...Object.values(VILLAGERS).map((v) => [v.x, v.y] as [number, number]),
  ];
  let pines = 0;
  for (let i = 0; i < 400 && pines < 30; i++) {
    const x = random() * ISLAND_W;
    const y = random() * ISLAND_H;
    if (waterDistance(SCENE, x, y) < 0.1) continue;
    if (ZONES.some((z) => shapeDistance(z.shape, x, y) < 0.12)) continue;
    if (keep.some(([kx, ky]) => Math.hypot(kx - x, ky - y) < 0.2)) continue;
    if (list.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 0.12)) continue;
    const pine = random() < 0.75;
    list.push({ x, y, r: pine ? 0.035 : 0.04, kind: pine ? 'pine' : 'rock', size: 0.11 + random() * 0.05 });
    if (pine) pines++;
  }
  return list;
})();

/** What's underfoot at a point (map units). */
export function terrainAt(x: number, y: number): Terrain {
  if (ISLETS.some(([ix, iy, r]) => Math.hypot(x - ix, y - iy) < r)) return 'snow';
  for (const zone of ZONES) {
    if (zone.kind !== 'slope' && shapeDistance(zone.shape, x, y) < 0) return zone.kind;
  }
  return 'snow';
}

/** Downhill push at a point (map units per second squared), into `out`. */
export function slopeAt(x: number, y: number, out: [number, number]): void {
  out[0] = 0;
  out[1] = 0;
  for (const zone of ZONES) {
    if (zone.kind === 'slope' && zone.dir && shapeDistance(zone.shape, x, y) < 0) {
      out[0] += zone.dir[0];
      out[1] += zone.dir[1];
    }
  }
}

/** A shape's bounding box: [left, top, right, bottom] in map units. */
function bounds(shape: Shape): [number, number, number, number] {
  if (shape.kind === 'circle') return [shape.x - shape.r, shape.y - shape.r, shape.x + shape.r, shape.y + shape.r];
  if (shape.kind === 'rect') return [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
  return [0, 0, 0, 0];
}

function zonePath(shape: Shape, u: number, grow = 0): Path2D {
  const p = new Path2D();
  if (shape.kind === 'circle') p.arc(shape.x * u, shape.y * u, (shape.r + grow) * u, 0, Math.PI * 2);
  else if (shape.kind === 'rect') p.roundRect((shape.x - grow) * u, (shape.y - grow) * u, (shape.w + grow * 2) * u, (shape.h + grow * 2) * u, (shape.r + grow) * u);
  return p;
}

/** The island's flat ground, painted once: snow, shore, ice, powder, the slope, fishing holes and rocks. */
export function paintIsland(unit: number, scale: number): HTMLCanvasElement {
  const canvas = paintScenery(SCENE, unit, scale, { props: false });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const u = unit;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const random = seeded(77);

  for (const zone of ZONES) {
    const path = zonePath(zone.shape, u);
    const [x0, y0, x1, y1] = bounds(zone.shape);
    const inside = (): [number, number] => [(x0 + random() * (x1 - x0)) * u, (y0 + random() * (y1 - y0)) * u];
    if (zone.kind === 'ice') {
      ctx.fillStyle = '#d6ecf7';
      ctx.fill(zonePath(zone.shape, u, 0.012));
      const g = ctx.createLinearGradient(0, y0 * u, 0, y1 * u);
      g.addColorStop(0, '#b9e1f4');
      g.addColorStop(1, '#98cde8');
      ctx.fillStyle = g;
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      // Shine streaks and a few cracks.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const [x, y] = inside();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + u * 0.08, y - u * 0.05);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(90, 140, 170, 0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        let [x, y] = inside();
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (random() - 0.5) * u * 0.06;
          y += (random() - 0.5) * u * 0.06;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (zone.kind === 'powder') {
      ctx.fillStyle = '#ffffff';
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      for (let i = 0; i < 40; i++) {
        const [x, y] = inside();
        ctx.fillStyle = 'rgba(170, 200, 225, 0.35)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 3, u * 0.03, u * 0.014, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(x, y, u * 0.03, u * 0.015, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (zone.kind === 'slope' && zone.shape.kind === 'rect') {
      const s = zone.shape;
      const g = ctx.createLinearGradient(0, s.y * u, 0, (s.y + s.h) * u);
      g.addColorStop(0, 'rgba(150, 185, 215, 0.35)');
      g.addColorStop(1, 'rgba(150, 185, 215, 0)');
      ctx.fillStyle = g;
      ctx.fill(path);
      // Chevrons pointing downhill.
      ctx.strokeStyle = 'rgba(120, 160, 195, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const cx = (s.x + (col + 0.5) * (s.w / 3)) * u;
          const cy = (s.y + 0.08 + row * 0.1) * u;
          ctx.beginPath();
          ctx.moveTo(cx - u * 0.035, cy - u * 0.015);
          ctx.lineTo(cx, cy + u * 0.015);
          ctx.lineTo(cx + u * 0.035, cy - u * 0.015);
          ctx.stroke();
        }
      }
    }
  }
  for (const [x, y, r] of ISLETS) {
    ctx.fillStyle = '#f3f8fc';
    ctx.beginPath();
    ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, y] of FISHING_HOLES) {
    ctx.fillStyle = '#e4f1f8';
    ctx.beginPath();
    ctx.ellipse(x * u, y * u, u * 0.05, u * 0.032, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d5d7c';
    ctx.beginPath();
    ctx.ellipse(x * u, y * u + 1, u * 0.038, u * 0.023, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const o of OBSTACLES) {
    if (o.kind === 'rock') drawRock(ctx, o.x * u, o.y * u, o.r * u, true);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}
