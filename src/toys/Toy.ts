import type { ToyId } from '../app/storage';
import type { FluidSim, RGB, SimConfig } from '../engine/fluid';
import type { Gpu } from '../engine/gl';
import type { Quality } from '../engine/quality';
import type { AudioEngine, SoundTheme } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { createPointer, type Pointer } from '../input/pointers';
import type { PauseAction } from '../ui/pause';
import { rand, scale } from '../util/color';

/** How a stroke is laid down. All values are multipliers of the toy's defaults. */
export interface StrokeStyle {
  radius?: number;
  push?: number;
  pigment?: number;
  /** Pixels between stamps along the path. */
  spacing?: number;
  maxSteps?: number;
}

/** Shared services every toy can use. Sizes are CSS pixels. */
export interface ToyEnv {
  gpu: Gpu;
  sim: FluidSim;
  quality: Quality;
  audio: AudioEngine;
  haptics: Haptics;
  view: { width: number; height: number };
}

/**
 * A toy = fluid settings + a look (display shader) + a sound theme, plus
 * optional extras drawn on the 2D overlay. The base class turns finger
 * movement into smooth fluid strokes; toys override hooks to add character.
 */
export abstract class Toy {
  abstract readonly id: ToyId;
  abstract readonly simConfig: SimConfig;
  abstract readonly sound: SoundTheme;
  /** Light toys get a darker home button and ghost finger. */
  readonly light: boolean = false;
  readonly ghostColor: string = 'rgba(255, 255, 255, 0.85)';
  /** Toys that draw on the 2D overlay every frame. */
  readonly usesOverlay: boolean = false;
  /** Toys where the player makes something (a painting) and idle motion would spoil it. */
  readonly quietIdle: boolean = false;

  protected env!: ToyEnv;
  protected time = 0;

  /** Put toy-specific controls (e.g. a brush toolbar) into the toy UI layer. */
  mountUi(_container: HTMLElement): void {}

  unmountUi(): void {}

  /** Extra buttons for the pause sheet. */
  pauseActions(): PauseAction[] {
    return [];
  }

  enter(env: ToyEnv): void {
    this.env = env;
    this.time = 0;
    env.sim.configure(this.simConfig);
    env.sim.clear();
    this.onEnter();
  }

  exit(): void {}

  onResize(): void {}

  onQualityChange(): void {}

  /** Dye to paint with for this stroke. */
  abstract strokeColor(pointer: Pointer): RGB;

  pointerDown(pointer: Pointer): void {
    const [u, v] = this.uv(pointer.x, pointer.y);
    this.drop(u, v, this.strokeColor(pointer), 1);
  }

  /** Called once per frame for a pointer that moved from (x0, y0) to its current position. */
  pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt);
  }

  pointerUp(_pointer: Pointer): void {}

  /** Gentle motion while nobody is touching, so the toy never looks dead. */
  ambient(): void {
    const { width, height } = this.env.view;
    const angle = rand(0, Math.PI * 2);
    const radius = Math.min(width, height) * rand(0.15, 0.35);
    const x = width / 2 + Math.cos(angle) * radius;
    const y = height / 2 + Math.sin(angle) * radius;
    const [u, v] = this.uv(x, y);
    const tangent = angle + Math.PI / 2;
    const speed = rand(60, 140);
    this.env.sim.splat(u, v, Math.cos(tangent) * speed, -Math.sin(tangent) * speed, scale(this.ambientColor(), 0.5), 1.4);
  }

  /** A little colour on arrival so the first frame is never blank. */
  intro(): void {
    for (let i = 0; i < 3; i++) this.ambient();
  }

  update(dt: number): void {
    this.time += dt;
  }

  abstract render(): void;

  drawOverlay(_ctx: CanvasRenderingContext2D, _dt: number): void {}

  protected ambientColor(): RGB {
    return this.strokeColor(createPointer(-1, 0, 0, true));
  }

  protected onEnter(): void {}

  /** CSS pixels to simulation space (0..1, y up). */
  protected uv(x: number, y: number): [number, number] {
    const { width, height } = this.env.view;
    return [x / width, 1 - y / height];
  }

  /**
   * Splats along the path a finger travelled this frame. Velocity is measured
   * in "screens per second" and every splat is weighted by frame time, so a
   * stroke looks and feels the same on 60 Hz, 120 Hz and 165 Hz screens.
   * `style` lets brushes change size, push, pigment and stamp spacing.
   */
  protected stroke(
    pointer: Pointer,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    dt: number,
    style: StrokeStyle = {},
  ): void {
    const { sim } = this.env;
    const { width, height } = this.env.view;
    const dxPx = x1 - x0;
    const dyPx = y1 - y0;
    const distance = Math.hypot(dxPx, dyPx);
    if (distance < 0.5) return;

    const radius = style.radius ?? 1;
    const pigment = style.pigment ?? 1;
    const unit = Math.max(width, height);
    const step = Math.max(dt, 1 / 240);
    const force = (sim.config.splatForce / 60) * (style.push ?? 1);
    const frameWeight = Math.min(2, Math.max(0.25, dt * 60));
    const steps = Math.min(style.maxSteps ?? 6, Math.max(1, Math.ceil(distance / (style.spacing ?? 22))));
    const push = frameWeight / steps;
    const vx = (dxPx / unit / step) * force * push;
    const vy = (-dyPx / unit / step) * force * push;
    const color = scale(this.strokeColor(pointer), (pigment * frameWeight) / Math.sqrt(steps));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const [u, v] = this.uv(x0 + dxPx * t, y0 + dyPx * t);
      if (force !== 0) sim.splatVelocity(u, v, vx, vy, radius);
      if (pigment > 0) sim.splatDye(u, v, color, radius);
    }
  }

  /** A tap: a blob of colour that blooms outward. */
  protected drop(u: number, v: number, color: RGB, strength: number): void {
    const { sim } = this.env;
    const { width, height } = this.env.view;
    sim.splatDye(u, v, scale(color, 1.6 * strength), 1.1);
    const ring = Math.min(width, height) * 0.03;
    const push = 260 * strength;
    const offset = rand(0, Math.PI);
    for (let k = 0; k < 6; k++) {
      const a = offset + (k / 6) * Math.PI * 2;
      const du = (Math.cos(a) * ring) / width;
      const dv = (Math.sin(a) * ring) / height;
      sim.splatVelocity(u + du, v + dv, Math.cos(a) * push, Math.sin(a) * push, 0.45);
    }
  }
}
