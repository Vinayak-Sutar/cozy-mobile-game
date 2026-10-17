import { store, type BrushId, type Wetness } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { FBO } from '../engine/gl';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { BrushToolbar } from '../ui/brushToolbar';
import { icons } from '../ui/icons';
import type { PauseAction } from '../ui/pause';
import { rand, scale } from '../util/color';
import { brushById, colorById, SIZES, wetnessById } from './brushes';
import { PaperRenderer, pigment } from './paper';
import { Toy } from './Toy';

const CLEAN_SECONDS = 0.6;

/**
 * Paint with Brush: the watercolour paper, but you choose the brush, size,
 * colour and how wet the paper is. Paint stays put (no fading), so this is
 * the toy for making a picture. Every stroke can be undone.
 */
export class BrushPaint extends Toy {
  readonly id = 'brush' as const;
  override readonly light = true;
  override readonly quietIdle = true;
  override readonly ghostColor = 'rgba(92, 72, 52, 0.75)';

  readonly simConfig: SimConfig = {
    curl: 4,
    velocityDissipation: 1.1,
    densityDissipation: 0,
    pressure: 0.7,
    splatRadius: 0.14,
    splatForce: 2200,
  };

  readonly sound: SoundTheme = {
    // G major pentatonic on the marimba.
    scale: [55, 59, 62, 64, 67, 69, 71, 74, 76, 79],
    voice: 'marimba',
    bed: 'paper',
    swish: { type: 'bandpass', low: 1500, high: 4000, q: 0.6, gain: 0.035 },
  };

  private renderer: PaperRenderer | null = null;
  private toolbar: BrushToolbar | null = null;
  private undoStack: FBO[] = [];
  private fingers = 0;
  private cleaning = 0;

  private get settings() {
    return store.data.brush;
  }

  private get brush() {
    return brushById(this.settings.brush);
  }

  private get size(): number {
    return SIZES[this.settings.size] ?? 1;
  }

  strokeColor(): RGB {
    return scale(pigment(colorById(this.settings.color).hex), 0.2);
  }

  mountUi(container: HTMLElement): void {
    this.toolbar = new BrushToolbar(
      container,
      this.settings,
      {
        pickBrush: (id: BrushId) => this.change({ brush: id }),
        pickSize: (index: number) => this.change({ size: index }),
        pickColor: (id: string) => this.change({ color: id }),
        pickWetness: (id: Wetness) => {
          this.change({ wetness: id });
          this.applyWetness();
        },
        undo: () => this.undo(),
      },
      this.env.audio,
      this.env.haptics,
    );
    this.toolbar.setCanUndo(this.undoStack.length > 0);
  }

  unmountUi(): void {
    this.toolbar?.destroy();
    this.toolbar = null;
  }

  override pauseActions(): PauseAction[] {
    return [{ label: 'Clean paper', icon: icons.sparkle, run: () => this.cleanPaper() }];
  }

  protected override onEnter(): void {
    this.renderer = new PaperRenderer(this.env.gpu);
    // Allow real, deep colours (charcoal, ultramarine) on this paper.
    this.renderer.depth = 2.4;
    this.renderer.enter();
    this.applyWetness();
    this.fingers = 0;
    this.cleaning = 0;
  }

  override exit(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.clearUndo();
  }

  override onResize(): void {
    this.renderer?.bake();
    // Snapshots no longer match the new buffer size.
    this.clearUndo();
  }

  override onQualityChange(): void {
    this.clearUndo();
  }

  // A fresh sheet of paper: no intro splashes, no idle paint.
  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    this.toolbar?.closeShelves();
    this.fingers++;
    if (this.fingers === 1 && !pointer.synthetic) this.saveUndo();

    const [u, v] = this.uv(pointer.x, pointer.y);
    const brush = this.brush;
    const radius = brush.radius * this.size;
    const { sim } = this.env;
    switch (brush.mode) {
      case 'paint':
        // A gentle dab where the brush lands.
        sim.splatDye(u, v, scale(this.strokeColor(), brush.pigment * 0.8), radius * 0.9);
        break;
      case 'splatter':
        this.splatter(pointer.x, pointer.y, 7);
        break;
      case 'water':
        this.drop(u, v, [0, 0, 0], 0.5 * wetnessById(this.settings.wetness).push);
        break;
      case 'lift':
        sim.liftDye(u, v, 0.35, radius);
        break;
    }
  }

  override pointerUp(_pointer: Pointer): void {
    this.fingers = Math.max(0, this.fingers - 1);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    const brush = this.brush;
    const wet = wetnessById(this.settings.wetness);
    const radius = brush.radius * this.size;
    const spacing = brush.spacing * Math.sqrt(this.size);

    if (brush.mode === 'splatter') {
      const distance = Math.hypot(pointer.x - x0, pointer.y - y0);
      // Drops per frame follow distance travelled, not frame rate.
      this.splatter(pointer.x, pointer.y, Math.min(5, Math.round(distance / spacing + Math.random() * 0.6)), x0, y0);
      return;
    }

    if (brush.mode === 'lift') {
      // Pull pigment out along the path, with a tiny nudge so it feels wet.
      const { sim } = this.env;
      const dx = pointer.x - x0;
      const dy = pointer.y - y0;
      const steps = Math.min(brush.maxSteps, Math.max(1, Math.ceil(Math.hypot(dx, dy) / spacing)));
      const strength = Math.min(0.5, 0.16 * Math.max(0.25, dt * 60));
      for (let i = 1; i <= steps; i++) {
        const [u, v] = this.uv(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
        sim.liftDye(u, v, strength, radius);
      }
      this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { radius, push: brush.push, pigment: 0, spacing: 30 });
      return;
    }

    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, {
      radius,
      push: brush.push * wet.push,
      pigment: brush.pigment,
      spacing,
      maxSteps: brush.maxSteps,
    });
  }

  override update(dt: number): void {
    super.update(dt);
    if (this.cleaning > 0) {
      this.cleaning -= dt;
      this.env.sim.scaleDye(this.cleaning > 0 ? Math.exp(-dt * 9) : 0);
    }
  }

  render(): void {
    this.renderer?.render(this.env.sim);
  }

  cleanPaper(): void {
    this.saveUndo();
    this.cleaning = CLEAN_SECONDS;
    this.env.audio.ui('open');
    this.env.haptics.tap(0.6);
  }

  private undo(): void {
    const snapshot = this.undoStack.pop();
    if (snapshot) {
      this.cleaning = 0;
      this.env.sim.restoreDye(snapshot);
      this.env.sim.clearVelocity();
      this.env.gpu.deleteFbo(snapshot);
    }
    this.toolbar?.setCanUndo(this.undoStack.length > 0);
  }

  /** Saves the paper as it is now. Low-end devices keep fewer steps to save memory. */
  private saveUndo(): void {
    const max = this.env.quality.settings.tier === 'low' ? 3 : 5;
    const recycled = this.undoStack.length >= max ? (this.undoStack.shift() ?? null) : null;
    this.undoStack.push(this.env.sim.snapshotDye(recycled));
    this.toolbar?.setCanUndo(true);
  }

  private clearUndo(): void {
    for (const fbo of this.undoStack) this.env.gpu.deleteFbo(fbo);
    this.undoStack = [];
    this.toolbar?.setCanUndo(false);
  }

  /** Flicked droplets scattered around the path (from x0,y0 to x,y). */
  private splatter(x: number, y: number, count: number, x0 = x, y0 = y): void {
    const { sim } = this.env;
    const spread = 34 * this.size;
    const color = this.strokeColor();
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const angle = rand(0, Math.PI * 2);
      // Most drops land near the brush, a few fly further out.
      const r = spread * Math.pow(Math.random(), 0.7);
      const [u, v] = this.uv(x0 + (x - x0) * t + Math.cos(angle) * r, y0 + (y - y0) * t + Math.sin(angle) * r);
      const big = Math.random() < 0.08;
      const size = (big ? rand(0.2, 0.36) : rand(0.025, 0.12)) * Math.sqrt(this.size);
      sim.splatDye(u, v, scale(color, rand(1.6, 3)), size);
    }
  }

  private applyWetness(): void {
    const wet = wetnessById(this.settings.wetness);
    this.env.sim.configure({
      ...this.simConfig,
      velocityDissipation: wet.velocityDissipation,
      curl: wet.curl,
    });
  }

  private change(patch: Partial<typeof store.data.brush>): void {
    Object.assign(store.data.brush, patch);
    store.save();
    this.toolbar?.update(this.settings);
  }
}
