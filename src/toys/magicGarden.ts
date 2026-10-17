import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { clamp, hex, rand, scale } from '../util/color';
import displaySource from './shaders/garden.frag?raw';
import { Toy } from './Toy';

// Cool bioluminescent tones; warm colours turn muddy on blue water.
const GLOWS: RGB[] = ['#3fffd2', '#5ad8ff', '#7dffa8', '#a98bff'].map(hex);

const FLOWERS = [
  { petal: '#f7a8c4', heart: '#fff0f6' },
  { petal: '#c9b6ff', heart: '#f6f1ff' },
  { petal: '#fdfbff', heart: '#fff6dc' },
  { petal: '#ffc9a8', heart: '#fff4ea' },
];

const MAX_PADS = 10;
const PAD_LIFETIME = 75;

interface Pad {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  spin: number;
  born: number;
  bloomAt: number;
  chimed: boolean;
  dying: number;
  wiggle: number;
  petals: number;
  flower: (typeof FLOWERS)[number];
  seed: number;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  phase: number;
  blink: number;
  orbit: number;
  orbitAngle: number;
  orbitSpeed: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  born: number;
  max: number;
}

const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);

/** A pond at night: touch the water, lift your finger, and a flower blooms. */
export class MagicGarden extends Toy {
  readonly id = 'pond' as const;
  override readonly usesOverlay = true;
  override readonly ghostColor = 'rgba(220, 255, 240, 0.85)';

  readonly simConfig: SimConfig = {
    curl: 10,
    velocityDissipation: 0.5,
    densityDissipation: 0.8,
    pressure: 0.8,
    splatRadius: 0.12,
    splatForce: 3500,
  };

  readonly sound: SoundTheme = {
    // C major pentatonic, up high, on a kalimba.
    scale: [72, 74, 76, 79, 81, 84, 86, 88, 91],
    voice: 'kalimba',
    bed: 'night',
    swish: { type: 'lowpass', low: 280, high: 1100, q: 1, gain: 0.06 },
  };

  private display: Program | null = null;
  private pads: Pad[] = [];
  private fireflies: Firefly[] = [];
  private rings: Ring[] = [];
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private fireflySprite: HTMLCanvasElement | null = null;
  private bloomSprite: HTMLCanvasElement | null = null;
  private readonly moon: [number, number] = [0.72, 0.8];

  strokeColor(pointer: Pointer): RGB {
    return scale(GLOWS[pointer.stroke % GLOWS.length], 0.05);
  }

  override pointerDown(pointer: Pointer): void {
    this.fingers.set(pointer.id, { x: pointer.x, y: pointer.y });
    this.addRing(pointer.x, pointer.y, 0.16);
    const [u, v] = this.uv(pointer.x, pointer.y);
    this.drop(u, v, this.strokeColor(pointer), 0.5);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    super.pointerMove(pointer, x0, y0, dt);
    this.fingers.set(pointer.id, { x: pointer.x, y: pointer.y });
    // Fingers gently shove lily pads they pass by.
    const vx = (pointer.x - x0) / dt;
    const vy = (pointer.y - y0) / dt;
    for (const pad of this.pads) {
      const d = Math.hypot(pad.x - pointer.x, pad.y - pointer.y);
      if (d < pad.r + 28) {
        const k = 0.18 * (1 - d / (pad.r + 28));
        pad.vx += vx * k;
        pad.vy += vy * k;
        pad.spin += (Math.random() - 0.5) * 0.6;
      }
    }
  }

  override pointerUp(pointer: Pointer): void {
    this.fingers.delete(pointer.id);
    this.plant(pointer.x, pointer.y);
  }

  override intro(): void {
    const { width, height } = this.env.view;
    for (let i = 0; i < 2; i++) {
      const pad = this.spawnPad(rand(0.25, 0.75) * width, rand(0.3, 0.75) * height);
      pad.born = -2;
      pad.bloomAt = -1.5;
      pad.chimed = true;
    }
  }

  override ambient(): void {
    // A raindrop, or a fish kissing the surface.
    const { width, height } = this.env.view;
    const x = rand(0.1, 0.9) * width;
    const y = rand(0.15, 0.9) * height;
    this.addRing(x, y, 0.1);
    const [u, v] = this.uv(x, y);
    this.drop(u, v, scale(GLOWS[Math.floor(rand(0, GLOWS.length))], 0.03), 0.25);
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.pads = [];
    this.rings = [];
    this.fingers.clear();
    this.fireflySprite ??= glowSprite('232, 255, 158');
    this.bloomSprite ??= glowSprite('255, 214, 236');
    this.spawnFireflies();
  }

  override exit(): void {
    this.fingers.clear();
  }

  override onQualityChange(): void {
    this.spawnFireflies();
  }

  override update(dt: number): void {
    super.update(dt);
    const t = this.time;
    const { width, height } = this.env.view;

    for (const pad of this.pads) {
      pad.x += pad.vx * dt;
      pad.y += pad.vy * dt;
      const damping = Math.exp(-1.1 * dt);
      pad.vx = pad.vx * damping + Math.sin(t * 0.21 + pad.seed) * 3 * dt;
      pad.vy = pad.vy * damping + Math.cos(t * 0.17 + pad.seed * 1.3) * 3 * dt;
      pad.rot += pad.spin * dt;
      pad.spin *= Math.exp(-0.8 * dt);
      pad.wiggle *= Math.exp(-3 * dt);
      // Soft walls so pads drift back into view.
      const m = pad.r * 0.6;
      if (pad.x < m) pad.vx += (m - pad.x) * 3 * dt;
      if (pad.x > width - m) pad.vx -= (pad.x - width + m) * 3 * dt;
      if (pad.y < m) pad.vy += (m - pad.y) * 3 * dt;
      if (pad.y > height - m) pad.vy -= (pad.y - height + m) * 3 * dt;
      if (pad.dying < 0 && t - pad.born > PAD_LIFETIME) pad.dying = t;
      if (!pad.chimed && t >= pad.bloomAt) {
        pad.chimed = true;
        this.env.audio.chime(pad.x / width, 1 - pad.y / height);
        this.env.haptics.tap(0.4);
      }
    }
    // Pads nudge each other apart instead of overlapping.
    for (let i = 0; i < this.pads.length; i++) {
      for (let j = i + 1; j < this.pads.length; j++) {
        const a = this.pads[i];
        const b = this.pads[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const overlap = a.r + b.r - d;
        if (overlap > 0) {
          const push = (overlap / d) * 2.5 * dt * 60;
          a.vx -= dx * push * 0.5;
          a.vy -= dy * push * 0.5;
          b.vx += dx * push * 0.5;
          b.vy += dy * push * 0.5;
        }
      }
    }
    this.pads = this.pads.filter((pad) => pad.dying < 0 || t - pad.dying < 1.4);
    this.rings = this.rings.filter((ring) => t - ring.born < 1.8);
    this.updateFireflies(dt, width, height);
  }

  render(): void {
    const { gpu, sim } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display) return;
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uVelocity'), sim.velocity.read.attach(1));
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform2f(display.u('uMoon'), this.moon[0], this.moon[1]);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const t = this.time;
    for (const ring of this.rings) {
      const age = (t - ring.born) / 1.8;
      for (const delay of [0, 0.18]) {
        const a = clamp(age - delay, 0, 1);
        if (a <= 0) continue;
        ctx.strokeStyle = `rgba(190, 240, 255, ${0.32 * (1 - a)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.max * easeOut(a), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const pad of this.pads) this.drawPad(ctx, pad, t);
    this.drawFireflies(ctx);
  }

  /** Lifting a finger plants a lily pad, or makes a nearby flower dance. */
  private plant(x: number, y: number): void {
    const near = this.pads.find((pad) => pad.dying < 0 && Math.hypot(pad.x - x, pad.y - y) < pad.r * 1.1);
    if (near) {
      near.wiggle = 1;
      near.spin += rand(-1.5, 1.5);
      const { width, height } = this.env.view;
      this.env.audio.chime(near.x / width, 1 - near.y / height);
      return;
    }
    const alive = this.pads.filter((pad) => pad.dying < 0);
    if (alive.length >= MAX_PADS) alive[0].dying = this.time;
    this.spawnPad(x, y);
    this.addRing(x, y, 0.22);
  }

  private spawnPad(x: number, y: number): Pad {
    const minDim = Math.min(this.env.view.width, this.env.view.height);
    const pad: Pad = {
      x,
      y,
      vx: 0,
      vy: 0,
      r: minDim * rand(0.07, 0.095),
      rot: rand(0, Math.PI * 2),
      spin: rand(-0.3, 0.3),
      born: this.time,
      bloomAt: this.time + 0.35,
      chimed: false,
      dying: -1,
      wiggle: 0,
      petals: Math.random() < 0.5 ? 7 : 8,
      flower: FLOWERS[Math.floor(rand(0, FLOWERS.length))],
      seed: rand(0, 100),
    };
    this.pads.push(pad);
    return pad;
  }

  private addRing(x: number, y: number, size: number): void {
    const minDim = Math.min(this.env.view.width, this.env.view.height);
    this.rings.push({ x, y, born: this.time, max: minDim * size });
  }

  private drawPad(ctx: CanvasRenderingContext2D, pad: Pad, t: number): void {
    const grow = easeOutBack(clamp((t - pad.born) / 0.6, 0, 1));
    const fade = pad.dying >= 0 ? 1 - clamp((t - pad.dying) / 1.2, 0, 1) : 1;
    const r = pad.r * grow;
    if (r <= 0.5 || fade <= 0) return;

    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(pad.rot + Math.sin(t * 9) * 0.12 * pad.wiggle);
    ctx.globalAlpha = fade;

    // Shadow on the water, then the leaf with its little notch.
    ctx.fillStyle = 'rgba(0, 8, 14, 0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 4, r, r, 0, 0, Math.PI * 2);
    ctx.fill();

    const leaf = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    leaf.addColorStop(0, '#3a8467');
    leaf.addColorStop(1, '#1a4a3d');
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, 0.24, Math.PI * 2 - 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(170, 255, 220, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(170, 255, 220, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = 0.55 + i * 0.8;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
    }
    ctx.stroke();

    const open = easeOutBack(clamp((t - pad.bloomAt) / 1.1, 0, 1));
    if (open > 0) this.drawFlower(ctx, pad, open, r);
    ctx.restore();
  }

  private drawFlower(ctx: CanvasRenderingContext2D, pad: Pad, open: number, r: number): void {
    const petal = r * 0.62 * (0.35 + 0.65 * open);
    if (this.bloomSprite) {
      const s = r * 3.2 * open;
      ctx.globalCompositeOperation = 'lighter';
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * 0.32;
      ctx.drawImage(this.bloomSprite, -s / 2, -s / 2, s, s);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'source-over';
    }

    const fill = ctx.createRadialGradient(0, 0, petal * 0.1, 0, 0, petal * 1.1);
    fill.addColorStop(0, pad.flower.heart);
    fill.addColorStop(1, pad.flower.petal);
    ctx.fillStyle = fill;
    for (const layer of [
      { n: pad.petals, reach: 1, width: 0.42, offset: 0 },
      { n: pad.petals - 2, reach: 0.68, width: 0.38, offset: 0.5 },
    ]) {
      for (let i = 0; i < layer.n; i++) {
        const a = ((i + layer.offset) / layer.n) * Math.PI * 2 + pad.wiggle * Math.sin(this.time * 12 + i) * 0.15;
        const len = petal * layer.reach;
        const d = len * 0.5 * open;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, -d, len * layer.width * Math.max(0.3, open), len * 0.5 * (0.6 + 0.4 * open), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath();
    ctx.arc(0, 0, petal * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  private spawnFireflies(): void {
    const { width, height } = this.env.view;
    const count = this.env.quality.settings.particles;
    this.fireflies = Array.from({ length: count }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      vx: 0,
      vy: 0,
      heading: rand(0, Math.PI * 2),
      phase: rand(0, Math.PI * 2),
      blink: rand(1.2, 2.6),
      orbit: rand(24, 90),
      orbitAngle: rand(0, Math.PI * 2),
      orbitSpeed: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
      size: rand(14, 24),
    }));
  }

  private updateFireflies(dt: number, width: number, height: number): void {
    const fingers = [...this.fingers.values()];
    for (const f of this.fireflies) {
      f.phase += dt * f.blink;
      let dx: number;
      let dy: number;
      if (fingers.length > 0) {
        // Gather around the nearest finger in a lazy orbit.
        let target = fingers[0];
        let best = Infinity;
        for (const finger of fingers) {
          const d = (finger.x - f.x) ** 2 + (finger.y - f.y) ** 2;
          if (d < best) {
            best = d;
            target = finger;
          }
        }
        f.orbitAngle += dt * f.orbitSpeed;
        const tx = target.x + Math.cos(f.orbitAngle) * f.orbit;
        const ty = target.y + Math.sin(f.orbitAngle) * f.orbit;
        dx = (tx - f.x) * 1.6;
        dy = (ty - f.y) * 1.6;
        const speed = Math.hypot(dx, dy);
        const max = 230;
        if (speed > max) {
          dx = (dx / speed) * max;
          dy = (dy / speed) * max;
        }
      } else {
        f.heading += rand(-1, 1) * dt * 1.6;
        dx = Math.cos(f.heading) * 20;
        dy = Math.sin(f.heading) * 20;
        // Drift back toward the middle when near the edges.
        dx += (width / 2 - f.x) * 0.02;
        dy += (height / 2 - f.y) * 0.02;
      }
      const k = Math.min(1, dt * 1.8);
      f.vx += (dx - f.vx) * k;
      f.vy += (dy - f.vy) * k;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  private drawFireflies(ctx: CanvasRenderingContext2D): void {
    const sprite = this.fireflySprite;
    if (!sprite) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fireflies) {
      const glow = Math.pow(Math.max(0, Math.sin(f.phase)), 2);
      const alpha = 0.18 + 0.82 * glow;
      const s = f.size * (0.75 + 0.5 * glow);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, f.x - s / 2, f.y - s / 2, s, s);
      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.fillStyle = '#f6ffd8';
      ctx.fillRect(f.x - 1, f.y - 1, 2, 2);
    }
    ctx.restore();
  }
}

/** A soft round glow, pre-rendered once and stamped many times. */
function glowSprite(rgb: string): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb}, 1)`);
  g.addColorStop(0.25, `rgba(${rgb}, 0.55)`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
