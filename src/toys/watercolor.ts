import type { RGB, SimConfig } from '../engine/fluid';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { hex, rand, scale } from '../util/color';
import { CREAM_PAPER, PaperRenderer, pigment } from './paper';
import { Toy } from './Toy';

/** The pastel set, as absorption values. */
const PASTELS = ['#e88c9e', '#f5ab84', '#f7d775', '#97c49a', '#8cbae6', '#b49de0'];

/** Soft watercolour on cream paper. Calm, slow, and the colours really mix. */
export class Watercolor extends Toy {
  readonly id = 'paint' as const;
  override readonly light = true;
  override readonly ghostColor = 'rgba(92, 72, 52, 0.75)';

  readonly simConfig: SimConfig = {
    curl: 4,
    velocityDissipation: 1.1,
    densityDissipation: 0.05,
    pressure: 0.7,
    splatRadius: 0.14,
    splatForce: 2200,
  };

  readonly sound: SoundTheme = {
    // F major pentatonic on a soft marimba.
    scale: [53, 57, 60, 62, 65, 67, 69, 72, 74, 77],
    voice: 'marimba',
    bed: 'paper',
    // A higher, airy band reads like a brush on paper.
    swish: { type: 'bandpass', low: 1600, high: 4200, q: 0.6, gain: 0.035 },
  };

  private renderer: PaperRenderer | null = null;
  private paperColor = CREAM_PAPER;
  private palette: RGB[] = PASTELS.map((c) => pigment(c));

  /** Used by the menu backdrop: themed paper and paints. */
  setLook(paper: string, colors: string[]): void {
    this.paperColor = paper;
    this.palette = colors.map((c) => pigment(c, paper));
    if (this.renderer) this.renderer.paper = hex(paper);
  }

  strokeColor(pointer: Pointer): RGB {
    return scale(this.palette[pointer.stroke % this.palette.length], 0.19);
  }

  override pointerDown(pointer: Pointer): void {
    const [u, v] = this.uv(pointer.x, pointer.y);
    // A wet drop that blooms outward like paint touching damp paper.
    this.drop(u, v, this.strokeColor(pointer), 0.6);
  }

  override intro(): void {
    for (let i = 0; i < 2; i++) this.paintDrop(0.45);
  }

  override ambient(): void {
    // Mostly just keep the water gently moving; now and then a faint drop of colour.
    if (Math.random() < 0.35) {
      this.paintDrop(0.3);
      return;
    }
    const { width, height } = this.env.view;
    const [u, v] = this.uv(rand(0.2, 0.8) * width, rand(0.2, 0.8) * height);
    const angle = rand(0, Math.PI * 2);
    this.env.sim.splatVelocity(u, v, Math.cos(angle) * 60, Math.sin(angle) * 60, 2.5);
  }

  protected override onEnter(): void {
    this.renderer = new PaperRenderer(this.env.gpu);
    this.renderer.paper = hex(this.paperColor);
    this.renderer.enter();
  }

  override exit(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  override onResize(): void {
    this.renderer?.bake();
  }

  render(): void {
    this.renderer?.render(this.env.sim);
  }

  private paintDrop(strength: number): void {
    const { width, height } = this.env.view;
    const [u, v] = this.uv(rand(0.15, 0.85) * width, rand(0.15, 0.85) * height);
    const color = this.palette[Math.floor(rand(0, this.palette.length))];
    this.drop(u, v, scale(color, 0.26), strength);
  }
}
