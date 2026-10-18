/** Colour helpers and the built-in colour libraries. Hue 0..360, saturation and value 0..1. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

export const hsvToHex = (c: HSV): string => rgbToHex(...hsvToRgb(c));
export const hexToHsv = (hex: string): HSV => rgbToHsv(...hexToRgb(hex));

export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

/** Curated sets to start from (your own palettes are added beside these). */
export const LIBRARIES: Palette[] = [
  {
    id: 'watercolor',
    name: 'Classic watercolour',
    colors: ['#f2d14b', '#e8a33d', '#d8572a', '#b8282e', '#8c2546', '#4a3a8c', '#2e5aa8', '#2a8aa6', '#3a8a5a', '#7a8a3a', '#8a5a2e', '#3a2e2a'],
  },
  {
    id: 'pastel',
    name: 'Pastel dreams',
    colors: ['#f7c6d9', '#f9d5bb', '#fbeaac', '#d6efc7', '#c4e4f2', '#d9cff2', '#f4b6c2', '#ffd8a8', '#b8e0d2', '#a8c8f0', '#e2c2f0', '#ffffff'],
  },
  {
    id: 'skin',
    name: 'Skin tones',
    colors: ['#ffe0cf', '#f8cfb2', '#efbd98', '#e0a57e', '#c98a62', '#b07049', '#8f5636', '#6e4027', '#55301d', '#3d2216', '#f2b8a2', '#d9917a'],
  },
  {
    id: 'sunset',
    name: 'Sunset sky',
    colors: ['#2b1d4a', '#4a2a6e', '#7a3a8a', '#b8487a', '#e86a6a', '#f28d58', '#f7b64d', '#fbe08a', '#ffc4a3', '#f5a6b8', '#6a5a9a', '#1a1430'],
  },
  {
    id: 'earth',
    name: 'Earth and forest',
    colors: ['#2e3a24', '#4a5a2e', '#6e7a3a', '#9aa05a', '#c8b88a', '#a88a5a', '#7a5a3a', '#5a3e2a', '#3a2a1e', '#8a9a8a', '#5a6e6a', '#d8cfb8'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['#0a1e3a', '#123a6a', '#1a5a9a', '#2a7ac0', '#4aa0d8', '#7ac4e8', '#b0e0f0', '#e0f4fa', '#1a6a6a', '#2a9a8a', '#6ac8b0', '#f4e8d0'],
  },
  {
    id: 'neon',
    name: 'Neon night',
    colors: ['#ff2a8a', '#ff6a2a', '#ffe02a', '#6aff2a', '#2affc8', '#2ac8ff', '#6a5aff', '#c82aff', '#ffffff', '#ff8ad8', '#8affff', '#0a0a1a'],
  },
  {
    id: 'greys',
    name: 'Greys',
    colors: ['#ffffff', '#e8e8ea', '#cfcfd4', '#b4b4ba', '#98989f', '#7c7c84', '#61616a', '#47474f', '#303036', '#1e1e22', '#121214', '#000000'],
  },
];

/** Colours that go well with `c`. */
export function harmonies(c: HSV): { name: string; colors: string[] }[] {
  const at = (dh: number, s = c.s, v = c.v): string => hsvToHex({ h: (c.h + dh + 360) % 360, s, v });
  return [
    { name: 'Complementary', colors: [at(0), at(180)] },
    { name: 'Analogous', colors: [at(-30), at(0), at(30)] },
    { name: 'Triadic', colors: [at(0), at(120), at(240)] },
    { name: 'Split complementary', colors: [at(0), at(150), at(210)] },
    { name: 'Tetradic', colors: [at(0), at(90), at(180), at(270)] },
    { name: 'Shades', colors: [at(0, c.s, Math.min(1, c.v * 1.25)), at(0), at(0, c.s, c.v * 0.7), at(0, c.s, c.v * 0.45)] },
  ];
}
