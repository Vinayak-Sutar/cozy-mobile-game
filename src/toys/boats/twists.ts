import { rand } from '../../util/color';
import { type MapDef, riverFlow, waterDistance, type WaterScene, type Whirlpool } from './maps';

/**
 * What makes each map play differently. Positions are world pixels (y down),
 * speeds pixels per second; `unit` is pixels per map unit.
 */

const TAU = Math.PI * 2;

// ---------- Windy Bay: gusts ----------

type GustPhase = 'calm' | 'rising' | 'blowing' | 'fading';

interface Streak {
  x: number;
  y: number;
  age: number;
  life: number;
  len: number;
  wobble: number;
}

/** Every few seconds a gust blows from a new direction; you can see it coming in the streaks. */
export class Gusts {
  dirX = 1;
  dirY = 0;
  /** 0..1: how hard it's blowing right now. */
  strength = 0;
  private phase: GustPhase = 'calm';
  private timer = 3.5;
  private streaks: Streak[] = [];

  update(dt: number, width: number, height: number): void {
    this.timer -= dt;
    if (this.phase === 'calm' && this.timer <= 0) {
      const a = rand(0, TAU);
      this.dirX = Math.cos(a);
      this.dirY = Math.sin(a);
      this.phase = 'rising';
      this.timer = 1.2;
    } else if (this.phase === 'rising') {
      this.strength = Math.min(1, this.strength + dt / 1.2);
      if (this.timer <= 0) {
        this.phase = 'blowing';
        this.timer = 2.4;
      }
    } else if (this.phase === 'blowing' && this.timer <= 0) {
      this.phase = 'fading';
      this.timer = 1;
    } else if (this.phase === 'fading') {
      this.strength = Math.max(0, this.strength - dt);
      if (this.timer <= 0) {
        this.phase = 'calm';
        this.strength = 0;
        this.timer = rand(4.5, 7);
      }
    }

    // Streaks of air, in screen space.
    const minDim = Math.min(width, height);
    const spawn = this.strength * 40 * dt;
    for (let i = 0; i < Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0); i++) {
      this.streaks.push({ x: rand(-0.1, 1.1) * width, y: rand(-0.1, 1.1) * height, age: 0, life: rand(0.6, 1.1), len: minDim * rand(0.08, 0.16), wobble: rand(0, TAU) });
    }
    const speed = minDim * (0.6 + this.strength);
    for (const s of this.streaks) {
      s.age += dt;
      s.x += this.dirX * speed * dt;
      s.y += this.dirY * speed * dt;
    }
    this.streaks = this.streaks.filter((s) => s.age < s.life);
  }

  get blowing(): boolean {
    return this.phase === 'blowing' || this.phase === 'rising';
  }

  drawScreen(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    const nx = -this.dirY;
    const ny = this.dirX;
    for (const s of this.streaks) {
      const k = s.age / s.life;
      ctx.globalAlpha = Math.sin(Math.PI * k) * 0.75;
      const curl = Math.sin(t * 6 + s.wobble) * s.len * 0.12;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(
        s.x - this.dirX * s.len * 0.5 + nx * curl,
        s.y - this.dirY * s.len * 0.5 + ny * curl,
        s.x - this.dirX * s.len,
        s.y - this.dirY * s.len,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- Frozen Lake: ice floes ----------

interface Floe {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  shape: number[];
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Ice floes drift with the water you stir; they bump the boat, each other and the shore. */
export class Floes {
  floes: Floe[] = [];

  constructor(
    private readonly map: MapDef,
    private unit: number,
    count: number,
    avoid: [number, number][],
  ) {
    const [w, h] = map.size;
    for (let tries = 0; tries < 400 && this.floes.length < count; tries++) {
      const r = rand(0.07, 0.13);
      const x = rand(0, w);
      const y = rand(0, h);
      if (waterDistance(map, x, y) > -(r + 0.04)) continue;
      if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < r + 0.22)) continue;
      if (this.floes.some((f) => Math.hypot(f.x / unit - x, f.y / unit - y) < f.r / unit + r + 0.05)) continue;
      const sides = 7 + Math.floor(rand(0, 3));
      this.floes.push({
        x: x * unit,
        y: y * unit,
        vx: 0,
        vy: 0,
        r: r * unit,
        angle: rand(0, TAU),
        spin: rand(-0.15, 0.15),
        shape: Array.from({ length: sides }, () => rand(0.82, 1.12)),
      });
    }
  }

  rescale(k: number): void {
    this.unit *= k;
    for (const f of this.floes) {
      f.x *= k;
      f.y *= k;
      f.vx *= k;
      f.vy *= k;
      f.r *= k;
    }
  }

  /** `water(x, y, out)` gives the current under a point, in px/s. */
  update(dt: number, water: (x: number, y: number, out: [number, number]) => void): void {
    const at: [number, number] = [0, 0];
    const k = 1 - Math.exp(-dt * 1.6);
    for (const f of this.floes) {
      water(f.x, f.y, at);
      f.vx += (at[0] - f.vx) * k;
      f.vy += (at[1] - f.vy) * k;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.angle += (f.spin + f.vx * 0.002) * dt;
      keepInWater(this.map, this.unit, f, 0.3);
    }
    // Floes nudge each other apart.
    for (let i = 0; i < this.floes.length; i++) {
      for (let j = i + 1; j < this.floes.length; j++) collide(this.floes[i], this.floes[j], 1, 1);
    }
  }

  /** Pushes the boat and floes apart. Returns how hard they met (px/s), for a bump sound. */
  collideBoat(boat: Body): number {
    let hit = 0;
    for (const f of this.floes) hit = Math.max(hit, collide(boat, f, 1, 1.6 * (f.r / (this.unit * 0.1)) ** 2));
    return hit;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const f of this.floes) {
      const outline = (dx: number, dy: number, scale: number): void => {
        ctx.beginPath();
        f.shape.forEach((m, i) => {
          const a = f.angle + (i / f.shape.length) * TAU;
          const px = f.x + dx + Math.cos(a) * f.r * m * scale;
          const py = f.y + dy + Math.sin(a) * f.r * m * scale;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(30, 60, 90, 0.22)';
      outline(3, 5, 1);
      ctx.fill();
      ctx.fillStyle = '#cfe6f3';
      outline(0, 2, 1);
      ctx.fill();
      ctx.fillStyle = '#f4fbff';
      outline(0, 0, 0.94);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      outline(-f.r * 0.12, -f.r * 0.14, 0.55);
      ctx.fill();
    }
  }
}

/** Separates two round bodies and trades momentum (masses ma, mb). Returns the closing speed. */
function collide(a: Body, b: Body, ma: number, mb: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min || d === 0) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = min - d;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return 0;
  const impulse = (1.3 * closing) / total;
  a.vx -= impulse * mb * nx;
  a.vy -= impulse * mb * ny;
  b.vx += impulse * ma * nx;
  b.vy += impulse * ma * ny;
  return closing;
}

/**
 * Keeps a round body in the water: if it overlaps the shore, slide it back out
 * and bounce (keeping `bounce` of the speed). Returns the speed it hit with.
 */
export function keepInWater(map: WaterScene, unit: number, b: Body, bounce: number): number {
  const [w, h] = map.size;
  const r = b.r / unit;
  let x = b.x / unit;
  let y = b.y / unit;
  let hit = 0;
  const d = waterDistance(map, x, y);
  if (d > -r) {
    const e = 0.01;
    let gx = waterDistance(map, x + e, y) - waterDistance(map, x - e, y);
    let gy = waterDistance(map, x, y + e) - waterDistance(map, x, y - e);
    const len = Math.hypot(gx, gy) || 1;
    gx /= len;
    gy /= len;
    const push = d + r;
    x -= gx * push;
    y -= gy * push;
    const vn = b.vx * gx + b.vy * gy;
    if (vn > 0) {
      hit = vn;
      b.vx -= (1 + bounce) * vn * gx;
      b.vy -= (1 + bounce) * vn * gy;
    }
  }
  // The edges of the map are shore too.
  if (x < r) [x, b.vx] = [r, Math.abs(b.vx) * bounce];
  if (x > w - r) [x, b.vx] = [w - r, -Math.abs(b.vx) * bounce];
  if (y < r) [y, b.vy] = [r, Math.abs(b.vy) * bounce];
  if (y > h - r) [y, b.vy] = [h - r, -Math.abs(b.vy) * bounce];
  b.x = x * unit;
  b.y = y * unit;
  return hit;
}

// ---------- Moonlit Lagoon: whirlpools ----------

const SPIN_SPEED = 0.42;

/** The swirl of all whirlpools at a point (units per second), added into `out`. */
export function whirlCurrent(pools: Whirlpool[], x: number, y: number, out: [number, number]): void {
  for (const p of pools) {
    const dx = x - p.x;
    const dy = y - p.y;
    const r = Math.hypot(dx, dy);
    if (r > p.r * 2 || r < 1e-4) continue;
    // Fastest around the rim, calm in the very middle, fading out beyond it.
    const k = r / p.r;
    const f = k * Math.exp(1 - k) * (r > p.r * 1.5 ? (2 - k) * 2 : 1);
    out[0] += (-dy / r) * p.spin * SPIN_SPEED * f - (dx / r) * 0.07 * f;
    out[1] += (dx / r) * p.spin * SPIN_SPEED * f - (dy / r) * 0.07 * f;
  }
}

export function drawWhirlpools(ctx: CanvasRenderingContext2D, pools: Whirlpool[], unit: number, t: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of pools) {
    const cx = p.x * unit;
    const cy = p.y * unit;
    const R = p.r * unit;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
    g.addColorStop(0, 'rgba(0, 4, 14, 0.55)');
    g.addColorStop(1, 'rgba(0, 4, 14, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.6, 0, TAU);
    ctx.fill();
    for (let arm = 0; arm < 3; arm++) {
      const base = (arm / 3) * TAU + t * 1.6 * p.spin;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const k = i / 24;
        const r = R * (0.12 + k * 1.05);
        const a = base - p.spin * k * 3.2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(140, 255, 235, 0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 255, 250, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- Winding River: current streaks ----------

interface RiverStreak {
  x: number;
  y: number;
  age: number;
  life: number;
}

/** Little lines of foam riding the current, so you can see which way the river goes. */
export class RiverStreaks {
  private streaks: RiverStreak[] = [];
  private readonly flow: [number, number] = [0, 0];

  constructor(
    private readonly map: MapDef,
    private unit: number,
  ) {}

  rescale(k: number): void {
    this.unit *= k;
    for (const s of this.streaks) {
      s.x *= k;
      s.y *= k;
    }
  }

  update(dt: number, camX: number, camY: number, width: number, height: number): void {
    const u = this.unit;
    while (this.streaks.length < 34) {
      const x = camX + rand(-0.1, 1.1) * width;
      const y = camY + rand(-0.2, 1.1) * height;
      if (waterDistance(this.map, x / u, y / u) > -0.05) {
        if (Math.random() < 0.5) continue;
        break;
      }
      this.streaks.push({ x, y, age: rand(0, 1), life: rand(1.6, 3) });
    }
    for (const s of this.streaks) {
      riverFlow(this.map, s.x / u, s.y / u, this.flow);
      s.x += this.flow[0] * u * dt * 1.2;
      s.y += this.flow[1] * u * dt * 1.2;
      s.age += dt;
    }
    this.streaks = this.streaks.filter(
      (s) => s.age < s.life && s.y > camY - height * 0.3 && s.y < camY + height * 1.3 && waterDistance(this.map, s.x / u, s.y / u) < -0.02,
    );
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const u = this.unit;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (const s of this.streaks) {
      riverFlow(this.map, s.x / u, s.y / u, this.flow);
      const len = Math.hypot(this.flow[0], this.flow[1]) || 1;
      const dx = (this.flow[0] / len) * u * 0.06;
      const dy = (this.flow[1] / len) * u * 0.06;
      ctx.globalAlpha = Math.sin(Math.PI * (s.age / s.life)) * 0.45;
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x + dx, s.y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }
}
