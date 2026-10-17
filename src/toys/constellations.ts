/**
 * Star pictures for Lantern Lights. Each lit lantern rises to one star; when
 * every star is in place, the lines join and the picture appears.
 * Points are in a 0..1 box (x right, y down).
 */
export interface Constellation {
  id: string;
  name: string;
  points: [number, number][];
  lines: [number, number][];
}

const pentagram = (): [number, number][] =>
  Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    return [0.5 + Math.cos(a) * 0.48, 0.52 + Math.sin(a) * 0.48] as [number, number];
  });

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'heart',
    name: 'A little heart!',
    points: [
      [0.5, 0.95],
      [0.1, 0.42],
      [0.3, 0.06],
      [0.5, 0.3],
      [0.7, 0.06],
      [0.9, 0.42],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
    ],
  },
  {
    id: 'fish',
    name: 'A fish in the sky!',
    points: [
      [0.04, 0.5],
      [0.38, 0.12],
      [0.7, 0.5],
      [0.38, 0.88],
      [0.97, 0.15],
      [0.97, 0.85],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [2, 4],
      [4, 5],
      [5, 2],
    ],
  },
  {
    id: 'kite',
    name: 'A kite!',
    points: [
      [0.5, 0.0],
      [0.8, 0.35],
      [0.5, 0.75],
      [0.2, 0.35],
      [0.68, 1.0],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 2],
      [1, 3],
      [2, 4],
    ],
  },
  {
    id: 'bunny',
    name: 'A bunny!',
    points: [
      [0.32, 0.0],
      [0.52, 0.02],
      [0.44, 0.42],
      [0.28, 0.85],
      [0.74, 0.9],
      [0.95, 0.66],
    ],
    lines: [
      [0, 2],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 4],
    ],
  },
  {
    id: 'boat',
    name: 'A sailing boat!',
    points: [
      [0.06, 0.64],
      [0.94, 0.64],
      [0.5, 0.96],
      [0.47, 0.0],
      [0.86, 0.52],
    ],
    lines: [
      [0, 1],
      [0, 2],
      [2, 1],
      [3, 2],
      [3, 4],
    ],
  },
  {
    id: 'star',
    name: 'A shining star!',
    points: pentagram(),
    lines: [
      [0, 2],
      [2, 4],
      [4, 1],
      [1, 3],
      [3, 0],
    ],
  },
];

/** A small drawing of a constellation, for the sky book. */
export function constellationThumbnail(c: Constellation, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#1d2150';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 10);
  ctx.fill();
  const pad = size * 0.16;
  const at = ([x, y]: [number, number]): [number, number] => [pad + x * (size - pad * 2), pad + y * (size - pad * 2)];
  ctx.strokeStyle = 'rgba(255, 236, 180, 0.7)';
  ctx.lineWidth = 1.5;
  for (const [a, b] of c.lines) {
    ctx.beginPath();
    ctx.moveTo(...at(c.points[a]));
    ctx.lineTo(...at(c.points[b]));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff6d6';
  for (const p of c.points) {
    const [x, y] = at(p);
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
