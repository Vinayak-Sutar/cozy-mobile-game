import type { RGB } from '../../engine/fluid';
import type { SoundTheme } from '../../feel/audio';
import type { PlaceId } from './landmarks';

/**
 * The places you can sail in Paper Boats. Everything is in map units, where
 * 1 unit is the screen's short side, with y pointing down. Maps are bigger
 * than the screen; the camera follows the boat.
 */
export type MapId = 'pond' | 'river' | 'bay' | 'frozen' | 'lagoon';

/** What makes a map play differently. */
export type Twist = 'calm' | 'river' | 'wind' | 'ice' | 'whirlpool';
export type Ground = 'meadow' | 'farm' | 'beach' | 'snow' | 'night' | 'garden';
export type Floater = 'leaves' | 'bubbles' | 'petals' | 'none';
export type IslandDecor = 'tree' | 'rock' | 'pine' | 'glow';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'path'; points: [number, number][]; width: number };

export interface DockDef {
  /** Where the pier leaves the shore. */
  x: number;
  y: number;
  /** Unit vector from the shore out over the water. */
  nx: number;
  ny: number;
  /** null: the start pier, where passengers get on. */
  place: PlaceId | null;
}

export interface Island {
  x: number;
  y: number;
  r: number;
  decor: IslandDecor;
}

export interface WaterLook {
  deep: RGB;
  shallow: RGB;
  foam: RGB;
  /** How bright the dancing light on the bottom is. */
  caustic: number;
  /** Night water: dark, and foam glows instead of whitening. */
  night: boolean;
  /** Rolling wave bands (the bay). */
  wave: number;
}

export interface Whirlpool {
  x: number;
  y: number;
  r: number;
  /** 1 = clockwise on screen, -1 = anticlockwise. */
  spin: number;
}

/** The shape of a body of water and its shore: enough to paint it and keep things afloat. */
export interface WaterScene {
  id: string;
  size: [number, number];
  water: Shape[];
  islands: Island[];
  docks: DockDef[];
  ground: Ground;
}

export interface MapDef extends WaterScene {
  id: MapId;
  name: string;
  /** One line about what's special here, shown when the map opens and in the map list. */
  tagline: string;
  twist: Twist;
  look: WaterLook;
  floater: Floater;
  sound: SoundTheme;
  /** River current at the middle of the stream, in units per second. */
  flow?: number;
  whirlpools?: Whirlpool[];
  floes?: number;
}

/** A pier on a river bank: `t` along segment `seg`, on the left (1) or right (-1) bank. */
function bankDock(points: [number, number][], width: number, seg: number, t: number, side: number, place: PlaceId | null): DockDef {
  const [ax, ay] = points[seg];
  const [bx, by] = points[seg + 1];
  const len = Math.hypot(bx - ax, by - ay);
  const tx = (bx - ax) / len;
  const ty = (by - ay) / len;
  const nx = -ty * side;
  const ny = tx * side;
  const px = ax + (bx - ax) * t;
  const py = ay + (by - ay) * t;
  return { x: px + nx * (width / 2), y: py + ny * (width / 2), nx: -nx, ny: -ny, place };
}

const RIVER: [number, number][] = [
  [0.85, -0.4],
  [0.6, 0.6],
  [1.15, 1.45],
  [0.55, 2.3],
  [1.15, 3.15],
  [0.62, 4.0],
  [0.85, 5.4],
];
const RIVER_WIDTH = 0.58;

export const MAPS: MapDef[] = [
  {
    id: 'pond',
    name: 'Sunny Pond',
    tagline: 'A calm pond. Swipe the water to sail!',
    size: [1.8, 3.2],
    water: [
      { kind: 'rect', x: 0.26, y: 0.4, w: 1.3, h: 2.45, r: 0.42 },
      { kind: 'circle', x: 1.42, y: 0.86, r: 0.26 },
      { kind: 'circle', x: 0.38, y: 2.5, r: 0.27 },
    ],
    islands: [{ x: 0.92, y: 1.7, r: 0.15, decor: 'tree' }],
    docks: [
      { x: 0.95, y: 2.85, nx: 0, ny: -1, place: null },
      { x: 0.26, y: 1.2, nx: 1, ny: 0, place: 'house' },
      { x: 0.7, y: 0.4, nx: 0, ny: 1, place: 'tree' },
      { x: 1.56, y: 2.05, nx: -1, ny: 0, place: 'tent' },
    ],
    twist: 'calm',
    look: { deep: [0.25, 0.6, 0.66], shallow: [0.55, 0.82, 0.76], foam: [0.94, 0.98, 1], caustic: 0.14, night: false, wave: 0 },
    ground: 'meadow',
    floater: 'leaves',
    sound: {
      scale: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
      voice: 'marimba',
      bed: 'brook',
      swish: { type: 'lowpass', low: 250, high: 1100, q: 0.7, gain: 0.05 },
    },
  },
  {
    id: 'river',
    name: 'Winding River',
    tagline: "The river keeps flowing. Don't drift past the pier!",
    size: [1.7, 5.0],
    water: [{ kind: 'path', points: RIVER, width: RIVER_WIDTH }],
    islands: [],
    docks: [
      bankDock(RIVER, RIVER_WIDTH, 0, 0.75, 1, null),
      bankDock(RIVER, RIVER_WIDTH, 1, 0.6, -1, 'mill'),
      bankDock(RIVER, RIVER_WIDTH, 2, 0.55, 1, 'picnic'),
      bankDock(RIVER, RIVER_WIDTH, 4, 0.5, -1, 'barn'),
    ],
    twist: 'river',
    flow: 0.15,
    look: { deep: [0.2, 0.52, 0.52], shallow: [0.5, 0.78, 0.66], foam: [0.94, 0.98, 1], caustic: 0.12, night: false, wave: 0 },
    ground: 'farm',
    floater: 'leaves',
    sound: {
      scale: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83],
      voice: 'kalimba',
      bed: 'brook',
      swish: { type: 'lowpass', low: 300, high: 1300, q: 0.7, gain: 0.05 },
    },
  },
  {
    id: 'bay',
    name: 'Windy Bay',
    tagline: 'Gusts of wind push the sails. Watch the breeze!',
    size: [2.4, 3.1],
    water: [
      { kind: 'rect', x: 0.28, y: -0.6, w: 1.84, h: 3.15, r: 0.5 },
      { kind: 'circle', x: 0.52, y: 2.25, r: 0.32 },
    ],
    islands: [
      { x: 1.6, y: 0.95, r: 0.17, decor: 'rock' },
      { x: 0.8, y: 0.5, r: 0.08, decor: 'rock' },
    ],
    docks: [
      { x: 1.2, y: 2.55, nx: 0, ny: -1, place: null },
      { x: 0.28, y: 1.35, nx: 1, ny: 0, place: 'hut' },
      { x: 1.43, y: 0.95, nx: -1, ny: 0, place: 'lighthouse' },
      { x: 2.12, y: 2.0, nx: -1, ny: 0, place: 'icecream' },
    ],
    twist: 'wind',
    look: { deep: [0.13, 0.42, 0.68], shallow: [0.45, 0.8, 0.82], foam: [0.96, 0.99, 1], caustic: 0.17, night: false, wave: 1 },
    ground: 'beach',
    floater: 'bubbles',
    sound: {
      scale: [60, 62, 65, 67, 69, 72, 74, 77, 79, 81],
      voice: 'marimba',
      bed: 'pad',
      swish: { type: 'bandpass', low: 300, high: 1400, q: 0.6, gain: 0.05 },
    },
  },
  {
    id: 'frozen',
    name: 'Frozen Lake',
    tagline: 'Ice floes drift around. Push them out of the way!',
    size: [2.0, 3.3],
    water: [
      { kind: 'rect', x: 0.25, y: 0.42, w: 1.5, h: 2.48, r: 0.5 },
      { kind: 'circle', x: 1.45, y: 2.62, r: 0.34 },
      { kind: 'circle', x: 0.5, y: 0.72, r: 0.3 },
    ],
    islands: [{ x: 0.85, y: 1.85, r: 0.13, decor: 'pine' }],
    docks: [
      { x: 0.8, y: 2.9, nx: 0, ny: -1, place: null },
      { x: 1.3, y: 0.42, nx: 0, ny: 1, place: 'igloo' },
      { x: 0.25, y: 1.5, nx: 1, ny: 0, place: 'snowman' },
      { x: 1.75, y: 1.6, nx: -1, ny: 0, place: 'cabin' },
    ],
    twist: 'ice',
    floes: 8,
    look: { deep: [0.3, 0.46, 0.62], shallow: [0.64, 0.79, 0.88], foam: [0.95, 0.98, 1], caustic: 0.07, night: false, wave: 0 },
    ground: 'snow',
    floater: 'none',
    sound: {
      scale: [64, 66, 68, 71, 73, 76, 78, 80, 83, 85],
      voice: 'bell',
      bed: 'lullaby',
      swish: { type: 'highpass', low: 900, high: 2600, q: 0.7, gain: 0.035 },
    },
  },
  {
    id: 'lagoon',
    name: 'Moonlit Lagoon',
    tagline: 'Whirlpools spin you round. Ride them!',
    size: [2.3, 3.4],
    water: [
      { kind: 'rect', x: 0.45, y: 0.55, w: 1.4, h: 2.4, r: 0.45 },
      { kind: 'circle', x: 0.75, y: 0.85, r: 0.5 },
      { kind: 'circle', x: 1.6, y: 1.4, r: 0.5 },
      { kind: 'circle', x: 0.75, y: 2.15, r: 0.52 },
      { kind: 'circle', x: 1.4, y: 2.8, r: 0.45 },
    ],
    islands: [{ x: 1.15, y: 1.75, r: 0.12, decor: 'glow' }],
    docks: [
      { x: 1.4, y: 3.25, nx: 0, ny: -1, place: null },
      { x: 0.75, y: 0.35, nx: 0, ny: 1, place: 'lamp' },
      { x: 0.23, y: 2.15, nx: 1, ny: 0, place: 'treehouse' },
      { x: 2.1, y: 1.4, nx: -1, ny: 0, place: 'observatory' },
    ],
    twist: 'whirlpool',
    whirlpools: [
      { x: 1.38, y: 1.15, r: 0.3, spin: 1 },
      { x: 0.95, y: 2.45, r: 0.28, spin: -1 },
    ],
    look: { deep: [0.03, 0.06, 0.16], shallow: [0.07, 0.15, 0.27], foam: [0.35, 0.95, 0.9], caustic: 0.05, night: true, wave: 0 },
    ground: 'night',
    floater: 'petals',
    sound: {
      scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79],
      voice: 'bell',
      bed: 'night',
      swish: { type: 'bandpass', low: 350, high: 1500, q: 0.8, gain: 0.04 },
    },
  },
];

/** Passengers you need to carry on a map before the next one opens. */
export const UNLOCK_TRIPS = 3;

export function mapById(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

// ---------- Geometry (all in map units) ----------

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Signed distance to a shape's edge: negative inside. */
export function shapeDistance(s: Shape, x: number, y: number): number {
  if (s.kind === 'circle') return Math.hypot(x - s.x, y - s.y) - s.r;
  if (s.kind === 'rect') {
    const qx = Math.abs(x - (s.x + s.w / 2)) - (s.w / 2 - s.r);
    const qy = Math.abs(y - (s.y + s.h / 2)) - (s.h / 2 - s.r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r;
  }
  let d = Infinity;
  for (let i = 0; i < s.points.length - 1; i++) {
    const [ax, ay] = s.points[i];
    const [bx, by] = s.points[i + 1];
    d = Math.min(d, segmentDistance(x, y, ax, ay, bx, by));
  }
  return d - s.width / 2;
}

/** How far a point is from the shore: negative out on the water, positive on land. */
export function waterDistance(map: WaterScene, x: number, y: number): number {
  let d = Infinity;
  for (const s of map.water) d = Math.min(d, shapeDistance(s, x, y));
  for (const island of map.islands) d = Math.max(d, island.r - Math.hypot(x - island.x, y - island.y));
  return d;
}

/**
 * The river's current at a point (units per second), into `out`. Strongest
 * mid-stream; each bend's direction blends into the next so boats turn smoothly.
 */
export function riverFlow(map: MapDef, x: number, y: number, out: [number, number]): void {
  out[0] = 0;
  out[1] = 0;
  const river = map.water[0];
  if (!map.flow || river.kind !== 'path') return;
  const half = river.width / 2;
  let wx = 0;
  let wy = 0;
  let total = 0;
  let nearest = Infinity;
  for (let i = 0; i < river.points.length - 1; i++) {
    const [ax, ay] = river.points[i];
    const [bx, by] = river.points[i + 1];
    const d = segmentDistance(x, y, ax, ay, bx, by);
    nearest = Math.min(nearest, d);
    const w = Math.exp(-((d / half) ** 2) * 3);
    const len = Math.hypot(bx - ax, by - ay);
    wx += ((bx - ax) / len) * w;
    wy += ((by - ay) / len) * w;
    total += w;
  }
  if (total < 1e-6) return;
  const len = Math.hypot(wx, wy) || 1;
  const speed = map.flow * Math.max(0.3, 1 - (nearest / half) ** 2);
  out[0] = (wx / len) * speed;
  out[1] = (wy / len) * speed;
}

/** Where a pier's landmark stands, and where a passenger stands beside it (map units). */
export function dockSpots(d: DockDef): { landmark: [number, number]; stand: [number, number]; berth: [number, number] } {
  const landmark: [number, number] = [d.x - d.nx * 0.15, d.y - d.ny * 0.15 + 0.06];
  const side = d.nx !== 0 ? d.nx : 1;
  return {
    landmark,
    stand: [landmark[0] + side * 0.11, landmark[1] + 0.005],
    berth: [d.x + d.nx * (PIER + 0.07), d.y + d.ny * (PIER + 0.07)],
  };
}

/** How far piers reach out over the water. */
export const PIER = 0.13;

/** Whether a map is open: the first always is; each next one after UNLOCK_TRIPS on the one before. */
export function isUnlocked(id: MapId, trips: Record<string, number>): boolean {
  const index = MAPS.findIndex((m) => m.id === id);
  if (index <= 0) return true;
  if (new URLSearchParams(location.search).has('lab')) return true;
  return (trips[MAPS[index - 1].id] ?? 0) >= UNLOCK_TRIPS;
}
