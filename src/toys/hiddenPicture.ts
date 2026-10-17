import { store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { MAX_PROBES, Probe } from '../engine/probe';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { PictureBook } from '../ui/pictureBook';
import { clamp, rand } from '../util/color';
import { SCENES, type Scene } from './scenes';
import displaySource from './shaders/foggyWindow.frag?raw';
import { Toy } from './Toy';

const FOG: RGB = [1, 0, 0];
/** Fog is measured on a grid; a spot counts as clear below this. */
const GRID_COLS = 6;
const GRID_ROWS = 9;
const CLEAR_BELOW = 0.3;
/** Fraction of the window that must be wiped before the picture is revealed. */
const DONE_AT = 0.78;
const REVEAL_SECONDS = 4.5;
const FOG_SECONDS = 1.6;
const MAX_DROPS = 14;

type Phase = 'wiping' | 'revealed' | 'fogging';

interface Drop {
  x: number;
  y: number;
  vy: number;
  seed: number;
}

interface Sparkle {
  x: number;
  y: number;
  phase: number;
  size: number;
}

/**
 * Hidden Picture: the screen is a fogged-up window. Wipe it to find the
 * picture outside. Drops trickle down the glass and leave clear trails.
 * Wipe most of it and the picture is revealed and goes in the picture book;
 * then the fog rolls back in with a new picture.
 */
export class HiddenPicture extends Toy {
  readonly id = 'window' as const;
  override readonly light = true;
  override readonly usesOverlay = true;
  override readonly ghostColor = 'rgba(60, 70, 90, 0.6)';

  readonly simConfig: SimConfig = {
    curl: 5,
    velocityDissipation: 1.2,
    densityDissipation: 0,
    pressure: 0.8,
    splatRadius: 0.2,
    splatForce: 1800,
  };

  readonly sound: SoundTheme = {
    scale: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
    voice: 'bell',
    bed: 'paper',
    // A higher, narrow band: a finger squeaking on wet glass.
    swish: { type: 'bandpass', low: 1600, high: 3400, q: 1.4, gain: 0.045 },
  };

  private display: Program | null = null;
  private probe: Probe | null = null;
  private picture: WebGLTexture | null = null;
  private pictureBlur: WebGLTexture | null = null;
  private scene: Scene = SCENES[0];
  private phase: Phase = 'wiping';
  private phaseStart = 0;
  private swapped = false;
  private readonly fogAt: number[] = new Array(GRID_COLS * GRID_ROWS).fill(1);
  private probeCursor = 0;
  private clearFraction = 0;
  private drops: Drop[] = [];
  private sparkles: Sparkle[] = [];
  private book: PictureBook | null = null;

  /** No colour: wiping only removes fog. */
  strokeColor(): RGB {
    return [0, 0, 0];
  }

  mountUi(container: HTMLElement): void {
    this.book = new PictureBook(container, this.env.audio);
  }

  unmountUi(): void {
    this.book?.destroy();
    this.book = null;
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.probe = new Probe(this.env.gpu);
    this.scene = SCENES[store.data.pictures.next % SCENES.length];
    this.drawPicture();
    this.startWiping();
  }

  override exit(): void {
    this.probe?.dispose();
    this.probe = null;
    const gl = this.env.gpu.gl;
    if (this.picture) gl.deleteTexture(this.picture);
    if (this.pictureBlur) gl.deleteTexture(this.pictureBlur);
    this.picture = null;
    this.pictureBlur = null;
  }

  override onResize(): void {
    this.drawPicture();
  }

  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    if (this.phase !== 'wiping') return;
    const [u, v] = this.uv(pointer.x, pointer.y);
    this.env.sim.liftDye(u, v, 0.5, 1.2);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    if (this.phase !== 'wiping') return;
    const { sim } = this.env;
    const dx = pointer.x - x0;
    const dy = pointer.y - y0;
    const steps = Math.min(16, Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10)));
    const strength = Math.min(0.6, 0.32 * Math.max(0.25, dt * 60));
    for (let i = 1; i <= steps; i++) {
      const [u, v] = this.uv(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
      sim.liftDye(u, v, strength, 1.1);
    }
    // A gentle smear, so the edges of a wipe swirl like real condensation.
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { pigment: 0, push: 0.5, radius: 1.2 });
    // Now and then a drop gathers at the edge of the wipe and runs down.
    if (this.drops.length < MAX_DROPS && Math.random() < 0.05) {
      this.drops.push({ x: pointer.x + rand(-18, 18), y: pointer.y + rand(10, 22), vy: rand(15, 30), seed: rand(0, 10) });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    const { sim, audio, haptics } = this.env;
    const inPhase = this.time - this.phaseStart;

    if (this.phase === 'wiping') {
      this.measure();
      if (this.clearFraction >= DONE_AT) {
        this.phase = 'revealed';
        this.phaseStart = this.time;
        audio.celebrate();
        haptics.tap(0.8);
        this.found();
        this.spawnSparkles();
      }
    } else if (this.phase === 'revealed') {
      // The last of the fog melts away.
      if (inPhase < 1.2) sim.scaleDye(Math.exp(-dt * 4));
      if (inPhase >= REVEAL_SECONDS) {
        this.phase = 'fogging';
        this.phaseStart = this.time;
        this.swapped = false;
        this.sparkles = [];
        audio.ui('close');
      }
    } else {
      // Fog rolls back over the glass; once it's thick, a new picture waits behind it.
      sim.mixDyeTo(FOG, 1 - Math.exp(-dt * 3));
      if (!this.swapped && inPhase > FOG_SECONDS * 0.6) {
        this.swapped = true;
        this.scene = SCENES[store.data.pictures.next % SCENES.length];
        this.drawPicture();
      }
      if (inPhase >= FOG_SECONDS) this.startWiping();
    }

    this.updateDrops(dt);
  }

  render(): void {
    const { gpu, sim } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display || !this.picture || !this.pictureBlur) return;
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform2f(display.u('texelSize'), sim.dye.texelSizeX * 2, sim.dye.texelSizeY * 2);
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uPicture'), gpu.bindTexture(this.picture, 1));
    gl.uniform1i(display.u('uPictureBlur'), gpu.bindTexture(this.pictureBlur, 2));
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const t = this.time;

    // Water drops on the glass.
    for (const d of this.drops) {
      ctx.fillStyle = 'rgba(225, 238, 250, 0.85)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 3.6, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(d.x - 1.2, d.y - 1.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // The window frame.
    const frame = Math.max(10, Math.min(width, height) * 0.03);
    ctx.save();
    ctx.strokeStyle = '#c9a27a';
    ctx.lineWidth = frame;
    ctx.strokeRect(frame / 2, frame / 2, width - frame, height - frame);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frame, frame, width - frame * 2, height - frame * 2);
    ctx.restore();

    if (this.phase === 'revealed') {
      const k = clamp((t - this.phaseStart) / 0.5, 0, 1);
      for (const s of this.sparkles) {
        const tw = 0.5 + 0.5 * Math.sin(t * 5 + s.phase);
        ctx.fillStyle = `rgba(255, 252, 230, ${0.9 * tw * k})`;
        this.star(ctx, s.x, s.y, s.size * (0.6 + 0.4 * tw));
      }
      this.drawLabel(ctx, width, height, k);
    }
  }

  // ---------- Game flow ----------

  private startWiping(): void {
    this.phase = 'wiping';
    this.phaseStart = this.time;
    this.env.sim.fillDye(FOG);
    this.env.sim.clearVelocity();
    this.fogAt.fill(1);
    this.clearFraction = 0;
    this.probeCursor = 0;
    this.drops = [];
  }

  private found(): void {
    const pictures = store.data.pictures;
    pictures.found[this.scene.id] = (pictures.found[this.scene.id] ?? 0) + 1;
    pictures.next = (SCENES.indexOf(this.scene) + 1) % SCENES.length;
    store.save();
    this.book?.refresh();
  }

  /** Reads one batch of the fog grid per frame and updates how much of the window is clear. */
  private measure(): void {
    const probe = this.probe;
    if (!probe) return;
    const total = GRID_COLS * GRID_ROWS;
    const points: [number, number][] = [];
    for (let i = 0; i < MAX_PROBES; i++) {
      const index = (this.probeCursor + i) % total;
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      points.push([(col + 0.5) / GRID_COLS, (row + 0.5) / GRID_ROWS]);
    }
    const values: number[] = [];
    probe.read(this.env.sim.dye.read, points, 0.03, 1, values);
    values.forEach((value, i) => (this.fogAt[(this.probeCursor + i) % total] = value));
    this.probeCursor = (this.probeCursor + MAX_PROBES) % total;
    this.clearFraction = this.fogAt.filter((f) => f < CLEAR_BELOW).length / total;
  }

  private updateDrops(dt: number): void {
    const { width, height } = this.env.view;
    const { sim } = this.env;
    for (const d of this.drops) {
      d.vy = Math.min(70, d.vy + 25 * dt);
      d.y += d.vy * dt;
      d.x += Math.sin(this.time * 2.2 + d.seed) * 6 * dt;
      // Each drop wipes a thin clear trail as it runs.
      if (this.phase === 'wiping') {
        const [u, v] = this.uv(d.x, d.y);
        sim.liftDye(u, v, 0.22, 0.12);
      }
    }
    this.drops = this.drops.filter((d) => d.y < height + 10 && d.x > -10 && d.x < width + 10);
  }

  private spawnSparkles(): void {
    const { width, height } = this.env.view;
    this.sparkles = Array.from({ length: 22 }, () => ({
      x: rand(0.08, 0.92) * width,
      y: rand(0.08, 0.92) * height,
      phase: rand(0, Math.PI * 2),
      size: rand(4, 9),
    }));
  }

  /** Draws the scene at screen size, plus a blurred copy for the hint seen through the fog. */
  private drawPicture(): void {
    const { gpu } = this.env;
    const { width, height } = this.env.view;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    this.scene.draw(ctx, width, height);
    this.picture = gpu.uploadCanvas(canvas, this.picture);

    const blur = document.createElement('canvas');
    blur.width = Math.max(1, Math.round(canvas.width / 4));
    blur.height = Math.max(1, Math.round(canvas.height / 4));
    const bctx = blur.getContext('2d');
    if (bctx) {
      // Downscaling already softens; the filter (where supported) blurs further.
      bctx.filter = 'blur(4px)';
      bctx.drawImage(canvas, 0, 0, blur.width, blur.height);
    }
    this.pictureBlur = gpu.uploadCanvas(blur, this.pictureBlur);
  }

  private drawLabel(ctx: CanvasRenderingContext2D, width: number, height: number, k: number): void {
    const text = this.scene.name;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `700 ${Math.round(Math.min(width, height) * 0.06)}px Nunito, Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 40;
    const h = Math.min(width, height) * 0.1;
    const x = width / 2;
    const y = height * 0.12 + (1 - k) * -20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#3b3346';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? s * 0.35 : s;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}
