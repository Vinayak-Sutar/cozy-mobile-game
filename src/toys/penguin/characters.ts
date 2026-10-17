/**
 * Penguin Island's characters and little things, drawn with canvas shapes in
 * the same soft style as the boat passengers. Penguins stand on (x, y) (their
 * feet), about `s` tall.
 */

const INK = '#26262f';
const BEAK = '#f39a3c';

export type Wear =
  | 'beanie'
  | 'bobble'
  | 'flower'
  | 'tophat'
  | 'earmuffs'
  | 'captain'
  | 'bow'
  | 'scarf'
  | 'bowtie'
  | 'glasses';

export type Carry = 'letter' | 'mitten';

export interface PenguinLook {
  /** -1..1: which way he faces (passes through 0 as he turns). */
  facing: number;
  /** Walking away from you: show his back. */
  back?: boolean;
  /** Step phase, for the waddle. */
  phase: number;
  /** How much he's waddling (0 standing still .. 1 walking). */
  walk: number;
  happy?: boolean;
  flap?: number;
  wear?: Wear[];
  carry?: Carry[];
  /** Body colour (islanders vary a little). */
  body?: string;
}

export function drawPenguin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: PenguinLook): void {
  const sway = Math.sin(look.phase) * 0.12 * look.walk;
  const flip = Math.abs(look.facing) < 0.15 ? 0.15 * Math.sign(look.facing || 1) : look.facing;
  ctx.save();
  // Shadow.
  ctx.fillStyle = 'rgba(40, 70, 100, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.34, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(sway);
  // Feet, stepping in turn.
  const step = Math.sin(look.phase) * s * 0.05 * look.walk;
  ctx.fillStyle = BEAK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.12, -s * 0.02 - side * step, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(flip, 1);
  const body = look.body ?? '#2f3446';
  // Flippers.
  const flap = (look.flap ?? 0) + Math.sin(look.phase) * 0.25 * look.walk;
  ctx.fillStyle = body;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.27, -s * 0.48);
    ctx.rotate(side * (0.35 + flap));
    ctx.beginPath();
    ctx.ellipse(0, s * 0.12, s * 0.07, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Body and belly.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.45, s * 0.3, s * 0.43, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!look.back) {
    ctx.fillStyle = '#fbfbf7';
    ctx.beginPath();
    ctx.ellipse(s * 0.04, -s * 0.38, s * 0.21, s * 0.31, 0, 0, Math.PI * 2);
    ctx.fill();
    // Face.
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    for (const ex of [-0.04, 0.16]) {
      ctx.beginPath();
      if (look.happy) {
        ctx.arc(ex * s, -s * 0.66, s * 0.04, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else {
        ctx.arc(ex * s, -s * 0.66, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255, 130, 150, 0.5)';
    for (const cx of [-0.1, 0.24]) {
      ctx.beginPath();
      ctx.ellipse(cx * s, -s * 0.58, s * 0.045, s * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = BEAK;
    ctx.beginPath();
    ctx.moveTo(s * 0.02, -s * 0.6);
    ctx.lineTo(s * 0.18, -s * 0.585);
    ctx.lineTo(s * 0.02, -s * 0.56);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Things he wears and carries don't flip with him.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  for (const item of look.wear ?? []) drawWear(ctx, item, s, look.back ?? false);
  ctx.restore();
  (look.carry ?? []).forEach((item, i) => drawCarry(ctx, item, x + (i - ((look.carry?.length ?? 1) - 1) / 2) * s * 0.4, y - s * 1.12, s * 0.32));
}

/** A hat or scarf, in the penguin's frame (feet at 0, 0). */
export function drawWear(ctx: CanvasRenderingContext2D, item: Wear, s: number, back = false): void {
  const top = -s * 0.86;
  ctx.save();
  switch (item) {
    case 'beanie':
    case 'bobble': {
      ctx.fillStyle = item === 'beanie' ? '#e5462c' : '#5aa9e6';
      ctx.beginPath();
      ctx.arc(0, top + s * 0.06, s * 0.2, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.22, top + s * 0.04, s * 0.44, s * 0.06);
      if (item === 'bobble') {
        ctx.beginPath();
        ctx.arc(0, top - s * 0.15, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        ctx.fillStyle = ['#ff8fb1', '#ffd56a', '#8fcfff', '#b6e39a', '#ff8fb1'][i];
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 0.2, top + s * 0.08 + Math.sin(a) * s * 0.1, s * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'tophat':
      ctx.fillStyle = INK;
      ctx.fillRect(-s * 0.24, top + s * 0.02, s * 0.48, s * 0.05);
      ctx.fillRect(-s * 0.15, top - s * 0.22, s * 0.3, s * 0.25);
      ctx.fillStyle = '#e5462c';
      ctx.fillRect(-s * 0.15, top - s * 0.04, s * 0.3, s * 0.05);
      break;
    case 'captain':
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, top + s * 0.02, s * 0.22, s * 0.09, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#2b3a67';
      ctx.fillRect(-s * 0.24, top + s * 0.02, s * 0.48, s * 0.05);
      ctx.fillStyle = '#ffd56a';
      ctx.beginPath();
      ctx.arc(0, top - s * 0.02, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'earmuffs':
      ctx.strokeStyle = '#ff8fb1';
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.arc(0, top + s * 0.14, s * 0.22, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = '#ffb3c7';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * s * 0.25, top + s * 0.2, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'bow':
      ctx.fillStyle = '#ff6b8a';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.12, top + s * 0.06);
        ctx.lineTo(s * 0.12 + side * s * 0.12, top - s * 0.02);
        ctx.lineTo(s * 0.12 + side * s * 0.12, top + s * 0.14);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'scarf':
      ctx.fillStyle = '#e5462c';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.52, s * 0.29, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!back) ctx.fillRect(s * 0.08, -s * 0.52, s * 0.09, s * 0.22);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(-s * 0.2, -s * 0.535, s * 0.4, s * 0.02);
      break;
    case 'bowtie':
      if (back) break;
      ctx.fillStyle = '#5aa9e6';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.04, -s * 0.5);
        ctx.lineTo(s * 0.04 + side * s * 0.1, -s * 0.56);
        ctx.lineTo(s * 0.04 + side * s * 0.1, -s * 0.44);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'glasses':
      if (back) break;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, s * 0.02);
      for (const ex of [-0.04, 0.16]) {
        ctx.beginPath();
        ctx.arc(ex * s, -s * 0.66, s * 0.065, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

/** Pebble lying on his tummy, sliding toward `angle` (seen from above). */
export function drawGlide(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, t: number, wear: Wear[]): void {
  ctx.save();
  ctx.fillStyle = 'rgba(40, 70, 100, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.04, y + s * 0.08, s * 0.5, s * 0.24, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Feet trailing behind, flippers swept back, head in front.
  ctx.fillStyle = BEAK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-s * 0.48, side * s * 0.08, s * 0.08, s * 0.045, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2f3446';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-s * 0.08, side * s * 0.24, s * 0.22, s * 0.06, side * -0.35 + Math.sin(t * 9) * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.44, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.05, -s * 0.07, s * 0.28, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head, with eyes on top and the beak pointing ahead.
  ctx.fillStyle = '#2f3446';
  ctx.beginPath();
  ctx.arc(s * 0.36, 0, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 0.4, side * s * 0.08, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 0.415, side * s * 0.08, s * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = BEAK;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, -s * 0.04);
  ctx.lineTo(s * 0.62, 0);
  ctx.lineTo(s * 0.5, s * 0.04);
  ctx.closePath();
  ctx.fill();
  const hat = wear.find((w) => w !== 'scarf' && w !== 'bowtie' && w !== 'glasses');
  if (hat) {
    ctx.save();
    ctx.translate(s * 0.3, 0);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(0.7, 0.7);
    ctx.translate(0, s * 0.95);
    drawWear(ctx, hat, s, true);
    ctx.restore();
  }
  ctx.restore();
}

export interface Chick {
  id: string;
  name: string;
  /** What makes each one easy to tell apart. */
  wear: Wear | 'leaf' | 'none';
  line: string;
}

export const CHICKS: Chick[] = [
  { id: 'puff', name: 'Puff', wear: 'bow', line: 'Puff loves sliding races.' },
  { id: 'dot', name: 'Dot', wear: 'leaf', line: 'Dot collects shiny pebbles.' },
  { id: 'squeak', name: 'Squeak', wear: 'scarf', line: 'Squeak is the loudest peeper.' },
  { id: 'tuft', name: 'Tuft', wear: 'none', line: 'Tuft has one wild feather.' },
  { id: 'bean', name: 'Bean', wear: 'beanie', line: 'Bean is always cold. Brr!' },
  { id: 'nugget', name: 'Nugget', wear: 'flower', line: 'Nugget naps anywhere.' },
];

/** A fluffy chick standing at (x, y), about `s` tall. `glide` lays it on its tummy. */
export function drawChick(ctx: CanvasRenderingContext2D, chick: Chick, x: number, y: number, s: number, opts: { hop?: number; glide?: number; facing?: number; sad?: boolean; happy?: boolean }): void {
  const hop = opts.hop ?? 0;
  ctx.save();
  ctx.fillStyle = 'rgba(40, 70, 100, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.32, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (opts.glide !== undefined) {
    ctx.translate(x, y - s * 0.12);
    ctx.rotate(opts.glide);
    ctx.fillStyle = '#9aa0ad';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 0.26, side * s * 0.08, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = BEAK;
    ctx.beginPath();
    ctx.arc(s * 0.4, 0, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.translate(x, y - hop * s * 0.3);
  ctx.scale(opts.facing ?? 1, 1);
  ctx.fillStyle = BEAK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.1, -s * 0.02, s * 0.07, s * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fluffy round body with a pale face.
  ctx.fillStyle = '#9aa0ad';
  ctx.beginPath();
  ctx.arc(0, -s * 0.42, s * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef0f4';
  ctx.beginPath();
  ctx.ellipse(s * 0.05, -s * 0.46, s * 0.22, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (const ex of [-0.04, 0.14]) {
    ctx.beginPath();
    if (opts.happy) {
      ctx.arc(ex * s, -s * 0.5, s * 0.04, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      ctx.arc(ex * s, -s * 0.5, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = BEAK;
  ctx.beginPath();
  ctx.moveTo(s * 0.03, -s * 0.44);
  ctx.lineTo(s * 0.15, -s * 0.42);
  ctx.lineTo(s * 0.03, -s * 0.39);
  ctx.closePath();
  ctx.fill();
  if (opts.sad) {
    ctx.fillStyle = '#8fcfff';
    ctx.beginPath();
    ctx.ellipse(-s * 0.06, -s * 0.4, s * 0.025, s * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Their little thing on top.
  ctx.save();
  ctx.translate(x, y - hop * s * 0.3);
  if (chick.wear === 'leaf') {
    ctx.fillStyle = '#6dbb5a';
    ctx.beginPath();
    ctx.ellipse(s * 0.06, -s * 0.84, s * 0.12, s * 0.05, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (chick.wear === 'none') {
    ctx.strokeStyle = '#9aa0ad';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.76);
    ctx.quadraticCurveTo(s * 0.06, -s * 0.98, s * 0.16, -s * 0.94);
    ctx.stroke();
  } else {
    ctx.translate(0, s * 0.3);
    drawWear(ctx, chick.wear, s * 0.8);
  }
  ctx.restore();
}

export function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#7fb3d9';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, 0);
  ctx.lineTo(-s * 0.72, -s * 0.2);
  ctx.lineTo(-s * 0.72, s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.02, -s * 0.07, s * 0.3, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(s * 0.3, -s * 0.04, s * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPebble(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(40, 70, 100, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y + s * 0.15, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - s * 0.4, y - s * 0.3, x + s * 0.4, y + s * 0.3);
  g.addColorStop(0, '#d7e3ef');
  g.addColorStop(1, '#8fa2b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.48, s * 0.34, -0.3, 0, Math.PI * 2);
  ctx.fill();
  const tw = Math.max(0, Math.sin(t * 3 + x));
  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + tw * 0.5})`;
  const r = s * (0.12 + tw * 0.12);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y - s * 0.12 - r);
  ctx.quadraticCurveTo(x - s * 0.15, y - s * 0.12, x - s * 0.15 + r, y - s * 0.12);
  ctx.quadraticCurveTo(x - s * 0.15, y - s * 0.12, x - s * 0.15, y - s * 0.12 + r);
  ctx.quadraticCurveTo(x - s * 0.15, y - s * 0.12, x - s * 0.15 - r, y - s * 0.12);
  ctx.quadraticCurveTo(x - s * 0.15, y - s * 0.12, x - s * 0.15, y - s * 0.12 - r);
  ctx.fill();
  ctx.restore();
}

export function drawCarry(ctx: CanvasRenderingContext2D, item: Carry, x: number, y: number, s: number): void {
  ctx.save();
  if (item === 'letter') {
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = 'rgba(80, 60, 50, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(x - s * 0.5, y - s * 0.32, s, s * 0.64);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y - s * 0.32);
    ctx.lineTo(x, y + s * 0.05);
    ctx.lineTo(x + s * 0.5, y - s * 0.32);
    ctx.stroke();
    ctx.fillStyle = '#e5462c';
    ctx.beginPath();
    ctx.arc(x, y + s * 0.02, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ff8fb1';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.32, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + s * 0.3, y - s * 0.05, s * 0.12, s * 0.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - s * 0.34, y + s * 0.28, s * 0.68, s * 0.14);
  }
  ctx.restore();
}

/** Things to wear, what they cost in fish (0 = only as a gift), and where they go. */
export const WARDROBE: { id: Wear; name: string; price: number; slot: 'hat' | 'neck' }[] = [
  { id: 'beanie', name: 'Red beanie', price: 6, slot: 'hat' },
  { id: 'bowtie', name: 'Bow tie', price: 8, slot: 'neck' },
  { id: 'flower', name: 'Flower crown', price: 12, slot: 'hat' },
  { id: 'tophat', name: 'Top hat', price: 20, slot: 'hat' },
  { id: 'scarf', name: 'Cosy scarf', price: 0, slot: 'neck' },
  { id: 'bobble', name: 'Bobble hat', price: 0, slot: 'hat' },
  { id: 'earmuffs', name: 'Earmuffs', price: 0, slot: 'hat' },
];
