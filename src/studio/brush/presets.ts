import type { Grain, TipKind } from './tips';

export type AngleMode = 'fixed' | 'stroke' | 'random' | 'tilt';

/**
 * Everything that makes a brush. Sizes are in canvas pixels for a canvas
 * about 2000 px across (scaled to the painting), spacing and scatter are
 * fractions of the brush size, and most effects run 0..1.
 */
export interface Brush {
  id: string;
  name: string;
  set: string;
  tip: TipKind;
  size: number;
  /** Size at no pressure and at the ends of a taper, as a fraction of full size. */
  minSize: number;
  opacity: number;
  /** How much each dab adds (low flow builds up gradually, like an airbrush). */
  flow: number;
  hardness: number;
  spacing: number;
  scatter: number;
  count: number;
  angle: number;
  angleMode: AngleMode;
  angleJitter: number;
  roundness: number;
  taperStart: number;
  taperEnd: number;
  pressureSize: number;
  pressureOpacity: number;
  /** Positive: faster strokes get thinner (like a brush pen). */
  speedSize: number;
  grain: Grain;
  grainDepth: number;
  grainScale: number;
  jitterSize: number;
  jitterOpacity: number;
  jitterHue: number;
  jitterSat: number;
  jitterLight: number;
  /** Rainbow: hue turns per 1000 px of stroke. */
  hueShift: number;
  /** StreamLine: smooths wobbly lines (0 off .. 1 very smooth). */
  streamline: number;
  /** How the finished stroke combines with the layer. */
  blend: GlobalCompositeOperation;
  /** A soft halo around each dab (neon). */
  glow: number;
}

const BASE: Brush = {
  id: '',
  name: '',
  set: '',
  tip: 'round',
  size: 20,
  minSize: 0.2,
  opacity: 1,
  flow: 1,
  hardness: 0.8,
  spacing: 0.1,
  scatter: 0,
  count: 1,
  angle: 0,
  angleMode: 'fixed',
  angleJitter: 0,
  roundness: 1,
  taperStart: 0,
  taperEnd: 0,
  pressureSize: 0.5,
  pressureOpacity: 0,
  speedSize: 0,
  grain: 'none',
  grainDepth: 0,
  grainScale: 1,
  jitterSize: 0,
  jitterOpacity: 0,
  jitterHue: 0,
  jitterSat: 0,
  jitterLight: 0,
  hueShift: 0,
  streamline: 0.2,
  blend: 'source-over',
  glow: 0,
};

const brush = (b: Partial<Brush> & Pick<Brush, 'id' | 'name' | 'set'>): Brush => ({ ...BASE, ...b });

export const SETS = ['Sketch', 'Ink', 'Paint', 'Airbrush', 'Marker', 'Light & magic'];

export const BRUSHES: Brush[] = [
  brush({ id: 'pencil-hb', name: 'HB pencil', set: 'Sketch', tip: 'pencil', size: 5, hardness: 1, flow: 0.55, opacity: 0.9, spacing: 0.08, pressureSize: 0.25, pressureOpacity: 0.65, grain: 'pencil', grainDepth: 0.7, streamline: 0.15 }),
  brush({ id: 'pencil-6b', name: '6B pencil', set: 'Sketch', tip: 'pencil', size: 13, flow: 0.7, spacing: 0.08, pressureSize: 0.45, pressureOpacity: 0.5, grain: 'paper', grainDepth: 0.65, grainScale: 0.8, streamline: 0.1 }),
  brush({ id: 'charcoal', name: 'Charcoal', set: 'Sketch', tip: 'charcoal', size: 24, flow: 0.6, spacing: 0.12, angleMode: 'random', pressureSize: 0.4, pressureOpacity: 0.4, grain: 'rough', grainDepth: 0.75, streamline: 0.05 }),
  brush({ id: 'tech-pen', name: 'Technical pen', set: 'Ink', tip: 'round', size: 4, hardness: 1, spacing: 0.05, pressureSize: 0.15, minSize: 0.6, streamline: 0.5 }),
  brush({ id: 'brush-pen', name: 'Brush pen', set: 'Ink', tip: 'round', size: 16, hardness: 0.95, spacing: 0.04, pressureSize: 0.9, minSize: 0.08, speedSize: 0.55, taperStart: 0.6, taperEnd: 0.7, streamline: 0.45 }),
  brush({ id: 'calligraphy', name: 'Calligraphy nib', set: 'Ink', tip: 'flat', size: 22, hardness: 1, spacing: 0.04, angle: 40, angleMode: 'fixed', roundness: 0.22, pressureSize: 0.4, minSize: 0.45, streamline: 0.4 }),
  brush({ id: 'round', name: 'Round brush', set: 'Paint', tip: 'round', size: 30, hardness: 0.65, flow: 0.85, spacing: 0.08, pressureSize: 0.45, pressureOpacity: 0.2, streamline: 0.15 }),
  brush({ id: 'flat', name: 'Flat brush', set: 'Paint', tip: 'bristle', size: 44, flow: 0.8, spacing: 0.06, angleMode: 'stroke', angle: 90, pressureSize: 0.3, pressureOpacity: 0.3, grain: 'canvas', grainDepth: 0.35, streamline: 0.1 }),
  brush({ id: 'gouache', name: 'Gouache', set: 'Paint', tip: 'chalk', size: 36, flow: 0.9, spacing: 0.07, angleMode: 'stroke', roundness: 0.8, pressureSize: 0.35, grain: 'paper', grainDepth: 0.3, streamline: 0.1 }),
  brush({ id: 'soft-air', name: 'Soft airbrush', set: 'Airbrush', tip: 'round', size: 140, hardness: 0, flow: 0.07, spacing: 0.06, pressureSize: 0.1, pressureOpacity: 0.7, streamline: 0.1 }),
  brush({ id: 'spray', name: 'Spray can', set: 'Airbrush', tip: 'spray', size: 70, flow: 0.45, spacing: 0.18, angleMode: 'random', pressureSize: 0.2, pressureOpacity: 0.5, streamline: 0 }),
  brush({ id: 'marker', name: 'Alcohol marker', set: 'Marker', tip: 'round', size: 26, hardness: 0.85, spacing: 0.05, opacity: 0.55, pressureSize: 0.15, minSize: 0.7, blend: 'multiply', streamline: 0.2 }),
  brush({ id: 'highlighter', name: 'Highlighter', set: 'Marker', tip: 'flat', size: 30, hardness: 1, spacing: 0.05, opacity: 0.45, angle: 90, roundness: 0.35, pressureSize: 0, blend: 'multiply', streamline: 0.35 }),
  brush({ id: 'neon', name: 'Neon glow', set: 'Light & magic', tip: 'round', size: 10, hardness: 0.6, spacing: 0.06, pressureSize: 0.3, glow: 1, blend: 'lighter', streamline: 0.35 }),
  brush({ id: 'stars', name: 'Sparkle stars', set: 'Light & magic', tip: 'star', size: 26, spacing: 1.3, scatter: 1.4, angleMode: 'random', jitterSize: 0.6, jitterHue: 0.08, jitterLight: 0.2, pressureSize: 0.3, streamline: 0 }),
  brush({ id: 'rainbow', name: 'Rainbow ribbon', set: 'Light & magic', tip: 'round', size: 26, hardness: 0.75, spacing: 0.05, hueShift: 1.2, pressureSize: 0.4, streamline: 0.4 }),
  brush({ id: 'leaves', name: 'Leaves', set: 'Light & magic', tip: 'leaf', size: 30, spacing: 0.9, scatter: 0.6, angleMode: 'stroke', angleJitter: 50, jitterSize: 0.4, jitterHue: 0.06, jitterLight: 0.25, pressureSize: 0.3, streamline: 0 }),
];

export const brushById = (id: string): Brush => BRUSHES.find((b) => b.id === id) ?? BRUSHES[0];
