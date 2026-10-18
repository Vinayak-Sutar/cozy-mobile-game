import { type HSV, hexToHsv, hsvToHex } from '../color';
import { context, type Layer, makeCanvas } from '../doc/document';
import type { TileEdit } from '../doc/history';
import type { LiveStroke, Rect } from '../view/compositor';
import type { Brush } from './presets';
import { colouredTip, grainMask, TIP_SIZE, tipMask } from './tips';

/** A point in canvas pixels, with stylus pressure (null for fingers and mice) and tilt. */
export interface DocPoint {
  x: number;
  y: number;
  pressure: number | null;
  tiltX: number;
  tiltY: number;
  t: number;
}

export type ToolMode = 'paint' | 'erase' | 'smudge';

export interface StrokeSetup {
  brush: Brush;
  /** Brush size in canvas pixels. */
  size: number;
  opacity: number;
  color: string;
  mode: ToolMode;
  /** Screen pixels per canvas pixel, so speed feels the same at any zoom. */
  viewScale: number;
}

interface Dab {
  x: number;
  y: number;
  size: number;
  alpha: number;
  angle: number;
  color: string;
  dist: number;
}

/**
 * Paints a stroke as a trail of dabs (stamps of the brush tip), like
 * Procreate and Kleki. Dabs go onto a separate stroke canvas, which is
 * combined with the layer when the stroke ends, so a marker's opacity
 * doesn't stack within one stroke. Smudge works on the layer directly.
 */
export class BrushEngine {
  readonly stroke: HTMLCanvasElement;
  private readonly strokeCtx: CanvasRenderingContext2D;
  private grained: HTMLCanvasElement | null = null;
  private grainedCtx: CanvasRenderingContext2D | null = null;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchCtx: CanvasRenderingContext2D;
  /** The paint a smudge brush is carrying. */
  private readonly loaded: HTMLCanvasElement;
  private readonly loadedCtx: CanvasRenderingContext2D;
  private loadedSize = 0;

  private setup: StrokeSetup | null = null;
  private layer: Layer | null = null;
  private edit: TileEdit | null = null;
  private dabs: Dab[] = [];
  private base: HSV = { h: 0, s: 0, v: 0 };
  private plainColor = true;
  private smoothX = 0;
  private smoothY = 0;
  private prev = { x: 0, y: 0, p: 1, t: 0, tiltX: 0, tiltY: 0 };
  private lastRaw = { x: 0, y: 0, t: 0 };
  private lastDab: { x: number; y: number } | null = null;
  private carry = 0;
  private dist = 0;
  private speed = 0;
  private bounds: Rect | null = null;
  private frame: Rect | null = null;
  private seed = 1;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.stroke = makeCanvas(width, height);
    this.strokeCtx = context(this.stroke);
    this.scratch = makeCanvas(512, 512);
    this.scratchCtx = context(this.scratch);
    this.loaded = makeCanvas(512, 512);
    this.loadedCtx = context(this.loaded);
  }

  get active(): boolean {
    return this.setup !== null;
  }

  get mode(): ToolMode | null {
    return this.setup?.mode ?? null;
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  begin(layer: Layer, setup: StrokeSetup, p: DocPoint, edit: TileEdit | null): void {
    this.setup = setup;
    this.layer = layer;
    this.edit = edit;
    this.dabs = [];
    this.seed = 1 + Math.floor(Math.random() * 1e6);
    const b = setup.brush;
    this.base = hexToHsv(setup.color);
    this.plainColor = !b.jitterHue && !b.jitterSat && !b.jitterLight && !b.hueShift;
    this.smoothX = p.x;
    this.smoothY = p.y;
    this.prev = { x: p.x, y: p.y, p: this.pressureOf(p), t: p.t, tiltX: p.tiltX, tiltY: p.tiltY };
    this.lastRaw = { x: p.x, y: p.y, t: p.t };
    this.lastDab = null;
    this.carry = 0;
    this.dist = 0;
    this.speed = 0;
    this.bounds = null;
    this.frame = null;
    if (b.grain !== 'none' && b.grainDepth > 0 && setup.mode !== 'smudge' && !this.grained) {
      this.grained = makeCanvas(this.width, this.height);
      this.grainedCtx = context(this.grained);
    }
    // The first dab where the brush lands.
    this.place(p.x, p.y, this.prev.p, p.tiltX, p.tiltY, 0, 0);
  }

  private pressureOf(p: DocPoint): number {
    return p.pressure === null ? 1 : Math.pow(Math.min(1, Math.max(0, p.pressure)), 0.85);
  }

  add(points: DocPoint[]): void {
    const setup = this.setup;
    if (!setup) return;
    const tau = setup.brush.streamline * 75;
    for (const raw of points) {
      const dt = Math.max(1, raw.t - this.lastRaw.t);
      const moved = Math.hypot(raw.x - this.lastRaw.x, raw.y - this.lastRaw.y) * setup.viewScale;
      this.speed = this.speed * 0.8 + (moved / dt) * 0.2;
      this.lastRaw = { x: raw.x, y: raw.y, t: raw.t };
      // StreamLine: the brush follows the finger on a soft spring.
      const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      this.smoothX += (raw.x - this.smoothX) * k;
      this.smoothY += (raw.y - this.smoothY) * k;
      this.walk(this.smoothX, this.smoothY, this.pressureOf(raw), raw.tiltX, raw.tiltY, raw.t);
    }
  }

  /** Lays dabs along the path from the previous point to (x, y), spaced by the brush size. */
  private walk(x: number, y: number, p: number, tiltX: number, tiltY: number, t: number): void {
    const setup = this.setup;
    if (!setup) return;
    const a = this.prev;
    const dx = x - a.x;
    const dy = y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const direction = Math.atan2(dy, dx);
    let d = this.carry;
    while (d <= len) {
      const k = d / len;
      const pressure = a.p + (p - a.p) * k;
      const size = this.sizeAt(pressure, this.dist + d);
      this.place(a.x + dx * k, a.y + dy * k, pressure, tiltX, tiltY, direction, this.dist + d);
      d += Math.max(0.35, setup.brush.spacing * size);
    }
    this.carry = d - len;
    this.dist += len;
    this.prev = { x, y, p, t, tiltX, tiltY };
  }

  private sizeAt(pressure: number, dist: number): number {
    const setup = this.setup!;
    const b = setup.brush;
    let s = setup.size * (1 - b.pressureSize * (1 - (b.minSize + (1 - b.minSize) * pressure)));
    if (b.speedSize) s *= Math.min(1.2, Math.max(b.minSize, 1 - b.speedSize * Math.max(0, this.speed - 0.15) * 0.9));
    if (b.taperStart > 0) {
      const k = Math.min(1, dist / (b.taperStart * setup.size * 6));
      s *= b.minSize + (1 - b.minSize) * (1 - (1 - k) * (1 - k));
    }
    return Math.max(0.5, s);
  }

  private place(x: number, y: number, pressure: number, tiltX: number, tiltY: number, direction: number, dist: number): void {
    const setup = this.setup!;
    const b = setup.brush;
    for (let i = 0; i < b.count; i++) {
      let size = this.sizeAt(pressure, dist);
      if (b.jitterSize) size *= 1 - b.jitterSize * this.random();
      let alpha = b.flow * (1 - b.pressureOpacity * (1 - pressure));
      if (b.jitterOpacity) alpha *= 1 - b.jitterOpacity * this.random();
      let angle = (b.angle * Math.PI) / 180;
      if (b.angleMode === 'stroke') angle += direction;
      else if (b.angleMode === 'random') angle = this.random() * Math.PI * 2;
      else if (b.angleMode === 'tilt' && (tiltX || tiltY)) angle += Math.atan2(tiltY, tiltX);
      if (b.angleJitter) angle += ((this.random() - 0.5) * b.angleJitter * Math.PI) / 180;
      let px = x;
      let py = y;
      if (b.scatter) {
        const r = b.scatter * size * Math.sqrt(this.random());
        const a = this.random() * Math.PI * 2;
        px += Math.cos(a) * r;
        py += Math.sin(a) * r;
      }
      const color = this.plainColor ? setup.color : this.colorAt(dist);
      const dab: Dab = { x: px, y: py, size, alpha, angle, color, dist };
      if (setup.mode === 'smudge') this.smudge(dab);
      else {
        this.dabs.push(dab);
        this.stamp(dab);
      }
    }
  }

  private colorAt(dist: number): string {
    const b = this.setup!.brush;
    const h = this.base.h + b.hueShift * (dist / 1000) * 360 + (b.jitterHue ? (this.random() - 0.5) * b.jitterHue * 360 : 0);
    const s = Math.min(1, Math.max(0, this.base.s + (b.jitterSat ? (this.random() - 0.5) * b.jitterSat : 0)));
    const v = Math.min(1, Math.max(0, this.base.v + (b.jitterLight ? (this.random() - 0.5) * b.jitterLight : 0)));
    return hsvToHex({ h: ((h % 360) + 360) % 360, s, v });
  }

  private stamp(dab: Dab): void {
    const setup = this.setup!;
    const b = setup.brush;
    const ctx = this.strokeCtx;
    const mask = tipMask(b.tip, b.hardness);
    const maskKey = `${b.tip}:${Math.round(b.hardness * 20)}`;
    const color = setup.mode === 'erase' ? '#000000' : dab.color;
    let tip: HTMLCanvasElement;
    if (this.plainColor || setup.mode === 'erase') tip = colouredTip(mask, maskKey, color);
    else {
      // Colour changes every dab: tint the mask in the scratch canvas instead of caching.
      const s = this.scratchCtx;
      s.globalCompositeOperation = 'copy';
      s.drawImage(mask, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = color;
      s.fillRect(0, 0, TIP_SIZE, TIP_SIZE);
      s.globalCompositeOperation = 'source-over';
      tip = this.scratch;
    }
    if (b.glow > 0 && setup.mode !== 'erase') {
      const halo = colouredTip(tipMask('round', 0), 'round:0', color);
      const hs = dab.size * 3.2;
      ctx.globalAlpha = Math.min(1, dab.alpha * 0.16 * b.glow);
      ctx.drawImage(halo, dab.x - hs / 2, dab.y - hs / 2, hs, hs);
    }
    ctx.globalAlpha = Math.min(1, dab.alpha);
    const s = dab.size;
    if (dab.angle === 0 && b.roundness === 1) {
      ctx.drawImage(tip, 0, 0, TIP_SIZE, TIP_SIZE, dab.x - s / 2, dab.y - s / 2, s, s);
    } else {
      ctx.save();
      ctx.translate(dab.x, dab.y);
      ctx.rotate(dab.angle);
      ctx.scale(1, b.roundness);
      ctx.drawImage(tip, 0, 0, TIP_SIZE, TIP_SIZE, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const r = s * (b.glow > 0 ? 1.7 : 0.75) + 2;
    this.grow([dab.x - r, dab.y - r, r * 2, r * 2]);
  }

  /**
   * Smudge, like a wet finger: the brush picks up the paint where it lands,
   * lays it down as it moves, and slowly takes on the colours it passes over,
   * so smears fade out instead of dragging one colour forever.
   */
  private smudge(dab: Dab): void {
    const layer = this.layer!;
    const setup = this.setup!;
    const s = Math.min(512, Math.max(2, Math.round(dab.size)));
    const x = Math.round(dab.x - s / 2);
    const y = Math.round(dab.y - s / 2);
    const lc = this.loadedCtx;
    const sc = this.scratchCtx;
    const previous = this.lastDab;
    if (!previous) {
      this.lastDab = { x: dab.x, y: dab.y };
      lc.globalCompositeOperation = 'copy';
      lc.drawImage(layer.canvas, x, y, s, s, 0, 0, s, s);
      lc.globalCompositeOperation = 'source-over';
      this.loadedSize = s;
      return;
    }
    if (s !== this.loadedSize) {
      // Pressure changed the size: stretch the carried paint to match.
      sc.globalCompositeOperation = 'copy';
      sc.drawImage(this.loaded, 0, 0, this.loadedSize, this.loadedSize, 0, 0, s, s);
      lc.globalCompositeOperation = 'copy';
      lc.drawImage(this.scratch, 0, 0, s, s, 0, 0, s, s);
      lc.globalCompositeOperation = 'source-over';
      this.loadedSize = s;
    }
    const strength = Math.min(1, setup.opacity);
    // Both rates are per distance moved (in tenths of the brush size), so a
    // smear looks the same whatever the brush spacing or pointer speed.
    const tenths = Math.hypot(dab.x - previous.x, dab.y - previous.y) / s / 0.1;
    if (tenths < 0.01) return;
    this.lastDab = { x: dab.x, y: dab.y };
    const lay = 1 - Math.pow(1 - strength * 0.16 * Math.max(0.3, dab.alpha), tenths);
    const pick = 1 - Math.pow(1 - (0.09 + (1 - strength) * 0.25), tenths);
    const mask = tipMask(setup.brush.tip, setup.brush.hardness);

    // Lay the carried paint down through the tip: layer = layer * (1 - a) + paint * a.
    sc.globalCompositeOperation = 'copy';
    sc.drawImage(this.loaded, 0, 0, s, s, 0, 0, s, s);
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(mask, 0, 0, TIP_SIZE, TIP_SIZE, 0, 0, s, s);
    sc.globalCompositeOperation = 'source-over';
    this.edit?.capture(x, y, s, s);
    const ctx = layer.ctx;
    ctx.globalAlpha = lay;
    if (layer.alphaLock) {
      ctx.globalCompositeOperation = 'source-atop';
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(mask, 0, 0, TIP_SIZE, TIP_SIZE, x, y, s, s);
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.drawImage(this.scratch, 0, 0, s, s, x, y, s, s);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Pick up some of what is here: paint = paint * (1 - k) + here * k.
    if (pick > 0.001) {
      lc.globalAlpha = pick;
      lc.globalCompositeOperation = 'destination-out';
      lc.fillRect(0, 0, s, s);
      lc.globalCompositeOperation = 'lighter';
      lc.drawImage(layer.canvas, x, y, s, s, 0, 0, s, s);
      lc.globalAlpha = 1;
      lc.globalCompositeOperation = 'source-over';
    }
    this.grow([x, y, s, s]);
  }

  private grow(r: Rect): void {
    this.bounds = union(this.bounds, r);
    this.frame = union(this.frame, r);
  }

  /** The area painted since the last call (to refresh the grain and the screen). */
  takeFrame(): Rect | null {
    const frame = this.frame ? clampRect(this.frame, this.width, this.height) : null;
    this.frame = null;
    if (frame && this.grained) this.applyGrain(frame);
    return frame;
  }

  /** The whole stroke's area so far. */
  get area(): Rect | null {
    return this.bounds ? clampRect(this.bounds, this.width, this.height) : null;
  }

  private applyGrain(rect: Rect): void {
    const setup = this.setup;
    const ctx = this.grainedCtx;
    if (!setup || !ctx) return;
    const mask = grainMask(setup.brush.grain, setup.brush.grainDepth);
    const [x, y, w, h] = rect;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.stroke, x, y, w, h, x, y, w, h);
    if (mask) {
      const pattern = ctx.createPattern(mask, 'repeat');
      if (pattern) {
        pattern.setTransform(new DOMMatrix().scale(setup.brush.grainScale));
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = pattern;
        ctx.fillRect(x, y, w, h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private get usesGrain(): boolean {
    const b = this.setup?.brush;
    return !!b && b.grain !== 'none' && b.grainDepth > 0 && this.setup?.mode !== 'smudge';
  }

  /** What the screen should show on top of the layer while the stroke is going. */
  live(): LiveStroke | null {
    const setup = this.setup;
    if (!setup || setup.mode === 'smudge') return null;
    return {
      canvas: this.usesGrain && this.grained ? this.grained : this.stroke,
      opacity: setup.opacity,
      op: setup.mode === 'erase' ? 'destination-out' : setup.brush.blend,
    };
  }

  /** Lifts the brush: finishes the line, tapers its end, and puts the stroke on the layer. */
  end(): Rect | null {
    const setup = this.setup;
    const layer = this.layer;
    if (!setup || !layer) return null;
    // Catch up with the finger, so the line ends where it lifted.
    this.walk(this.lastRaw.x, this.lastRaw.y, this.prev.p, this.prev.tiltX, this.prev.tiltY, this.lastRaw.t);
    if (setup.brush.taperEnd > 0 && setup.mode !== 'smudge' && this.dabs.length < 8000) this.taperEnd();
    const rect = this.area;
    if (rect && setup.mode !== 'smudge') {
      if (this.grained) this.applyGrain(rect);
      const [x, y, w, h] = rect;
      this.edit?.capture(x, y, w, h);
      const ctx = layer.ctx;
      ctx.globalCompositeOperation = setup.mode === 'erase' ? 'destination-out' : layer.alphaLock ? 'source-atop' : setup.brush.blend;
      ctx.globalAlpha = setup.opacity;
      ctx.drawImage(this.usesGrain && this.grained ? this.grained : this.stroke, x, y, w, h, x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.reset(rect);
    return rect;
  }

  /** Thins the last stretch of the stroke to a point, then repaints it (the stroke is still on its own canvas). */
  private taperEnd(): void {
    const setup = this.setup!;
    const b = setup.brush;
    const length = b.taperEnd * setup.size * 6;
    const total = this.dist;
    const rect = this.area;
    if (!rect) return;
    this.strokeCtx.clearRect(...rect);
    const dabs = this.dabs;
    this.dabs = [];
    this.bounds = null;
    for (const dab of dabs) {
      const left = total - dab.dist;
      if (left < length) {
        const k = left / length;
        dab.size *= b.minSize + (1 - b.minSize) * (1 - (1 - k) * (1 - k));
      }
      this.stamp(dab);
    }
  }

  cancel(): void {
    this.reset(this.area);
  }

  private reset(rect: Rect | null): void {
    if (rect) {
      this.strokeCtx.clearRect(...rect);
      this.grainedCtx?.clearRect(...rect);
    }
    this.setup = null;
    this.layer = null;
    this.edit = null;
    this.dabs = [];
    this.bounds = null;
    this.frame = null;
  }
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
}

function clampRect([x, y, w, h]: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}
