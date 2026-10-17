import type { FluidSim } from '../engine/fluid';
import type { Gpu } from '../engine/gl';
import type { Quality } from '../engine/quality';
import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { PointerTracker, type Pointer } from '../input/pointers';
import type { Toy, ToyEnv } from '../toys/Toy';
import { clamp } from '../util/color';
import { IdleDirector } from './idle';

export interface StageDeps {
  gpu: Gpu;
  sim: FluidSim;
  quality: Quality;
  audio: AudioEngine;
  haptics: Haptics;
  glCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
}

/**
 * Runs the active toy: routes touches, turns finger travel into notes and
 * vibration, keeps the idle director going, and steps + draws every frame.
 */
export class Stage {
  toy: Toy | null = null;
  readonly env: ToyEnv;
  private readonly tracker: PointerTracker;
  private readonly idle: IdleDirector;
  private readonly overlay: CanvasRenderingContext2D;
  private overlayDirty = false;

  constructor(private readonly deps: StageDeps) {
    const overlay = deps.overlayCanvas.getContext('2d');
    if (!overlay) throw new Error('2D canvas unavailable');
    this.overlay = overlay;
    this.env = {
      gpu: deps.gpu,
      sim: deps.sim,
      quality: deps.quality,
      audio: deps.audio,
      haptics: deps.haptics,
      view: { width: 1, height: 1 },
    };
    this.tracker = new PointerTracker(deps.glCanvas, {
      down: (p) => this.onDown(p),
      up: (p) => this.toy?.pointerUp(p),
    });
    // The ghost finger only demonstrates; on "quiet" toys (painting) it doesn't touch the paper.
    this.idle = new IdleDirector({
      down: (p) => {
        if (this.toy && !this.toy.quietIdle) this.toy.pointerDown(p);
      },
      up: (p) => {
        if (this.toy && !this.toy.quietIdle) this.toy.pointerUp(p);
      },
    });
    this.resize(true);
  }

  /** Starts a toy. `ui` is where it may mount its own controls (e.g. the brush toolbar). */
  setToy(toy: Toy, ui?: HTMLElement): void {
    this.clearToy();
    this.resize(false);
    this.toy = toy;
    toy.enter(this.env);
    if (ui) toy.mountUi(ui);
    toy.intro();
    this.idle.reset(performance.now());
    this.deps.quality.resetMeasurement();
  }

  clearToy(): void {
    this.tracker.releaseAll();
    this.toy?.unmountUi();
    this.toy?.exit();
    this.toy = null;
    this.deps.audio.setMotion(0);
    this.clearOverlay();
  }

  /** Lifts every finger (e.g. when the pause sheet opens mid-stroke). */
  releasePointers(): void {
    this.tracker.releaseAll();
    this.deps.audio.setMotion(0);
  }

  /** Rebuilds buffers after the quality tier changed (by the governor or in Settings). */
  applyQuality(): void {
    this.deps.sim.setQuality(this.deps.quality.settings);
    this.resize(true);
    this.toy?.onQualityChange();
  }

  frame(dt: number, rawDt: number, now: number): void {
    const toy = this.toy;
    if (!toy) return;
    const { sim, quality, audio } = this.deps;

    this.resize(false);
    if (quality.sample(rawDt, now)) this.applyQuality();

    const animDt = Math.min(rawDt, 0.05);
    this.idle.update(now, now - this.tracker.lastActivity, this.tracker.count > 0, toy, this.env.view);

    let fastest = 0;
    const moveDt = clamp(rawDt, 1 / 240, 0.1);
    for (const p of this.activePointers()) {
      const dx = p.x - p.frameX;
      const dy = p.y - p.frameY;
      const distance = Math.hypot(dx, dy);
      p.speed = p.speed * 0.7 + (distance / moveDt) * 0.3;
      if (distance > 0.5) {
        toy.pointerMove(p, p.frameX, p.frameY, moveDt);
        p.frameX = p.x;
        p.frameY = p.y;
        if (!p.synthetic) this.maybeNote(p, distance, now);
      }
      if (!p.synthetic) fastest = Math.max(fastest, p.speed);
    }
    const minDim = Math.min(this.env.view.width, this.env.view.height);
    audio.setMotion(fastest / (minDim * 3));

    toy.update(dt);
    sim.step(dt);
    toy.render();
    this.drawOverlay(toy, animDt, now);
  }

  private *activePointers(): Iterable<Pointer> {
    yield* this.tracker.pointers.values();
    const ghost = this.idle.pointer;
    if (ghost && !this.toy?.quietIdle) yield ghost;
  }

  private onDown(p: Pointer): void {
    const toy = this.toy;
    if (!toy) return;
    this.idle.noteTouch();
    toy.pointerDown(p);
    const { width, height } = this.env.view;
    this.deps.audio.note(p.x / width, 1 - p.y / height, 0.6);
    this.deps.haptics.tap(0.5);
    p.lastNoteAt = performance.now();
  }

  /** One note per stretch of finger travel, so melody follows the gesture. */
  private maybeNote(p: Pointer, distance: number, now: number): void {
    const { width, height } = this.env.view;
    const minDim = Math.min(width, height);
    p.travel += distance;
    if (p.travel < minDim * 0.11 || now - p.lastNoteAt < 90) return;
    p.travel = 0;
    p.lastNoteAt = now;
    const intensity = clamp(p.speed / (minDim * 2.5), 0, 1);
    this.deps.audio.note(p.x / width, 1 - p.y / height, intensity);
    this.deps.haptics.tap(0.25 + intensity * 0.5);
  }

  private drawOverlay(toy: Toy, dt: number, now: number): void {
    const needed = toy.usesOverlay || this.idle.visible;
    if (!needed && !this.overlayDirty) return;
    const { width, height } = this.env.view;
    this.overlay.clearRect(0, 0, width, height);
    if (needed) {
      toy.drawOverlay(this.overlay, dt);
      this.idle.draw(this.overlay, toy.ghostColor, now);
    }
    this.overlayDirty = needed;
  }

  private clearOverlay(): void {
    const { width, height } = this.env.view;
    this.overlay.clearRect(0, 0, width, height);
    this.overlayDirty = false;
  }

  private resize(force: boolean): void {
    const { glCanvas, overlayCanvas, quality, sim } = this.deps;
    const width = glCanvas.clientWidth || window.innerWidth;
    const height = glCanvas.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const ratio = Math.min(dpr, quality.settings.pixelRatio);
    const pixelWidth = Math.max(1, Math.floor(width * ratio));
    const pixelHeight = Math.max(1, Math.floor(height * ratio));
    const view = this.env.view;
    if (!force && pixelWidth === glCanvas.width && pixelHeight === glCanvas.height && view.width === width) return;

    glCanvas.width = pixelWidth;
    glCanvas.height = pixelHeight;
    const overlayRatio = Math.min(dpr, 2);
    overlayCanvas.width = Math.floor(width * overlayRatio);
    overlayCanvas.height = Math.floor(height * overlayRatio);
    this.overlay.setTransform(overlayRatio, 0, 0, overlayRatio, 0, 0);
    this.overlayDirty = false;
    view.width = width;
    view.height = height;

    sim.resize();
    this.toy?.onResize();
  }
}
