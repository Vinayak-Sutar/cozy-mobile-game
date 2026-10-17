/** The flowers you can grow in Water the Garden, and how to draw them. */

export type PetalShape = 'round' | 'pointy' | 'cup' | 'spike';

export interface Species {
  id: string;
  name: string;
  petal: string;
  heart: string;
  petals: number;
  shape: PetalShape;
}

export const SPECIES: Species[] = [
  { id: 'daisy', name: 'Daisy', petal: '#ffffff', heart: '#f7c948', petals: 12, shape: 'round' },
  { id: 'tulip', name: 'Tulip', petal: '#ff7a8a', heart: '#ffd1d8', petals: 3, shape: 'cup' },
  { id: 'poppy', name: 'Poppy', petal: '#ff6a52', heart: '#3a2b2b', petals: 5, shape: 'round' },
  { id: 'bluebell', name: 'Bluebell', petal: '#7d8cff', heart: '#e3e6ff', petals: 6, shape: 'pointy' },
  { id: 'sunflower', name: 'Sunflower', petal: '#ffc93c', heart: '#7a4a1e', petals: 16, shape: 'pointy' },
  { id: 'lavender', name: 'Lavender', petal: '#b48cf2', heart: '#e9dcff', petals: 0, shape: 'spike' },
  { id: 'rose', name: 'Rose', petal: '#f2557a', heart: '#ffb3c5', petals: 8, shape: 'round' },
  { id: 'cosmos', name: 'Cosmos', petal: '#f59bd0', heart: '#ffe08a', petals: 8, shape: 'pointy' },
];

export const speciesById = (id: string): Species | undefined => SPECIES.find((s) => s.id === id);

/**
 * Draws one flower with its base at (0, 0), growing up the negative y axis.
 * `grow` 0..1 is the stem, `open` 0..1 is the bloom, `size` is the head radius.
 */
export function drawFlower(
  ctx: CanvasRenderingContext2D,
  species: Species,
  height: number,
  size: number,
  grow: number,
  open: number,
  sway: number,
): void {
  const stemTop = -height * grow;
  const tipX = Math.sin(sway) * height * 0.12 * grow;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4f8f4a';
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(tipX * 0.2, stemTop * 0.5, tipX, stemTop);
  ctx.stroke();

  // Two leaves unfurl as the stem grows.
  if (grow > 0.35) {
    const leaf = Math.min(1, (grow - 0.35) / 0.4) * size * 0.7;
    ctx.fillStyle = '#5ea85a';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(tipX * 0.25, stemTop * (side < 0 ? 0.35 : 0.5));
      ctx.rotate(side * 0.9);
      ctx.beginPath();
      ctx.ellipse(side * leaf * 0.5, 0, leaf * 0.55, leaf * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (open > 0) {
    ctx.translate(tipX, stemTop);
    ctx.rotate(sway * 0.3);
    drawHead(ctx, species, size, open);
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, s: Species, size: number, open: number): void {
  const r = size * (0.35 + 0.65 * open);
  if (s.shape === 'spike') {
    // Lavender: a tall spike of little buds.
    ctx.fillStyle = s.petal;
    for (let i = 0; i < 7; i++) {
      const y = -i * r * 0.32;
      const w = r * 0.32 * (1 - i / 9);
      ctx.beginPath();
      ctx.ellipse(-w * 0.6, y, w, w * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.6, y - r * 0.12, w, w * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (s.shape === 'cup') {
    // Tulip: three overlapping cupped petals.
    ctx.fillStyle = s.petal;
    for (const [x, rot] of [
      [-r * 0.35, -0.35],
      [r * 0.35, 0.35],
      [0, 0],
    ]) {
      ctx.save();
      ctx.translate(x, -r * 0.3);
      ctx.rotate(rot * open);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = s.heart;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.45, r * 0.18, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Round or pointy petals around a heart.
  ctx.fillStyle = s.petal;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < s.petals; i++) {
    ctx.save();
    ctx.rotate((i / s.petals) * Math.PI * 2);
    ctx.beginPath();
    if (s.shape === 'pointy') {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.28, -r * 0.55, 0, -r * open);
      ctx.quadraticCurveTo(-r * 0.28, -r * 0.55, 0, 0);
    } else {
      const len = r * 0.55 * open + r * 0.1;
      ctx.ellipse(0, -len, r * (s.petals > 10 ? 0.16 : 0.3), len, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = s.heart;
  ctx.beginPath();
  ctx.arc(0, 0, r * (s.id === 'sunflower' ? 0.42 : 0.24), 0, Math.PI * 2);
  ctx.fill();
}

export interface PotStyle {
  id: string;
  name: string;
}

export const POTS: PotStyle[] = [
  { id: 'terracotta', name: 'Clay pot' },
  { id: 'glaze', name: 'Blue pot' },
  { id: 'cream', name: 'Cream pot' },
  { id: 'basket', name: 'Basket' },
];

/** Draws a pot standing on (0, 0), `w` wide. Plants grow from its rim at y = -w * 0.62. */
export function drawPot(ctx: CanvasRenderingContext2D, potId: string, w: number): void {
  const h = w * 0.62;
  const rim = w * 0.16;
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-w * 0.46, -h);
    ctx.lineTo(w * 0.46, -h);
    ctx.lineTo(w * 0.36, 0);
    ctx.lineTo(-w * 0.36, 0);
    ctx.closePath();
  };
  ctx.save();
  if (potId === 'basket') {
    ctx.fillStyle = '#c99a5e';
    body();
    ctx.fill();
    ctx.save();
    body();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 80, 40, 0.45)';
    ctx.lineWidth = Math.max(1, w * 0.05);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w, -h + (h * i) / 4);
      ctx.lineTo(w, -h + (h * i) / 4);
      ctx.stroke();
    }
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 6, -h);
      ctx.lineTo((w * i) / 7, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#b5844a';
    ctx.fillRect(-w * 0.5, -h - rim * 0.5, w, rim);
  } else {
    const colors: Record<string, [string, string]> = {
      terracotta: ['#d98261', '#c56f4f'],
      glaze: ['#5b8fd6', '#4a79bd'],
      cream: ['#f1ece4', '#ddd5c8'],
    };
    const [main, dark] = colors[potId] ?? colors.terracotta;
    ctx.fillStyle = main;
    body();
    ctx.fill();
    // A glossy streak on glazed pots.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(-w * 0.3, -h * 0.9, w * 0.08, h * 0.75);
    ctx.fillStyle = dark;
    ctx.fillRect(-w * 0.52, -h - rim * 0.5, w * 1.04, rim);
  }
  ctx.restore();
}

/** A little picture for the plant tray: a flower or a pot on a transparent canvas. */
export function thumbnail(kind: 'flower' | 'pot', id: string, size = 56): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  if (kind === 'pot') {
    ctx.translate(size / 2, size * 0.78);
    drawPot(ctx, id, size * 0.6);
  } else {
    const species = speciesById(id);
    if (species) {
      ctx.translate(size / 2, size * 0.95);
      drawFlower(ctx, species, size * 0.55, size * 0.2, 1, 1, 0);
    }
  }
  return canvas;
}
