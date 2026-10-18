import { context, makeCanvas } from '../doc/document';

/**
 * Brush tips (the shape of one dab) and grains (the paper texture that
 * shows through the paint). Tips are white masks with alpha, made once.
 */
export type TipKind = 'round' | 'pencil' | 'charcoal' | 'chalk' | 'flat' | 'bristle' | 'spray' | 'star' | 'leaf' | 'flower' | 'heart';
export type Grain = 'none' | 'paper' | 'canvas' | 'pencil' | 'rough';

export const TIP_SIZE = 256;

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const tips = new Map<string, HTMLCanvasElement>();

/** A white tip mask, TIP_SIZE square. `hardness` matters for round tips (0 soft, 1 crisp). */
export function tipMask(kind: TipKind, hardness: number): HTMLCanvasElement {
  const key = `${kind}:${kind === 'round' ? Math.round(hardness * 20) : 0}`;
  const cached = tips.get(key);
  if (cached) return cached;
  const canvas = makeCanvas(TIP_SIZE, TIP_SIZE);
  const ctx = context(canvas);
  const c = TIP_SIZE / 2;
  const r = TIP_SIZE / 2 - 2;
  const random = seeded(kind.length * 977 + 13);
  ctx.fillStyle = '#ffffff';
  switch (kind) {
    case 'round': {
      const h = Math.round(hardness * 20) / 20;
      const g = ctx.createRadialGradient(c, c, 0, c, c, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(Math.min(0.985, Math.max(0.01, h)), 'rgba(255,255,255,1)');
      if (h < 0.6) g.addColorStop(Math.min(0.99, h + (1 - h) * 0.5), 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pencil': {
      // A crisp disc full of tiny graphite specks.
      ctx.beginPath();
      ctx.arc(c, c, r * 0.95, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 2600; i++) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * r;
        ctx.globalAlpha = 0.25 + random() * 0.75;
        ctx.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 3, 3);
      }
      break;
    }
    case 'charcoal':
    case 'chalk': {
      // A rough-edged blob with holes; chalk is squarer and grainier.
      for (let i = 0; i < (kind === 'chalk' ? 900 : 650); i++) {
        const a = random() * Math.PI * 2;
        const d = Math.pow(random(), kind === 'chalk' ? 0.4 : 0.6) * r;
        const s = 4 + random() * (kind === 'chalk' ? 10 : 18);
        ctx.globalAlpha = 0.2 + random() * 0.6;
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d * (kind === 'chalk' ? 0.7 : 1), s, s * (0.4 + random() * 0.6), random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'flat': {
      // A chisel: wide and thin, with soft ends.
      const g = ctx.createLinearGradient(0, 0, TIP_SIZE, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.08, 'rgba(255,255,255,1)');
      g.addColorStop(0.92, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, c - r * 0.95, TIP_SIZE, r * 1.9);
      break;
    }
    case 'bristle': {
      // A loaded flat brush: a solid body of paint, with hairs that leave streaks.
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(c, c, r * 0.92, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 140; i++) {
        const x = c + (random() - 0.5) * r * 1.9;
        const y = c + (random() - 0.5) * r * 0.55;
        ctx.globalAlpha = 0.3 + random() * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 4 + random() * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'spray': {
      for (let i = 0; i < 520; i++) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * r;
        ctx.globalAlpha = 0.5 + random() * 0.5;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1.2 + random() * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const d = i % 2 ? r * 0.42 : r;
        ctx.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(c, c - r);
      ctx.quadraticCurveTo(c + r * 0.85, c - r * 0.1, c, c + r);
      ctx.quadraticCurveTo(c - r * 0.85, c - r * 0.1, c, c - r);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(c, c - r * 0.8);
      ctx.lineTo(c, c + r * 0.9);
      ctx.stroke();
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * r * 0.48, c + Math.sin(a) * r * 0.48, r * 0.42, r * 0.3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c, c, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(c, c + r * 0.85);
      ctx.bezierCurveTo(c - r * 1.4, c - r * 0.1, c - r * 0.55, c - r * 1.05, c, c - r * 0.35);
      ctx.bezierCurveTo(c + r * 0.55, c - r * 1.05, c + r * 1.4, c - r * 0.1, c, c + r * 0.85);
      ctx.fill();
      break;
    }
  }
  tips.set(key, canvas);
  return canvas;
}

const grains = new Map<string, HTMLCanvasElement>();

/**
 * A tileable grain mask: alpha 1 where paint takes fully, lower in the
 * paper's dips. `depth` 0 = no texture, 1 = strong texture.
 */
export function grainMask(grain: Grain, depth: number): HTMLCanvasElement | null {
  if (grain === 'none' || depth <= 0) return null;
  const key = `${grain}:${Math.round(depth * 10)}`;
  const cached = grains.get(key);
  if (cached) return cached;
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = context(canvas);
  const image = ctx.createImageData(size, size);
  const random = seeded(grain.length * 31 + 5);
  const noise = new Float32Array(size * size).map(() => random());
  const at = (x: number, y: number): number => noise[((y + size) % size) * size + ((x + size) % size)];
  const d = Math.round(depth * 10) / 10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let g: number;
      if (grain === 'canvas') {
        const weave = (Math.sin((x / size) * Math.PI * 2 * 32) * Math.sin((y / size) * Math.PI * 2 * 32) + 1) / 2;
        g = 0.6 * weave + 0.4 * at(x, y);
      } else if (grain === 'pencil') {
        // Fine, slightly streaky tooth.
        g = (at(x, y) * 2 + at(x + 1, y) + at(x - 1, y)) / 4;
      } else if (grain === 'rough') {
        g = (at(x, y) + at(x >> 1, y >> 1) + at(x >> 2, y >> 2)) / 3;
      } else {
        let sum = 0;
        for (let k = -2; k <= 2; k++) sum += at(x + k, y) + at(x, y + k);
        g = sum / 10;
      }
      // Stretch the contrast so the texture reads clearly.
      g = Math.min(1, Math.max(0, (g - 0.5) * 2.4 + 0.5));
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * (1 - d * (1 - g)));
    }
  }
  ctx.putImageData(image, 0, 0);
  grains.set(key, canvas);
  return canvas;
}

/** A white tip coloured in, cached for strokes whose colour doesn't change. */
const coloured = new Map<string, HTMLCanvasElement>();

export function colouredTip(mask: HTMLCanvasElement, maskKey: string, color: string): HTMLCanvasElement {
  const key = `${maskKey}|${color}`;
  const cached = coloured.get(key);
  if (cached) return cached;
  const canvas = makeCanvas(TIP_SIZE, TIP_SIZE);
  const ctx = context(canvas);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TIP_SIZE, TIP_SIZE);
  if (coloured.size > 24) coloured.delete(coloured.keys().next().value as string);
  coloured.set(key, canvas);
  return canvas;
}
