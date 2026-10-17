import type { BrushId, Wetness } from '../app/storage';

export type BrushMode = 'paint' | 'water' | 'lift' | 'splatter';

/** All sizes and strengths are multipliers of the paper toy's base stroke. */
export interface BrushDef {
  id: BrushId;
  name: string;
  mode: BrushMode;
  radius: number;
  push: number;
  pigment: number;
  /** Pixels between stamps along a stroke (smaller = smoother line). */
  spacing: number;
  maxSteps: number;
}

export const BRUSHES: BrushDef[] = [
  { id: 'soft', name: 'Soft round', mode: 'paint', radius: 1, push: 0.35, pigment: 1, spacing: 18, maxSteps: 8 },
  { id: 'ink', name: 'Ink pen', mode: 'paint', radius: 0.2, push: 0.1, pigment: 2.6, spacing: 3, maxSteps: 40 },
  { id: 'wash', name: 'Big wash', mode: 'paint', radius: 2.8, push: 0.3, pigment: 0.4, spacing: 28, maxSteps: 6 },
  { id: 'splatter', name: 'Splatter', mode: 'splatter', radius: 0.3, push: 0, pigment: 2, spacing: 14, maxSteps: 8 },
  { id: 'water', name: 'Water', mode: 'water', radius: 1.5, push: 1.7, pigment: 0, spacing: 18, maxSteps: 8 },
  { id: 'lift', name: 'Lift', mode: 'lift', radius: 1.1, push: 0.25, pigment: 0, spacing: 8, maxSteps: 16 },
];

/** Small / medium / large. */
export const SIZES = [0.6, 1, 1.7];

export interface WetnessDef {
  id: Wetness;
  name: string;
  level: number;
  velocityDissipation: number;
  curl: number;
  push: number;
}

/** How wet the paper is: dry paint stays where it lands, wet paint blooms and flows. */
export const WETNESS: WetnessDef[] = [
  { id: 'dry', name: 'Dry', level: 1, velocityDissipation: 3, curl: 1, push: 0.4 },
  { id: 'damp', name: 'Damp', level: 2, velocityDissipation: 1.4, curl: 3, push: 0.8 },
  { id: 'wet', name: 'Wet', level: 3, velocityDissipation: 0.35, curl: 10, push: 1.6 },
];

export interface PaintColor {
  id: string;
  name: string;
  hex: string;
}

/** Six pastels plus deeper paints for drawing. */
export const COLORS: PaintColor[] = [
  { id: 'rose', name: 'Rose', hex: '#e88c9e' },
  { id: 'apricot', name: 'Apricot', hex: '#f5ab84' },
  { id: 'butter', name: 'Butter', hex: '#f7d775' },
  { id: 'sage', name: 'Sage', hex: '#97c49a' },
  { id: 'sky', name: 'Sky', hex: '#8cbae6' },
  { id: 'lavender', name: 'Lavender', hex: '#b49de0' },
  { id: 'sepia', name: 'Sepia', hex: '#8a5a3b' },
  { id: 'crimson', name: 'Crimson', hex: '#c23b4e' },
  { id: 'ochre', name: 'Ochre', hex: '#d08c2a' },
  { id: 'leaf', name: 'Leaf', hex: '#4f9d3a' },
  { id: 'teal', name: 'Teal', hex: '#2a9d8f' },
  { id: 'ultramarine', name: 'Ultramarine', hex: '#3f5bc4' },
  { id: 'plum', name: 'Plum', hex: '#7b3f7a' },
  { id: 'charcoal', name: 'Charcoal', hex: '#34323a' },
];

export const brushById = (id: BrushId): BrushDef => BRUSHES.find((b) => b.id === id) ?? BRUSHES[0];
export const wetnessById = (id: Wetness): WetnessDef => WETNESS.find((w) => w.id === id) ?? WETNESS[1];
export const colorById = (id: string): PaintColor => COLORS.find((c) => c.id === id) ?? COLORS[0];
