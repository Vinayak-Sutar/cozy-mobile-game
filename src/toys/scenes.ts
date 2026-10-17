/**
 * The pictures hiding behind the foggy window, drawn with simple canvas
 * shapes in a soft, flat storybook style. Each draws into a w x h canvas.
 */

export interface Scene {
  id: string;
  /** Shown when the picture is found. */
  name: string;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
}

type Ctx = CanvasRenderingContext2D;

function sky(ctx: Ctx, w: number, h: number, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function circle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function cloud(ctx: Ctx, x: number, y: number, s: number, color = 'rgba(255,255,255,0.95)'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - s, y, s * 0.7, 0, Math.PI * 2);
  ctx.arc(x - s * 0.2, y - s * 0.4, s * 0.9, 0, Math.PI * 2);
  ctx.arc(x + s * 0.8, y - s * 0.1, s * 0.75, 0, Math.PI * 2);
  ctx.ellipse(x, y + s * 0.2, s * 1.7, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hill(ctx: Ctx, w: number, h: number, baseY: number, amp: number, color: string, phase = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, baseY + Math.sin((x / w) * Math.PI * 2 + phase) * amp);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** Deterministic little random generator so star fields look the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function stars(ctx: Ctx, w: number, count: number, maxY: number, seed: number): void {
  const r = seeded(seed);
  ctx.fillStyle = 'rgba(255, 250, 220, 0.9)';
  for (let i = 0; i < count; i++) {
    const s = 1 + r() * 2.2;
    ctx.beginPath();
    ctx.arc(r() * w, r() * maxY, s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eye(ctx: Ctx, x: number, y: number, r: number): void {
  circle(ctx, x, y, r, '#2e2a35');
  circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.35, '#ffffff');
}

export const SCENES: Scene[] = [
  {
    id: 'cat',
    name: 'A sleepy cat!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#a9d8f5', '#fdf1dc');
      circle(ctx, w * 0.82, h * 0.14, s * 0.07, '#ffd56a');
      cloud(ctx, w * 0.25, h * 0.16, s * 0.07);
      hill(ctx, w, h, h * 0.7, h * 0.02, '#8fcf7e');
      for (let i = 0; i < 14; i++) circle(ctx, ((i * 37) % 100) / 100 * w, h * (0.78 + ((i * 53) % 18) / 100), s * 0.012, ['#ff9ec4', '#fff2a8', '#ffffff'][i % 3]);
      const cx = w * 0.5;
      const cy = h * 0.6;
      // Tail, body, head.
      ctx.strokeStyle = '#f0a253';
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.14, cy + s * 0.16);
      ctx.quadraticCurveTo(cx + s * 0.34, cy + s * 0.12, cx + s * 0.3, cy - s * 0.06);
      ctx.stroke();
      ellipse(ctx, cx, cy + s * 0.1, s * 0.17, s * 0.15, '#f0a253');
      ellipse(ctx, cx, cy + s * 0.14, s * 0.1, s * 0.08, '#fbd5a8');
      circle(ctx, cx, cy - s * 0.1, s * 0.13, '#f0a253');
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#f0a253';
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.05, cy - s * 0.2);
        ctx.lineTo(cx + side * s * 0.13, cy - s * 0.3);
        ctx.lineTo(cx + side * s * 0.13, cy - s * 0.15);
        ctx.fill();
        ctx.fillStyle = '#ffb8c6';
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.075, cy - s * 0.2);
        ctx.lineTo(cx + side * s * 0.12, cy - s * 0.26);
        ctx.lineTo(cx + side * s * 0.12, cy - s * 0.18);
        ctx.fill();
        // Sleepy closed eyes.
        ctx.strokeStyle = '#4a3328';
        ctx.lineWidth = s * 0.008;
        ctx.beginPath();
        ctx.arc(cx + side * s * 0.05, cy - s * 0.11, s * 0.025, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        for (const dy of [-0.01, 0.015]) {
          ctx.beginPath();
          ctx.moveTo(cx + side * s * 0.06, cy - s * 0.06 + dy * s);
          ctx.lineTo(cx + side * s * 0.17, cy - s * 0.07 + dy * s * 1.6);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#ff8fa8';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.015, cy - s * 0.07);
      ctx.lineTo(cx + s * 0.015, cy - s * 0.07);
      ctx.lineTo(cx, cy - s * 0.05);
      ctx.fill();
    },
  },
  {
    id: 'whale',
    name: 'A big whale!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#bfe6ff', '#fff3df');
      circle(ctx, w * 0.2, h * 0.12, s * 0.06, '#ffd56a');
      const sea = ctx.createLinearGradient(0, h * 0.45, 0, h);
      sea.addColorStop(0, '#5fb6e8');
      sea.addColorStop(1, '#2a6fb3');
      ctx.fillStyle = sea;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = s * 0.008;
      for (let i = 0; i < 6; i++) {
        const y = h * (0.52 + i * 0.08);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 10) ctx.lineTo(x, y + Math.sin(x / 22 + i) * 3);
        ctx.stroke();
      }
      const cx = w * 0.5;
      const cy = h * 0.55;
      // Tail fluke, body, belly.
      ctx.fillStyle = '#4f86cf';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.26, cy + s * 0.02);
      ctx.quadraticCurveTo(cx + s * 0.4, cy - s * 0.12, cx + s * 0.44, cy - s * 0.04);
      ctx.quadraticCurveTo(cx + s * 0.38, cy - s * 0.01, cx + s * 0.46, cy + s * 0.08);
      ctx.quadraticCurveTo(cx + s * 0.36, cy + s * 0.06, cx + s * 0.26, cy + s * 0.08);
      ctx.fill();
      ellipse(ctx, cx, cy + s * 0.04, s * 0.3, s * 0.15, '#4f86cf');
      ellipse(ctx, cx - s * 0.04, cy + s * 0.1, s * 0.2, s * 0.07, '#cfe6fb');
      eye(ctx, cx - s * 0.17, cy + s * 0.01, s * 0.018);
      ctx.strokeStyle = '#2e4f7d';
      ctx.lineWidth = s * 0.008;
      ctx.beginPath();
      ctx.arc(cx - s * 0.2, cy + s * 0.05, s * 0.04, 0.1 * Math.PI, 0.6 * Math.PI);
      ctx.stroke();
      circle(ctx, cx - s * 0.13, cy + s * 0.05, s * 0.016, 'rgba(255,150,170,0.6)');
      // Spout.
      ctx.strokeStyle = '#8fd0ff';
      ctx.lineWidth = s * 0.018;
      for (const dir of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.05, cy - s * 0.1);
        ctx.quadraticCurveTo(cx - s * 0.05 + dir * s * 0.04, cy - s * 0.25, cx - s * 0.05 + dir * s * 0.1, cy - s * 0.22);
        ctx.stroke();
      }
    },
  },
  {
    id: 'rocket',
    name: 'A rocket to the stars!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#1b1d4a', '#5a3e7e');
      stars(ctx, w, 70, h, 7);
      circle(ctx, w * 0.2, h * 0.2, s * 0.08, '#f7b26a');
      ctx.strokeStyle = 'rgba(255, 230, 190, 0.8)';
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.ellipse(w * 0.2, h * 0.2, s * 0.14, s * 0.04, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      const cx = w * 0.55;
      const cy = h * 0.52;
      // Flame, fins, body, nose, window.
      ellipse(ctx, cx, cy + s * 0.27, s * 0.06, s * 0.12, '#ffb347');
      ellipse(ctx, cx, cy + s * 0.25, s * 0.035, s * 0.08, '#fff2a0');
      ctx.fillStyle = '#e8545e';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.07, cy + s * 0.06);
        ctx.lineTo(cx + side * s * 0.16, cy + s * 0.2);
        ctx.lineTo(cx + side * s * 0.07, cy + s * 0.18);
        ctx.fill();
      }
      ctx.fillStyle = '#f6f2ee';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.28);
      ctx.quadraticCurveTo(cx + s * 0.11, cy - s * 0.1, cx + s * 0.08, cy + s * 0.18);
      ctx.lineTo(cx - s * 0.08, cy + s * 0.18);
      ctx.quadraticCurveTo(cx - s * 0.11, cy - s * 0.1, cx, cy - s * 0.28);
      ctx.fill();
      ctx.fillStyle = '#e8545e';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.28);
      ctx.quadraticCurveTo(cx + s * 0.06, cy - s * 0.2, cx + s * 0.075, cy - s * 0.14);
      ctx.lineTo(cx - s * 0.075, cy - s * 0.14);
      ctx.quadraticCurveTo(cx - s * 0.06, cy - s * 0.2, cx, cy - s * 0.28);
      ctx.fill();
      circle(ctx, cx, cy - s * 0.02, s * 0.045, '#9fb4c8');
      circle(ctx, cx, cy - s * 0.02, s * 0.034, '#6ec3f2');
      circle(ctx, cx - s * 0.012, cy - s * 0.032, s * 0.01, '#ffffff');
    },
  },
  {
    id: 'rainbow',
    name: 'A rainbow!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#9fd4f7', '#fff6e4');
      const colors = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
      const cx = w * 0.5;
      const cy = h * 0.72;
      colors.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = s * 0.045;
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.42 - i * 0.045), Math.PI, 0);
        ctx.stroke();
      });
      hill(ctx, w, h, h * 0.72, h * 0.03, '#9bd38a', 0.5);
      hill(ctx, w, h, h * 0.82, h * 0.03, '#7cc06c', 2);
      cloud(ctx, cx - s * 0.36, cy - s * 0.02, s * 0.08);
      cloud(ctx, cx + s * 0.38, cy - s * 0.02, s * 0.08);
    },
  },
  {
    id: 'snowman',
    name: 'A happy snowman!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#24305e', '#6a7fb5');
      stars(ctx, w, 50, h * 0.5, 3);
      circle(ctx, w * 0.8, h * 0.15, s * 0.07, '#fff6d6');
      circle(ctx, w * 0.8 + s * 0.025, h * 0.15 - s * 0.015, s * 0.06, '#24305e');
      hill(ctx, w, h, h * 0.7, h * 0.025, '#eef3fb', 1);
      const r = seeded(11);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(r() * w, r() * h * 0.9, 1.5 + r() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const cx = w * 0.45;
      const base = h * 0.74;
      circle(ctx, cx, base - s * 0.08, s * 0.14, '#ffffff');
      circle(ctx, cx, base - s * 0.28, s * 0.1, '#ffffff');
      circle(ctx, cx, base - s * 0.43, s * 0.075, '#ffffff');
      ctx.fillStyle = '#e8545e';
      ctx.fillRect(cx - s * 0.085, base - s * 0.38, s * 0.17, s * 0.03);
      ctx.fillRect(cx + s * 0.03, base - s * 0.38, s * 0.03, s * 0.09);
      ctx.fillStyle = '#2e2a35';
      ctx.fillRect(cx - s * 0.07, base - s * 0.52, s * 0.14, s * 0.02);
      ctx.fillRect(cx - s * 0.045, base - s * 0.6, s * 0.09, s * 0.08);
      eye(ctx, cx - s * 0.025, base - s * 0.45, s * 0.011);
      eye(ctx, cx + s * 0.025, base - s * 0.45, s * 0.011);
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(cx, base - s * 0.43);
      ctx.lineTo(cx + s * 0.07, base - s * 0.415);
      ctx.lineTo(cx, base - s * 0.405);
      ctx.fill();
      for (const y of [0.24, 0.3, 0.1]) circle(ctx, cx, base - s * y, s * 0.01, '#2e2a35');
      ctx.strokeStyle = '#7a5236';
      ctx.lineWidth = s * 0.012;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.09, base - s * 0.3);
        ctx.lineTo(cx + side * s * 0.22, base - s * 0.38);
        ctx.stroke();
      }
    },
  },
  {
    id: 'owl',
    name: 'A little owl!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#4b3a78', '#f2a97a');
      circle(ctx, w * 0.22, h * 0.16, s * 0.08, '#fff1c8');
      stars(ctx, w, 25, h * 0.4, 5);
      ctx.strokeStyle = '#6b4a33';
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, h * 0.66);
      ctx.quadraticCurveTo(w * 0.5, h * 0.6, w + 10, h * 0.7);
      ctx.stroke();
      for (const x of [0.15, 0.82]) ellipse(ctx, w * x, h * 0.62, s * 0.05, s * 0.025, '#6fae66', -0.4);
      const cx = w * 0.5;
      const cy = h * 0.5;
      ellipse(ctx, cx, cy, s * 0.15, s * 0.19, '#a0704a');
      ellipse(ctx, cx, cy + s * 0.05, s * 0.1, s * 0.12, '#e8cfae');
      ctx.strokeStyle = '#b89470';
      ctx.lineWidth = s * 0.008;
      for (let i = 0; i < 3; i++) {
        for (const dx of [-0.04, 0, 0.04]) {
          ctx.beginPath();
          ctx.arc(cx + dx * s, cy + s * (0.02 + i * 0.045), s * 0.018, 0.2 * Math.PI, 0.8 * Math.PI);
          ctx.stroke();
        }
      }
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#a0704a';
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.06, cy - s * 0.15);
        ctx.lineTo(cx + side * s * 0.13, cy - s * 0.24);
        ctx.lineTo(cx + side * s * 0.14, cy - s * 0.11);
        ctx.fill();
        circle(ctx, cx + side * s * 0.065, cy - s * 0.08, s * 0.055, '#ffffff');
        circle(ctx, cx + side * s * 0.065, cy - s * 0.08, s * 0.04, '#ffcf4a');
        eye(ctx, cx + side * s * 0.065, cy - s * 0.08, s * 0.024);
      }
      ctx.fillStyle = '#f29a3a';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.02, cy - s * 0.04);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.04);
      ctx.lineTo(cx, cy - s * 0.005);
      ctx.fill();
      for (const side of [-1, 1]) ellipse(ctx, cx + side * s * 0.04, cy + s * 0.19, s * 0.025, s * 0.012, '#f29a3a');
    },
  },
  {
    id: 'balloon',
    name: 'A hot-air balloon!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#8ccff5', '#fff2dc');
      cloud(ctx, w * 0.2, h * 0.25, s * 0.07);
      cloud(ctx, w * 0.82, h * 0.6, s * 0.08);
      hill(ctx, w, h, h * 0.86, h * 0.02, '#9bd38a');
      const cx = w * 0.5;
      const cy = h * 0.38;
      const r = s * 0.2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(cx + r * 0.3, cy + r * 1.25);
      ctx.lineTo(cx - r * 0.3, cy + r * 1.25);
      ctx.closePath();
      ctx.clip();
      const stripes = ['#ff6b6b', '#ffd43b', '#4dabf7', '#ff6b6b', '#ffd43b', '#4dabf7'];
      stripes.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(cx - r + (i * 2 * r) / stripes.length, cy - r, (2 * r) / stripes.length + 1, r * 2.4);
      });
      ctx.restore();
      ctx.strokeStyle = '#7a5236';
      ctx.lineWidth = s * 0.006;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.3, cy + r * 1.25);
        ctx.lineTo(cx + side * r * 0.25, cy + r * 1.55);
        ctx.stroke();
      }
      ctx.fillStyle = '#b5844a';
      ctx.fillRect(cx - r * 0.3, cy + r * 1.55, r * 0.6, r * 0.35);
      ctx.fillStyle = '#9a6d3a';
      ctx.fillRect(cx - r * 0.33, cy + r * 1.52, r * 0.66, r * 0.07);
    },
  },
  {
    id: 'duck',
    name: 'A little duck!',
    draw(ctx, w, h) {
      const s = Math.min(w, h);
      sky(ctx, w, h, '#b6e3f7', '#fff6e2');
      for (let i = 0; i < 9; i++) circle(ctx, (i / 8) * w, h * 0.5, s * (0.07 + (i % 3) * 0.02), i % 2 ? '#7fbf72' : '#6aae62');
      ctx.fillStyle = '#9fd68e';
      ctx.fillRect(0, h * 0.52, w, h * 0.48);
      ellipse(ctx, w * 0.5, h * 0.72, w * 0.46, h * 0.16, '#6cc0e8');
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = s * 0.006;
      for (const [x, y] of [
        [0.3, 0.7],
        [0.68, 0.78],
        [0.5, 0.84],
      ]) {
        ctx.beginPath();
        ctx.ellipse(w * x, h * y, s * 0.05, s * 0.012, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ellipse(ctx, w * 0.22, h * 0.78, s * 0.05, s * 0.018, '#4f9a5a');
      ctx.strokeStyle = '#4f8f4a';
      ctx.lineWidth = s * 0.01;
      for (const x of [0.86, 0.9, 0.12]) {
        ctx.beginPath();
        ctx.moveTo(w * x, h * 0.74);
        ctx.lineTo(w * x + s * 0.01, h * 0.58);
        ctx.stroke();
        ellipse(ctx, w * x + s * 0.01, h * 0.6, s * 0.01, s * 0.03, '#8a5a3a');
      }
      const cx = w * 0.5;
      const cy = h * 0.68;
      ellipse(ctx, cx, cy, s * 0.13, s * 0.08, '#ffd84a');
      ellipse(ctx, cx + s * 0.02, cy - s * 0.01, s * 0.06, s * 0.035, '#ffc93a', -0.3);
      circle(ctx, cx - s * 0.1, cy - s * 0.1, s * 0.065, '#ffd84a');
      eye(ctx, cx - s * 0.115, cy - s * 0.115, s * 0.012);
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.17, cy - s * 0.09, s * 0.035, s * 0.015, 0.1, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, cx - s * 0.085, cy - s * 0.085, s * 0.012, 'rgba(255,140,160,0.55)');
    },
  },
];

/** A small picture of a scene, for the picture book. */
export function sceneThumbnail(scene: Scene, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    scene.draw(ctx, w, h);
  }
  return canvas;
}
