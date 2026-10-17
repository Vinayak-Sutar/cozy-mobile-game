import type { RGB } from '../engine/fluid';
import { hex } from '../util/color';
import { CREAM_PAPER, pigment } from './paper';

/** The three paints you mix with, like a child's first paint set. */
export const PRIMARIES = [
  { id: 'red', name: 'Red', hex: '#e2434f' },
  { id: 'yellow', name: 'Yellow', hex: '#f6cf3c' },
  { id: 'blue', name: 'Blue', hex: '#3d7bd4' },
] as const;

export type PrimaryId = (typeof PRIMARIES)[number]['id'];

/** How much of each colour channel one "coat" of each primary absorbs. */
export const PRIMARY_ABSORPTION: RGB[] = PRIMARIES.map((p) => pigment(p.hex));

/** Same cap as the Little Painter paper renderer, so predicted colours match what you see. */
export const PAINTER_DEPTH = 2;

const PAPER = hex(CREAM_PAPER);

/** A colour Pip asks for: a recipe of red, yellow and blue coats. */
export interface Wish {
  id: string;
  name: string;
  recipe: [number, number, number];
}

/** Easy first, then the classic mixes, then lighter tints and trickier blends. */
export const WISHES: Wish[] = [
  { id: 'blue', name: 'Blue', recipe: [0, 0, 1] },
  { id: 'green', name: 'Green', recipe: [0, 1, 1] },
  { id: 'orange', name: 'Orange', recipe: [1, 1, 0] },
  { id: 'purple', name: 'Purple', recipe: [1, 0, 1] },
  { id: 'pink', name: 'Pink', recipe: [0.45, 0, 0] },
  { id: 'lime', name: 'Lime', recipe: [0, 1.3, 0.4] },
  { id: 'sky', name: 'Sky', recipe: [0, 0.1, 0.5] },
  { id: 'peach', name: 'Peach', recipe: [0.35, 0.6, 0] },
  { id: 'teal', name: 'Teal', recipe: [0, 0.5, 1.3] },
  { id: 'lilac', name: 'Lilac', recipe: [0.35, 0, 0.45] },
  { id: 'gold', name: 'Gold', recipe: [0.35, 1.3, 0] },
  { id: 'brown', name: 'Brown', recipe: [0.8, 0.9, 0.6] },
];

/** The first wishes, in order; after these Pip asks for anything. */
export const FIRST_WISHES = ['blue', 'green', 'orange', 'purple'];

export function recipeAbsorption(recipe: readonly number[]): RGB {
  const out: RGB = [0, 0, 0];
  recipe.forEach((amount, i) => {
    for (let c = 0; c < 3; c++) out[c] += amount * PRIMARY_ABSORPTION[i][c];
  });
  return out;
}

/** The colour paper shows with this much pigment on it (the watercolour shader's maths, grain averaged out). */
export function shade(absorption: RGB): RGB {
  const m = Math.max(absorption[0], absorption[1], absorption[2]);
  const k = m > 1e-4 ? (PAINTER_DEPTH * (1 - Math.exp(-m / PAINTER_DEPTH))) / m : 1;
  return PAPER.map((p, i) => p * 0.98 * Math.exp(-absorption[i] * k)) as RGB;
}

/** Inverse of the 3x3 matrix whose columns are the primaries' absorption. */
const UNMIX = (() => {
  const [r, y, b] = PRIMARY_ABSORPTION;
  // m[row][col]: row = colour channel, col = primary.
  const m = [0, 1, 2].map((c) => [r[c], y[c], b[c]]);
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const inv = [
    [m[1][1] * m[2][2] - m[1][2] * m[2][1], m[0][2] * m[2][1] - m[0][1] * m[2][2], m[0][1] * m[1][2] - m[0][2] * m[1][1]],
    [m[1][2] * m[2][0] - m[1][0] * m[2][2], m[0][0] * m[2][2] - m[0][2] * m[2][0], m[0][2] * m[1][0] - m[0][0] * m[1][2]],
    [m[1][0] * m[2][1] - m[1][1] * m[2][0], m[0][1] * m[2][0] - m[0][0] * m[2][1], m[0][0] * m[1][1] - m[0][1] * m[1][0]],
  ];
  return inv.map((row) => row.map((v) => v / det));
})();

/**
 * Works out how much red, yellow and blue paint is in a mix from its
 * absorption (paint mixes add up linearly, so this is a 3x3 solve).
 */
export function unmix(absorption: RGB): [number, number, number] {
  return UNMIX.map((row) => Math.max(0, row[0] * absorption[0] + row[1] * absorption[1] + row[2] * absorption[2])) as [
    number,
    number,
    number,
  ];
}

/** Paint amount, relative to the wish, that still counts as right. Generous on purpose. */
export const AMOUNT_RANGE: [number, number] = [0.55, 2.6];

/**
 * How close a dish is to a wish, 0..1. What matters is the *proportions* of
 * the paints (green = about equal yellow and blue); the amount only has to be
 * in a wide range, so painting a bit thick still works, while pink still needs
 * "just a little red".
 */
export function wishCloseness(absorption: RGB, wish: Wish): { closeness: number; matched: boolean } {
  const mix = unmix(absorption);
  const amount = mix[0] + mix[1] + mix[2];
  const wanted = wish.recipe[0] + wish.recipe[1] + wish.recipe[2];
  if (amount < 0.08) return { closeness: 0, matched: false };
  let gap = 0;
  for (let i = 0; i < 3; i++) gap += Math.abs(mix[i] / amount - wish.recipe[i] / wanted);
  const ratio = amount / wanted;
  const enough = Math.min(1, ratio / AMOUNT_RANGE[0]);
  const notTooMuch = Math.min(1, Math.max(0, (AMOUNT_RANGE[1] + 1 - ratio) / 1));
  const closeness = Math.max(0, 1 - gap / 0.8) * enough * notTooMuch;
  const matched = gap < 0.24 && ratio >= AMOUNT_RANGE[0] && ratio <= AMOUNT_RANGE[1];
  return { closeness, matched };
}
