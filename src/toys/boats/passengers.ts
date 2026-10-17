/**
 * Who rides the paper boats. Drawn with canvas shapes, in the same soft
 * style as Pip.
 */

type Ears = 'none' | 'round' | 'long' | 'pointy' | 'big';
type Face = 'beak' | 'nose' | 'frog' | 'muzzle';

export interface Passenger {
  id: string;
  name: string;
  body: string;
  /** Muzzle, face mask or ear-inside colour. */
  accent: string;
  ears: Ears;
  face: Face;
}

export const PASSENGERS: Passenger[] = [
  { id: 'frog', name: 'Frog', body: '#7cc76a', accent: '#bfe8a8', ears: 'none', face: 'frog' },
  { id: 'duckling', name: 'Duckling', body: '#ffd85a', accent: '#f39a3c', ears: 'none', face: 'beak' },
  { id: 'bunny', name: 'Bunny', body: '#f4f0ea', accent: '#f6b4c4', ears: 'long', face: 'nose' },
  { id: 'kitten', name: 'Kitten', body: '#f3a45c', accent: '#ffd9b8', ears: 'pointy', face: 'nose' },
  { id: 'mouse', name: 'Mouse', body: '#bdb7c4', accent: '#f6b4c4', ears: 'big', face: 'nose' },
  { id: 'bear', name: 'Bear cub', body: '#b07a4f', accent: '#e8c9a0', ears: 'round', face: 'muzzle' },
  { id: 'penguin', name: 'Penguin', body: '#3e4660', accent: '#fbfbfb', ears: 'none', face: 'beak' },
  { id: 'fox', name: 'Fox', body: '#ef8a3d', accent: '#fff4e6', ears: 'pointy', face: 'muzzle' },
];

const INK = '#3b3346';

export interface CritterMood {
  happy?: boolean;
  blink?: boolean;
  /** Where the eyes look, in radians (screen space). */
  look?: number;
}

/** A passenger's head (radius r, centred on x, y), with a little body below it when `body` is true. */
export function drawCritter(
  ctx: CanvasRenderingContext2D,
  p: Passenger,
  x: number,
  y: number,
  r: number,
  mood: CritterMood = {},
  body = false,
): void {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.strokeStyle = 'rgba(60, 45, 40, 0.28)';

  if (body) {
    ctx.fillStyle = p.body;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.05, r * 0.78, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.id === 'penguin' ? p.accent : 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.15, r * 0.45, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ears go behind the head.
  ctx.fillStyle = p.body;
  const ear = (dx: number, dy: number, rx: number, ry: number, rot: number, inner: boolean): void => {
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = p.body;
    ctx.fill();
    ctx.stroke();
    if (inner) {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy + ry * 0.1, rx * 0.5, ry * 0.65, rot, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const side of [-1, 1]) {
    if (p.ears === 'long') ear(side * r * 0.42, -r * 1.25, r * 0.24, r * 0.7, side * 0.15, true);
    else if (p.ears === 'big') ear(side * r * 0.78, -r * 0.62, r * 0.48, r * 0.48, 0, true);
    else if (p.ears === 'round') ear(side * r * 0.7, -r * 0.7, r * 0.3, r * 0.3, 0, true);
    else if (p.ears === 'pointy') {
      ctx.fillStyle = p.body;
      ctx.beginPath();
      ctx.moveTo(x + side * r * 0.25, y - r * 0.85);
      ctx.lineTo(x + side * r * 0.82, y - r * 1.25);
      ctx.lineTo(x + side * r * 0.85, y - r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.id === 'fox' ? '#4a3328' : '#ffc2b0';
      ctx.beginPath();
      ctx.moveTo(x + side * r * 0.55, y - r * 0.95);
      ctx.lineTo(x + side * r * 0.8, y - r * 1.17);
      ctx.lineTo(x + side * r * 0.78, y - r * 0.75);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (p.face === 'frog') {
    // Frog eyes sit on top of the head.
    for (const side of [-1, 1]) {
      ctx.fillStyle = p.body;
      ctx.beginPath();
      ctx.arc(x + side * r * 0.48, y - r * 0.72, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Head.
  ctx.fillStyle = p.body;
  ctx.beginPath();
  if (p.face === 'frog') ctx.ellipse(x, y, r * 1.12, r * 0.88, 0, 0, Math.PI * 2);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.id === 'penguin') {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y + r * 0.08, r * 0.42, r * 0.55, 0.2, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.3, y + r * 0.08, r * 0.42, r * 0.55, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.face === 'muzzle') {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.38, r * 0.48, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.id === 'duckling') {
    // A little tuft.
    ctx.strokeStyle = p.body;
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.9);
    ctx.quadraticCurveTo(x + r * 0.1, y - r * 1.3, x + r * 0.3, y - r * 1.2);
    ctx.stroke();
  }
  // A soft shine.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eyes.
  const look = mood.look ?? Math.PI / 2;
  const lx = Math.cos(look) * r * 0.05;
  const ly = Math.sin(look) * r * 0.05;
  const eyeY = p.face === 'frog' ? y - r * 0.72 : y - r * 0.1;
  const eyeX = p.face === 'frog' ? r * 0.48 : r * 0.36;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = x + side * eyeX;
    ctx.beginPath();
    if (mood.happy) {
      ctx.arc(ex, eyeY + r * 0.05, r * 0.13, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (mood.blink) {
      ctx.moveTo(ex - r * 0.11, eyeY);
      ctx.lineTo(ex + r * 0.11, eyeY);
      ctx.stroke();
    } else {
      ctx.arc(ex + lx, eyeY + ly, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + lx - r * 0.04, eyeY + ly - r * 0.04, r * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
    }
  }

  // Cheeks.
  ctx.fillStyle = 'rgba(255, 130, 150, 0.45)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * r * 0.62, y + r * 0.22, r * 0.15, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beak, nose or smile.
  if (p.face === 'beak') {
    ctx.fillStyle = p.id === 'penguin' ? '#f39a3c' : p.accent;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.22, r * 0.3, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 60, 20, 0.5)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.24, y + r * 0.22);
    ctx.lineTo(x + r * 0.24, y + r * 0.22);
    ctx.stroke();
  } else {
    if (p.face !== 'frog') {
      ctx.fillStyle = p.face === 'muzzle' ? INK : p.accent;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.2, r * 0.11, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.beginPath();
    const mouthY = p.face === 'frog' ? y + r * 0.2 : y + r * 0.32;
    const w = p.face === 'frog' ? r * 0.45 : r * 0.16;
    ctx.moveTo(x - w, mouthY);
    ctx.quadraticCurveTo(x, mouthY + (mood.happy ? r * 0.3 : r * 0.14), x + w, mouthY);
    ctx.stroke();
    if (p.id === 'kitten' || p.id === 'mouse') {
      ctx.strokeStyle = 'rgba(60, 50, 60, 0.45)';
      ctx.lineWidth = Math.max(1, r * 0.04);
      for (const side of [-1, 1]) {
        for (const tilt of [-0.12, 0.12]) {
          ctx.beginPath();
          ctx.moveTo(x + side * r * 0.3, y + r * 0.25);
          ctx.lineTo(x + side * r * 0.95, y + r * (0.2 + tilt));
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/** A passenger's face for the boat log. */
export function passengerThumbnail(p: Passenger, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#d7eef2';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 10);
  ctx.fill();
  drawCritter(ctx, p, size / 2, size * 0.56, size * 0.26, { happy: true });
  return canvas;
}
