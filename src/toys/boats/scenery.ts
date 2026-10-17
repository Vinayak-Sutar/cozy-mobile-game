import { dockSpots, type Ground, type MapDef, PIER, type Shape, type WaterScene, waterDistance } from './maps';

/**
 * Paints a map's land, shores, islands, piers and decorations once, into a
 * canvas the size of the whole map. The water itself is left transparent: the
 * fluid shows through. Landmarks and everything that moves are drawn live.
 */

interface GroundStyle {
  land: string;
  rim: string;
  tuft: [string, string];
  flowers: string[];
}

const GROUNDS: Record<Ground, GroundStyle> = {
  meadow: { land: '#9ccf78', rim: '#ecdcae', tuft: ['#86bd64', '#b3df8e'], flowers: ['#ffffff', '#ffd1dc', '#fff2a6'] },
  farm: { land: '#a9d27c', rim: '#e3cf9b', tuft: ['#8fbd63', '#c2e294'], flowers: ['#ffffff', '#ffe08a', '#c9b6ff'] },
  beach: { land: '#f2e0b0', rim: '#f9efcf', tuft: ['#d9c28a', '#e8d49c'], flowers: ['#ffffff', '#ffc9b0', '#ffe9d6'] },
  snow: { land: '#f3f8fc', rim: '#d9e8f3', tuft: ['#dbe8f2', '#ffffff'], flowers: ['#cfe3f2'] },
  night: { land: '#1d3a3c', rim: '#2f5552', tuft: ['#2a4f4c', '#17302f'], flowers: ['#8ff7e1', '#ffe58a', '#c9a7ff'] },
  garden: { land: '#86b36a', rim: '#b9b3a7', tuft: ['#73a058', '#a2cc84'], flowers: ['#ffffff', '#ffb3c7', '#f58fae'] },
};

const RIM = 0.018;

export function landColor(ground: Ground): string {
  return GROUNDS[ground].land;
}

/** A tiny repeatable random sequence, so a map looks the same every visit. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shapePath(s: Shape, unit: number, grow = 0): Path2D {
  const p = new Path2D();
  if (s.kind === 'circle') p.arc(s.x * unit, s.y * unit, (s.r + grow) * unit, 0, Math.PI * 2);
  else if (s.kind === 'rect')
    p.roundRect((s.x - grow) * unit, (s.y - grow) * unit, (s.w + grow * 2) * unit, (s.h + grow * 2) * unit, (s.r + grow) * unit);
  return p;
}

/** Fills a water shape (rivers are thick stroked paths), grown by `grow` units. */
function fillShape(ctx: CanvasRenderingContext2D, s: Shape, unit: number, grow = 0): void {
  if (s.kind === 'path') {
    ctx.save();
    ctx.lineWidth = (s.width + grow * 2) * unit;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * unit, y * unit) : ctx.moveTo(x * unit, y * unit)));
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fill(shapePath(s, unit, grow));
  }
}

export function paintScenery(map: WaterScene, unit: number, scale: number): HTMLCanvasElement {
  const [w, h] = map.size;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * unit * scale));
  canvas.height = Math.max(1, Math.round(h * unit * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  const style = GROUNDS[map.ground];
  const random = seeded(map.id.length * 7919 + 11);
  const u = unit;

  // Land everywhere, a sandy rim around the water, then cut the water out.
  ctx.fillStyle = style.land;
  ctx.fillRect(0, 0, w * u, h * u);
  ctx.fillStyle = style.rim;
  for (const s of map.water) fillShape(ctx, s, u, RIM);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const s of map.water) fillShape(ctx, s, u);
  ctx.globalCompositeOperation = 'source-over';
  for (const island of map.islands) {
    ctx.fillStyle = style.rim;
    ctx.beginPath();
    ctx.arc(island.x * u, island.y * u, (island.r + RIM) * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = island.decor === 'rock' ? '#b9b2a6' : style.land;
    ctx.beginPath();
    ctx.arc(island.x * u, island.y * u, island.r * u, 0, Math.PI * 2);
    ctx.fill();
  }

  const spots = map.docks.map(dockSpots);
  const clear = (x: number, y: number, r: number): boolean =>
    spots.every((s) => Math.hypot(x - s.landmark[0], y - s.landmark[1] + 0.08) > r) &&
    map.docks.every((d) => Math.hypot(x - d.x, y - d.y) > r * 0.8);

  // Grass tufts (or sand ripples, or snow sparkles) and little flowers.
  for (let i = 0; i < w * h * 120; i++) {
    const x = random() * w;
    const y = random() * h;
    if (waterDistance(map, x, y) < 0.02) continue;
    ctx.strokeStyle = style.tuft[i % 2];
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x * u - 3, y * u - 4);
    ctx.lineTo(x * u, y * u);
    ctx.lineTo(x * u + 3, y * u - 5);
    ctx.stroke();
  }
  for (let i = 0; i < w * h * 30; i++) {
    const x = random() * w;
    const y = random() * h;
    if (waterDistance(map, x, y) < 0.03) continue;
    flower(ctx, x * u, y * u, style.flowers[i % style.flowers.length], map.ground);
  }

  // Reeds (or rocks) along the water's edge.
  for (let i = 0; i < w * h * 6; i++) {
    const x = random() * w;
    const y = random() * h;
    const d = waterDistance(map, x, y);
    if (d > -0.005 || d < -0.04 || !clear(x, y, 0.2)) continue;
    if (map.ground === 'snow' || map.ground === 'beach' || map.ground === 'garden') rock(ctx, x * u, y * u, u * 0.022, map.ground === 'snow');
    else reeds(ctx, x * u, y * u, u, random, map.ground === 'night');
  }

  // Piers.
  for (const d of map.docks) pier(ctx, d.x * u, d.y * u, d.nx, d.ny, u);

  // Trees and such on the land, back to front.
  const props: { x: number; y: number; draw: () => void }[] = [];
  for (let i = 0; i < w * h * 9; i++) {
    const x = random() * w;
    const y = random() * h;
    if (waterDistance(map, x, y) < 0.09 || !clear(x, y, 0.24)) continue;
    const size = u * (0.09 + random() * 0.05);
    const kind = random();
    props.push({ x, y, draw: () => prop(ctx, map.ground, x * u, y * u, size, kind) });
  }
  for (const island of map.islands) {
    if (island.decor === 'rock') continue;
    props.push({
      x: island.x,
      y: island.y + island.r * 0.4,
      draw: () => prop(ctx, island.decor === 'pine' ? 'snow' : island.decor === 'glow' ? 'night' : 'meadow', island.x * u, (island.y + island.r * 0.4) * u, u * 0.12, 0.2),
    });
  }
  props.sort((a, b) => a.y - b.y);
  for (const p of props) p.draw();
  if (map.ground === 'night') {
    // Moonlight: dim everything painted so far (the water stays clear).
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(6, 10, 34, 0.38)';
    ctx.fillRect(0, 0, w * u, h * u);
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

/** A small, soft mask of where the water is (white) for the shader's shallows. */
export function paintShoreMask(map: WaterScene): HTMLCanvasElement {
  const res = 20;
  const [w, h] = map.size;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (const s of map.water) fillShape(ctx, s, res);
  ctx.fillStyle = '#000';
  for (const island of map.islands) {
    ctx.beginPath();
    ctx.arc(island.x * res, island.y * res, island.r * res, 0, Math.PI * 2);
    ctx.fill();
  }
  // Two passes of a box blur soften the edge into a gentle slope.
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let pass = 0; pass < 2; pass++) boxBlur(image.data, canvas.width, canvas.height, 2);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function boxBlur(data: Uint8ClampedArray, w: number, h: number, r: number): void {
  const src = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4];
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        sum += src[y * w + xx];
        n++;
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        sum += tmp[yy * w + x];
        n++;
      }
      const v = sum / n;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, ground: Ground): void {
  if (ground === 'snow') {
    // Snow sparkles instead of flowers.
    ctx.fillStyle = color;
    ctx.fillRect(x - 0.6, y - 2.5, 1.2, 5);
    ctx.fillRect(x - 2.5, y - 0.6, 5, 1.2);
    return;
  }
  if (ground === 'beach') {
    // A little shell.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (ground === 'night') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = color;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = ground === 'night' ? '#ffffff' : '#f2b84b';
  ctx.beginPath();
  ctx.arc(x, y, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function reeds(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, random: () => number, night: boolean): void {
  for (let i = 0; i < 4; i++) {
    const rx = x + (random() - 0.5) * u * 0.05;
    const tall = u * (0.04 + random() * 0.04);
    ctx.strokeStyle = night ? '#2e5a4f' : '#5f9e4f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.quadraticCurveTo(rx + 3, y - tall * 0.5, rx + (random() - 0.5) * 8, y - tall);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.fillStyle = night ? '#5a4a6a' : '#9a6a45';
      ctx.beginPath();
      ctx.ellipse(rx + 1, y - tall * 0.8, 2.4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, snowy: boolean): void {
  ctx.fillStyle = 'rgba(20, 50, 60, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a9a39a';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.2, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = snowy ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.35, r * 0.8, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
}

function pier(ctx: CanvasRenderingContext2D, x: number, y: number, nx: number, ny: number, u: number): void {
  const w = u * 0.055;
  const back = u * 0.05;
  const len = u * PIER + back;
  ctx.save();
  ctx.translate(x - nx * back, y - ny * back);
  ctx.rotate(Math.atan2(ny, nx));
  ctx.fillStyle = 'rgba(20, 60, 60, 0.2)';
  ctx.fillRect(2, -w / 2 + 4, len, w);
  ctx.fillStyle = '#c99a68';
  ctx.fillRect(0, -w / 2, len, w);
  ctx.strokeStyle = 'rgba(100, 65, 40, 0.5)';
  ctx.lineWidth = 1.2;
  for (let p = 0; p <= len; p += w * 0.38) {
    ctx.beginPath();
    ctx.moveTo(p, -w / 2);
    ctx.lineTo(p, w / 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#8a5f3c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(len - 3, side * (w / 2), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A tree, bush, palm, snowy pine or glowing tree, standing at (x, y), about `s` tall. */
function prop(ctx: CanvasRenderingContext2D, ground: Ground, x: number, y: number, s: number, kind: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(20, 50, 40, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.12, y, s * 0.34, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ground === 'snow') {
    // A snowy pine.
    ctx.fillStyle = '#7a5236';
    ctx.fillRect(x - s * 0.05, y - s * 0.2, s * 0.1, s * 0.2);
    for (let i = 0; i < 3; i++) {
      const top = y - s * (0.45 + i * 0.25);
      const half = s * (0.36 - i * 0.08);
      ctx.fillStyle = '#4f8a6a';
      ctx.beginPath();
      ctx.moveTo(x - half, top + s * 0.3);
      ctx.lineTo(x, top - s * 0.05);
      ctx.lineTo(x + half, top + s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - half * 0.55, top + s * 0.1);
      ctx.lineTo(x, top - s * 0.05);
      ctx.lineTo(x + half * 0.55, top + s * 0.1);
      ctx.closePath();
      ctx.fill();
    }
  } else if (ground === 'garden' && kind < 0.22) {
    // A stone lantern.
    ctx.fillStyle = '#a9a39a';
    ctx.fillRect(x - s * 0.06, y - s * 0.45, s * 0.12, s * 0.45);
    ctx.fillRect(x - s * 0.16, y - s * 0.05, s * 0.32, s * 0.06);
    ctx.fillStyle = '#c4beb3';
    ctx.fillRect(x - s * 0.15, y - s * 0.68, s * 0.3, s * 0.24);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(x - s * 0.06, y - s * 0.62, s * 0.12, s * 0.12);
    ctx.fillStyle = '#8f897f';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.28, y - s * 0.66);
    ctx.lineTo(x, y - s * 0.86);
    ctx.lineTo(x + s * 0.28, y - s * 0.66);
    ctx.closePath();
    ctx.fill();
  } else if (ground === 'garden') {
    // A maple in autumn colours, or a round azalea bush.
    const maple = kind > 0.5;
    if (maple) {
      ctx.fillStyle = '#7a5236';
      ctx.fillRect(x - s * 0.05, y - s * 0.45, s * 0.1, s * 0.45);
    }
    const colors = maple ? ['#e8534a', '#f08a4b', '#d9443b'] : ['#f58fae', '#ffb3c7', '#e877a0'];
    const blobs: [number, number, number][] = maple
      ? [
          [-0.18, -0.55, 0.2],
          [0.18, -0.55, 0.2],
          [0, -0.74, 0.24],
          [0.02, -0.5, 0.17],
        ]
      : [
          [-0.13, -0.13, 0.15],
          [0.13, -0.13, 0.15],
          [0, -0.2, 0.18],
        ];
    blobs.forEach(([dx, dy, r], i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (ground === 'beach' && kind > 0.4) {
    // A palm tree.
    ctx.strokeStyle = '#9a6a45';
    ctx.lineWidth = s * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s * 0.15, y - s * 0.5, x + s * 0.05, y - s);
    ctx.stroke();
    ctx.fillStyle = '#5fae5a';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.7;
      ctx.beginPath();
      ctx.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.28, y - s + Math.sin(a) * s * 0.18 + s * 0.08, s * 0.3, s * 0.08, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ground === 'beach') {
    // A beach umbrella.
    ctx.strokeStyle = '#8a7a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 0.7);
    ctx.stroke();
    ctx.fillStyle = kind > 0.2 ? '#ff8f8f' : '#6fb6e8';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.7, s * 0.38, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    // A round tree or a bush.
    const night = ground === 'night';
    const leaf = night ? '#2c5a55' : ground === 'farm' ? '#6db35f' : '#5fae5a';
    if (kind > 0.45) {
      ctx.fillStyle = night ? '#3a2f3c' : '#8a5a3c';
      ctx.fillRect(x - s * 0.05, y - s * 0.45, s * 0.1, s * 0.45);
      for (const [dx, dy, r] of [
        [-0.17, -0.55, 0.2],
        [0.17, -0.55, 0.2],
        [0, -0.72, 0.24],
      ]) {
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = night ? 'rgba(143, 247, 225, 0.25)' : 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(x - s * 0.08, y - s * 0.8, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = leaf;
      for (const [dx, r] of [
        [-0.14, 0.15],
        [0.14, 0.15],
        [0, 0.19],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y - s * 0.14, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ground === 'farm') {
        ctx.fillStyle = '#e8534a';
        ctx.beginPath();
        ctx.arc(x + s * 0.06, y - s * 0.22, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** A little painted overview of a map, for the map list. */
export function mapThumbnail(map: MapDef, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const [w, h] = map.size;
  const unit = Math.min(width / w, height / h);
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 12);
  ctx.clip();
  ctx.fillStyle = GROUNDS[map.ground].land;
  ctx.fillRect(0, 0, width, height);
  ctx.translate((width - w * unit) / 2, (height - h * unit) / 2);
  const [r, g, b] = map.look.deep.map((v, i) => Math.round(((v + map.look.shallow[i]) / 2) * 255));
  ctx.fillStyle = GROUNDS[map.ground].rim;
  for (const s of map.water) fillShape(ctx, s, unit, 0.04);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  for (const s of map.water) fillShape(ctx, s, unit);
  ctx.fillStyle = GROUNDS[map.ground].land;
  for (const island of map.islands) {
    ctx.beginPath();
    ctx.arc(island.x * unit, island.y * unit, island.r * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#c99a68';
  for (const d of map.docks) {
    ctx.beginPath();
    ctx.arc((d.x + d.nx * 0.08) * unit, (d.y + d.ny * 0.08) * unit, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
