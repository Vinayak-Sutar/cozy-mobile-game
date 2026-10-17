/**
 * Koi: the varieties you can raise, and how to draw one from above. A koi's
 * body follows a spine of points from head to tail, so it bends as it swims.
 */
import { seeded } from '../boats/scenery';

export interface KoiVariety {
  id: string;
  name: string;
  base: string;
  fin: string;
  /** A metallic sheen (Ogon, Platinum). */
  shine: boolean;
}

export const VARIETIES: KoiVariety[] = [
  { id: 'kohaku', name: 'Kohaku', base: '#fdf7ef', fin: 'rgba(255, 250, 244, 0.75)', shine: false },
  { id: 'tancho', name: 'Tancho', base: '#fbf8f2', fin: 'rgba(255, 252, 246, 0.75)', shine: false },
  { id: 'ogon', name: 'Ogon', base: '#f4bd4f', fin: 'rgba(250, 205, 110, 0.75)', shine: true },
  { id: 'sanke', name: 'Sanke', base: '#fcf6ec', fin: 'rgba(255, 250, 244, 0.75)', shine: false },
  { id: 'showa', name: 'Showa', base: '#2f2f3a', fin: 'rgba(70, 70, 84, 0.75)', shine: false },
  { id: 'asagi', name: 'Asagi', base: '#8ea9c4', fin: 'rgba(240, 150, 110, 0.7)', shine: false },
  { id: 'chagoi', name: 'Chagoi', base: '#b98a5a', fin: 'rgba(200, 160, 120, 0.75)', shine: false },
  { id: 'platinum', name: 'Platinum', base: '#e9eef2', fin: 'rgba(240, 244, 248, 0.75)', shine: true },
];

export function varietyById(id: string): KoiVariety {
  return VARIETIES.find((v) => v.id === id) ?? VARIETIES[0];
}

/** A colour spot on the body: `t` from head (0) to tail (1), `side` across the back (-1..1), `r` as a fraction of length. */
export interface Patch {
  t: number;
  side: number;
  r: number;
  color: string;
}

const RED = '#e5462c';
const INK = '#26262f';
const WHITE = '#fbf7ef';

/** Each koi of a variety gets its own spots, from its seed. */
export function koiPattern(variety: string, seed: number): Patch[] {
  const random = seeded(seed * 7 + 3);
  const r = (min: number, max: number): number => min + random() * (max - min);
  const patches: Patch[] = [];
  const spots = (count: number, color: string, size: [number, number], from = 0.1, to = 0.72): void => {
    for (let i = 0; i < count; i++) patches.push({ t: r(from, to), side: r(-0.6, 0.6), r: r(size[0], size[1]), color });
  };
  if (variety === 'kohaku') spots(2 + Math.floor(r(0, 2)), RED, [0.08, 0.13]);
  else if (variety === 'tancho') patches.push({ t: 0.08, side: 0, r: 0.06, color: RED });
  else if (variety === 'sanke') {
    spots(2, RED, [0.08, 0.12]);
    spots(4, INK, [0.025, 0.045], 0.2, 0.8);
  } else if (variety === 'showa') {
    spots(2, RED, [0.08, 0.12]);
    spots(2, WHITE, [0.05, 0.08], 0.15, 0.7);
  } else if (variety === 'asagi') {
    patches.push({ t: 0.06, side: 0, r: 0.06, color: '#e6eef5' });
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) patches.push({ t: 0.25 + i * 0.16, side: side * 0.95, r: 0.05, color: '#ef7d52' });
    }
  }
  return patches;
}

export interface KoiPose {
  /** Spine points from head to tail. */
  spine: [number, number][];
  length: number;
  /** 0 = closed, 1 = gulping. */
  mouth: number;
  /** Fin flap phase. */
  flap: number;
  alpha?: number;
}

/** Body half-width at each spine point, as a fraction of length. */
const WIDTHS = [0.09, 0.125, 0.14, 0.135, 0.12, 0.095, 0.07, 0.048, 0.03];
export const SPINE_POINTS = WIDTHS.length;

export function drawKoi(ctx: CanvasRenderingContext2D, pose: KoiPose, variety: KoiVariety, patches: Patch[]): void {
  const { spine, length: L } = pose;
  const n = spine.length;
  const normals = spine.map((_, i) => {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    return [-dy / d, dx / d] as [number, number];
  });
  const width = (i: number): number => WIDTHS[Math.min(WIDTHS.length - 1, i)] * L;
  // Head direction: from the second point toward the first.
  let hx = spine[0][0] - spine[1][0];
  let hy = spine[0][1] - spine[1][1];
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  const headAngle = Math.atan2(hy, hx);

  const body = new Path2D();
  const [p0x, p0y] = spine[0];
  body.arc(p0x, p0y, width(0), headAngle - Math.PI / 2, headAngle + Math.PI / 2);
  for (let i = 1; i < n; i++) body.lineTo(spine[i][0] + normals[i][0] * width(i), spine[i][1] + normals[i][1] * width(i));
  for (let i = n - 1; i >= 1; i--) body.lineTo(spine[i][0] - normals[i][0] * width(i), spine[i][1] - normals[i][1] * width(i));
  body.closePath();

  ctx.save();
  ctx.globalAlpha = pose.alpha ?? 1;

  // A soft shadow on the pond floor.
  ctx.save();
  ctx.translate(L * 0.05, L * 0.12);
  ctx.fillStyle = 'rgba(0, 20, 20, 0.22)';
  ctx.fill(body);
  ctx.restore();

  // Fins under the body: two pectoral fins that paddle, and the tail.
  ctx.fillStyle = variety.fin;
  const fi = 2;
  const [fx, fy] = spine[fi];
  const flap = Math.sin(pose.flap) * 0.35;
  for (const side of [-1, 1]) {
    const nx = normals[fi][0] * side;
    const ny = normals[fi][1] * side;
    // Out to the side and swept back, paddling a little.
    const angle = Math.atan2(ny - hy, nx - hx) + side * flap;
    ctx.beginPath();
    ctx.ellipse(fx + nx * width(fi) + Math.cos(angle) * L * 0.06, fy + ny * width(fi) + Math.sin(angle) * L * 0.06, L * 0.09, L * 0.04, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  const [tx, ty] = spine[n - 1];
  const [ux, uy] = spine[n - 2];
  let dx = tx - ux;
  let dy = ty - uy;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(tx + dx * L * 0.12 + px * L * 0.04, ty + dy * L * 0.12 + py * L * 0.04, tx + dx * L * 0.2 + px * L * 0.12, ty + dy * L * 0.2 + py * L * 0.12);
  ctx.quadraticCurveTo(tx + dx * L * 0.12, ty + dy * L * 0.12, tx + dx * L * 0.2 - px * L * 0.12, ty + dy * L * 0.2 - py * L * 0.12);
  ctx.quadraticCurveTo(tx + dx * L * 0.12 - px * L * 0.04, ty + dy * L * 0.12 - py * L * 0.04, tx, ty);
  ctx.fill();

  // The body, its spots, and a sheen along the back.
  ctx.fillStyle = variety.base;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  for (const patch of patches) {
    const f = patch.t * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const k = f - i;
    const x = spine[i][0] + (spine[i + 1][0] - spine[i][0]) * k;
    const y = spine[i][1] + (spine[i + 1][1] - spine[i][1]) * k;
    const w = width(i) + (width(i + 1) - width(i)) * k;
    const nx = normals[i][0];
    const ny = normals[i][1];
    ctx.fillStyle = patch.color;
    ctx.beginPath();
    ctx.ellipse(x + nx * patch.side * w, y + ny * patch.side * w, patch.r * L * 1.25, patch.r * L, Math.atan2(ny, nx) + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = variety.shine ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = L * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 1; i < n - 2; i++) {
    const x = spine[i][0];
    const y = spine[i][1];
    if (i === 1) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Eyes, a little mouth (open when gulping) and whiskers.
  const ex = p0x + hx * width(0) * 0.25;
  const ey = p0y + hy * width(0) * 0.25;
  ctx.fillStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ex + normals[0][0] * side * width(0) * 0.72, ey + normals[0][1] * side * width(0) * 0.72, L * 0.016, 0, Math.PI * 2);
    ctx.fill();
  }
  const mx = p0x + hx * width(0) * 0.92;
  const my = p0y + hy * width(0) * 0.92;
  ctx.fillStyle = 'rgba(60, 30, 30, 0.75)';
  ctx.beginPath();
  ctx.ellipse(mx, my, L * (0.012 + pose.mouth * 0.03), L * (0.02 + pose.mouth * 0.03), headAngle, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 60, 50, 0.45)';
  ctx.lineWidth = Math.max(1, L * 0.008);
  for (const side of [-1, 1]) {
    const sx = mx + normals[0][0] * side * L * 0.02;
    const sy = my + normals[0][1] * side * L * 0.02;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + hx * L * 0.03 + normals[0][0] * side * L * 0.035, sy + hy * L * 0.03 + normals[0][1] * side * L * 0.035);
    ctx.stroke();
  }
  ctx.restore();
}

/** A straight spine for drawing a koi at rest (thumbnails, card art). */
export function restingSpine(x: number, y: number, length: number, angle = 0, curve = 0.12): [number, number][] {
  const seg = length / (SPINE_POINTS - 1);
  const spine: [number, number][] = [];
  for (let i = 0; i < SPINE_POINTS; i++) {
    const k = i / (SPINE_POINTS - 1);
    const along = -i * seg;
    const across = Math.sin(k * Math.PI) * curve * length * (k - 0.3);
    spine.push([x + Math.cos(angle) * along - Math.sin(angle) * across, y + Math.sin(angle) * along + Math.cos(angle) * across]);
  }
  return spine;
}

/** A koi on a little square of pond, for the koi book. */
export function koiThumbnail(variety: KoiVariety, size: number, seed = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#2e5b57';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 10);
  ctx.fill();
  const length = size * 0.78;
  const spine = restingSpine(size * 0.5 + length * 0.42, size * 0.5 + length * 0.18, length, -0.45, 0.18);
  drawKoi(ctx, { spine, length, mouth: 0, flap: 0.5 }, variety, koiPattern(variety.id, seed));
  return canvas;
}
