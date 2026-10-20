import { FluidSim, type RGB } from '../../engine/fluid';
import { type FBO, Gpu, type Program } from '../../engine/gl';
import paperSource from '../../toys/shaders/paper.frag?raw';
import { hexToRgb } from '../color';
import { makeCanvas } from '../doc/document';
import displaySource from './wetDisplay.frag?raw';
import loadSource from './wetLoad.frag?raw';

/** What a live watercolour brush does to the wet paint. */
export type WetKind = 'paint' | 'wash' | 'spatter' | 'water' | 'lift';

export interface WetPoint {
  x: number;
  y: number;
  /** 0..1 (1 for fingers). */
  pressure: number;
  /** Milliseconds. */
  t: number;
}

export interface WetStroke {
  kind: WetKind;
  color: string;
  /** Brush diameter in canvas pixels. */
  size: number;
  /** 0..1, from the opacity slider. */
  strength: number;
  /** Symmetry copies (canvas-pixel transforms), or null. */
  symmetry: DOMMatrix[] | null;
}

export interface DriedPaint {
  /** The dried paint at the simulation's size, to be drawn over the whole painting. */
  canvas: HTMLCanvasElement;
  /** Where there is any paint, in canvas pixels: [x, y, w, h]. */
  rect: [number, number, number, number];
}

/** Wet undo steps are whole-page snapshots on the GPU, so fewer on phones with less memory. */
const MAX_UNDO = (() => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return memory <= 2 ? 3 : memory <= 4 ? 5 : 8;
})();

/**
 * Live watercolour: a fluid simulation (our Navier–Stokes solver) the shape
 * of the painting. Pigment flows, blooms and gathers at wet edges while it's
 * wet; drying turns it into ordinary paint on the layer.
 */
export class WetLayer {
  readonly canvas: HTMLCanvasElement;
  readonly gpu: Gpu;
  readonly sim: FluidSim;
  /** Any wet paint on the page right now. */
  active = false;
  /** No flowing (the paint stays wet and where it is). */
  frozen = false;
  /** Seconds since the last brush touch; the editor dries the paint after a while. */
  quiet = 0;
  private drips = false;
  private readonly display: Program;
  private readonly load: Program;
  private readonly paper: FBO;
  private out: FBO | null = null;
  private undoStack: FBO[] = [];
  private last: WetPoint | null = null;
  private readonly simW: number;
  private readonly simH: number;

  /** A wet layer for a painting `docW` × `docH`, or null if WebGL isn't available. */
  static create(docW: number, docH: number): WetLayer | null {
    try {
      return new WetLayer(docW, docH);
    } catch (err) {
      console.error('[studio] live watercolour unavailable:', err);
      return null;
    }
  }

  private constructor(
    private readonly docW: number,
    private readonly docH: number,
  ) {
    // The fluid's dye is as sharp as the device allows, up to 1024 on the short side.
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const short = Math.min(Math.min(docW, docH), memory <= 2 ? 512 : memory <= 4 ? 768 : 1024);
    const scale = short / Math.min(docW, docH);
    this.simW = Math.max(16, Math.round(docW * scale));
    this.simH = Math.max(16, Math.round(docH * scale));
    this.canvas = makeCanvas(this.simW, this.simH);
    const gpu = Gpu.create(this.canvas, { alpha: true });
    if (!gpu) throw new Error('WebGL unavailable');
    this.gpu = gpu;
    this.sim = new FluidSim(gpu, { simRes: memory <= 2 ? 96 : 144, dyeRes: short, pressureIterations: 20 });
    this.setDrips(false);
    this.sim.clear();
    this.display = gpu.program(displaySource);
    this.load = gpu.program(loadSource);
    // Paper tooth for the wash to settle into, baked once.
    const gl = gpu.gl;
    this.paper = gpu.fbo(this.simW, this.simH, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.LINEAR, gl.UNSIGNED_BYTE);
    const grain = gpu.program(paperSource);
    grain.bind();
    gl.uniform1f(grain.u('uAspect'), this.simW / this.simH);
    gl.uniform2f(grain.u('uSeed'), Math.random() * 100, Math.random() * 100);
    gpu.blit(this.paper);
  }

  /** Drips: wet paint runs down the page, as if the paper were tilted. */
  setDrips(on: boolean): void {
    this.drips = on;
    // Calm water: paint spreads and blooms a little, it doesn't swirl like ink.
    this.sim.configure({
      curl: 1.5,
      velocityDissipation: on ? 1.2 : 2.6,
      densityDissipation: 0,
      pressure: 0.7,
      splatRadius: 0.2,
      splatForce: 1,
      buoyancy: on ? 140 : 0,
      buoyancyWeights: [0.33, 0.33, 0.33],
    });
  }

  get dripping(): boolean {
    return this.drips;
  }

  /** Canvas pixels to the fluid's 0..1 space (y up). */
  private uv(x: number, y: number): [number, number] {
    return [x / this.docW, 1 - y / this.docH];
  }

  /** The Gaussian radius for a brush `size` canvas pixels across. */
  private radius(size: number): number {
    const sigma = size / 4 / this.docH;
    return 2 * sigma * sigma;
  }

  /** Call when a stroke starts: keeps an undo step and wakes the paint. */
  begin(p: WetPoint, stroke: WetStroke): void {
    this.saveUndo();
    this.active = true;
    this.quiet = 0;
    this.last = p;
    if (stroke.kind === 'spatter') this.spatter(p, p, stroke);
    else this.dab(p.x, p.y, 0, 0, p.pressure, stroke, 1);
  }

  /** Paints along the path to `points`. */
  move(points: WetPoint[], stroke: WetStroke): void {
    for (const p of points) {
      const a = this.last ?? p;
      this.last = p;
      this.quiet = 0;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      if (stroke.kind === 'spatter') {
        this.spatter(a, p, stroke);
        continue;
      }
      const dt = Math.max(4, p.t - a.t) / 1000;
      // Brush speed in fluid texels per second becomes the push on the water.
      const vx = (dx / this.docW) * this.sim.velocity.width;
      const vy = (-dy / this.docH) * this.sim.velocity.height;
      const step = Math.max(1, stroke.size * 0.22);
      const steps = Math.min(40, Math.max(1, Math.ceil(len / step)));
      // Each dab pushes its share, so a stroke pushes the water about as fast as the brush moved.
      const push = len / steps / stroke.size;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const pressure = a.pressure + (p.pressure - a.pressure) * k;
        this.dab(a.x + dx * k, a.y + dy * k, (vx / dt) * push, (vy / dt) * push, pressure, stroke, len / steps / step);
      }
    }
  }

  end(): void {
    this.last = null;
  }

  /** One touch of the brush (and its symmetry copies). `share` is the part of a full step this dab covers. */
  private dab(x: number, y: number, vx: number, vy: number, pressure: number, stroke: WetStroke, share: number): void {
    const copies = stroke.symmetry ?? [null];
    for (const t of copies) {
      const px = t ? t.a * x + t.c * y + t.e : x;
      const py = t ? t.b * x + t.d * y + t.f : y;
      // Turn the push with the copy (velocity has y up, canvas y down).
      const pvx = t ? t.a * vx - t.c * vy : vx;
      const pvy = t ? -t.b * vx + t.d * vy : vy;
      this.touch(px, py, pvx, pvy, pressure, stroke, share);
    }
  }

  private touch(x: number, y: number, vx: number, vy: number, pressure: number, stroke: WetStroke, share: number): void {
    const [u, v] = this.uv(x, y);
    const size = stroke.size * (0.45 + 0.55 * pressure);
    const r = this.radius(size);
    const sim = this.sim;
    const push = 0.16;
    switch (stroke.kind) {
      case 'paint':
      case 'wash': {
        const wash = stroke.kind === 'wash';
        sim.splatVelocityAt(u, v, vx * push * (wash ? 1.3 : 1), vy * push * (wash ? 1.3 : 1), r * 1.4);
        const amount = (wash ? 0.06 : 0.14) * stroke.strength * (0.35 + 0.65 * pressure) * share;
        sim.splatDyeAt(u, v, this.pigment(stroke.color, amount), r);
        break;
      }
      case 'water':
        // Clean water: pushes the wet paint about and thins it a little.
        sim.splatVelocityAt(u, v, vx * push * 3, vy * push * 3, r * 1.8);
        sim.liftDyeAt(u, v, 0.03 * stroke.strength * share, r);
        break;
      case 'lift':
        // A thirsty brush: soaks pigment back up.
        sim.liftDyeAt(u, v, Math.min(0.5, 0.14 * stroke.strength * share), r);
        sim.splatVelocityAt(u, v, vx * 0.15, vy * 0.15, r);
        break;
      case 'spatter':
        break;
    }
  }

  /** Flicked drops scattered around the path from a to b. */
  private spatter(a: WetPoint, b: WetPoint, stroke: WetStroke): void {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.min(6, Math.max(1, Math.round(distance / (stroke.size * 0.6) + Math.random())));
    for (let i = 0; i < count; i++) {
      const k = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const spread = stroke.size * 1.4 * Math.pow(Math.random(), 0.7);
      const x = a.x + (b.x - a.x) * k + Math.cos(angle) * spread;
      const y = a.y + (b.y - a.y) * k + Math.sin(angle) * spread;
      const big = Math.random() < 0.1;
      const size = stroke.size * (big ? 0.45 + Math.random() * 0.3 : 0.1 + Math.random() * 0.22);
      const copies = stroke.symmetry ?? [null];
      for (const t of copies) {
        const px = t ? t.a * x + t.c * y + t.e : x;
        const py = t ? t.b * x + t.d * y + t.f : y;
        const [u, v] = this.uv(px, py);
        this.sim.splatDyeAt(u, v, this.pigment(stroke.color, 0.5 * stroke.strength * (big ? 0.7 : 1)), this.radius(size));
      }
    }
  }

  /** How much of each colour channel the paint absorbs (relative to white paper), times `amount`. */
  private pigment(color: string, amount: number): RGB {
    return hexToRgb(color).map((c) => -Math.log(Math.max(c / 255, 0.02)) * amount) as RGB;
  }

  /** Lets the water move on; `dt` in seconds. */
  step(dt: number): void {
    if (!this.active) return;
    this.quiet += dt;
    if (this.frozen) return;
    // Small steps keep fast strokes stable.
    const steps = dt > 1 / 45 ? 2 : 1;
    for (let i = 0; i < steps; i++) this.sim.step(Math.min(dt / steps, 1 / 30));
  }

  /** Draws the wet paint into this layer's own canvas, ready to be drawn over the painting. */
  render(): void {
    this.draw(null);
  }

  private draw(target: FBO | null): void {
    const { gpu } = this;
    const gl = gpu.gl;
    gl.disable(gl.BLEND);
    this.display.bind();
    const dye = this.sim.dye;
    gl.uniform2f(this.display.u('texelSize'), dye.texelSizeX * 2.5, dye.texelSizeY * 2.5);
    gl.uniform1i(this.display.u('uTexture'), dye.read.attach(0));
    gl.uniform1i(this.display.u('uPaper'), this.paper.attach(1));
    gl.uniform1f(this.display.u('uDepth'), 3.2);
    if (!target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gpu.blit(target);
  }

  /** Steps back one stroke while the paint is still wet. False if there's nothing to go back to. */
  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.sim.restoreDye(snapshot);
    this.sim.clearVelocity();
    this.gpu.deleteFbo(snapshot);
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** How many wet steps there are to undo. */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  private saveUndo(): void {
    const recycled = this.undoStack.length >= MAX_UNDO ? (this.undoStack.shift() ?? null) : null;
    this.undoStack.push(this.sim.snapshotDye(recycled));
  }

  /** Re-wets a layer: its dry paint becomes wet pigment again (the layer should then be cleared). */
  rewet(layer: HTMLCanvasElement): void {
    const { gpu } = this;
    const gl = gpu.gl;
    this.saveUndo();
    const texture = gpu.uploadCanvas(layer);
    this.load.bind();
    gl.uniform1i(this.load.u('uLayer'), gpu.bindTexture(texture, 0));
    gl.uniform1i(this.load.u('uDye'), this.sim.dye.read.attach(1));
    gpu.blit(this.sim.dye.write);
    this.sim.dye.swap();
    gl.deleteTexture(texture);
    this.active = true;
    this.quiet = 0;
  }

  /**
   * Dries the paint: returns it as an ordinary picture (with transparency)
   * and clears the water. Null if there was nothing on the page.
   */
  dry(): DriedPaint | null {
    const { gpu } = this;
    const gl = gpu.gl;
    const w = this.simW;
    const h = this.simH;
    this.out ??= gpu.fbo(w, h, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.NEAREST, gl.UNSIGNED_BYTE);
    this.draw(this.out);
    const pixels = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.clearAll();

    // GL rows run bottom-up and are premultiplied; a 2D canvas wants top-down and straight colour.
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(w, h);
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      const dst = y * w * 4;
      for (let x = 0; x < w; x++) {
        const i = src + x * 4;
        const a = pixels[i + 3];
        if (!a) continue;
        const o = dst + x * 4;
        const k = 255 / a;
        image.data[o] = Math.min(255, pixels[i] * k);
        image.data[o + 1] = Math.min(255, pixels[i + 1] * k);
        image.data[o + 2] = Math.min(255, pixels[i + 2] * k);
        image.data[o + 3] = a;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    ctx.putImageData(image, 0, 0);
    const sx = this.docW / w;
    const sy = this.docH / h;
    return {
      canvas,
      rect: [Math.floor(x0 * sx) - 2, Math.floor(y0 * sy) - 2, Math.ceil((x1 - x0 + 1) * sx) + 4, Math.ceil((y1 - y0 + 1) * sy) + 4],
    };
  }

  /** Throws the wet paint away. */
  clearAll(): void {
    this.sim.clear();
    for (const fbo of this.undoStack) this.gpu.deleteFbo(fbo);
    this.undoStack = [];
    this.active = false;
    this.quiet = 0;
    this.last = null;
  }

  dispose(): void {
    this.clearAll();
    const lose = this.gpu.gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
}
