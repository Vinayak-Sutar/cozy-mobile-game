import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { Bloom, Sunrays } from '../engine/post';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { hex, hsv, rand, scale } from '../util/color';
import displaySource from './shaders/glowInk.frag?raw';
import { Toy } from './Toy';

/** Neon ink swirling in a dark room. The "wow on first touch" toy. */
export class GlowInk extends Toy {
  readonly id = 'glow' as const;

  readonly simConfig: SimConfig = {
    curl: 18,
    velocityDissipation: 0.3,
    densityDissipation: 0.9,
    pressure: 0.8,
    splatRadius: 0.22,
    splatForce: 4200,
  };

  readonly sound: SoundTheme = {
    // A minor pentatonic: dreamy, never a wrong note.
    scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
    voice: 'bell',
    bed: 'pad',
    swish: { type: 'bandpass', low: 350, high: 1500, q: 0.8, gain: 0.05 },
  };

  private display: Program | null = null;
  private bloom: Bloom | null = null;
  private sunrays: Sunrays | null = null;
  private hueBase = Math.random();
  private bgTop = hex('#0d1030');
  private bgBottom = hex('#04050d');
  /** When set (menu backdrop), every colour stays within this band around a fixed hue. */
  private band: { hue: number; range: number } | null = null;

  /** Used by the menu backdrop: themed night sky and a narrow, matching colour band. */
  setLook(top: string, bottom: string, hue: number, range: number): void {
    this.bgTop = hex(top);
    this.bgBottom = hex(bottom);
    this.band = { hue, range };
    this.hueBase = hue;
  }

  strokeColor(pointer: Pointer): RGB {
    // Each finger gets its own hue; colours drift slowly while the finger moves.
    const age = performance.now() / 1000 - pointer.startTime;
    if (this.band) {
      const wave = Math.sin(pointer.stroke * 1.7 + age * 0.6);
      return scale(hsv(this.band.hue + wave * this.band.range, 0.7, 1), 0.06);
    }
    const hue = this.hueBase + pointer.stroke * 0.17 + age * 0.04;
    return scale(hsv(hue, 0.78, 1), 0.06);
  }

  protected override onEnter(): void {
    if (!this.band) this.hueBase = Math.random();
    this.buildPipeline();
  }

  override exit(): void {
    this.bloom?.dispose();
    this.sunrays?.dispose();
    this.bloom = null;
    this.sunrays = null;
  }

  override onResize(): void {
    this.bloom?.resize();
    this.sunrays?.resize();
  }

  override onQualityChange(): void {
    this.exit();
    this.buildPipeline();
  }

  override intro(): void {
    // A soft opening bloom of colour so the very first frame already glows.
    for (let i = 0; i < 5; i++) this.puff(0.55, rand(250, 450));
  }

  override ambient(): void {
    this.puff(0.16, rand(90, 170));
  }

  /** A swirl of colour circling the centre. Hues stay in a narrow band so idle time looks calm. */
  private puff(brightness: number, speed: number): void {
    const { width, height } = this.env.view;
    const angle = rand(0, Math.PI * 2);
    const r = Math.min(width, height) * rand(0.12, 0.34);
    const [u, v] = this.uv(width / 2 + Math.cos(angle) * r, height / 2 + Math.sin(angle) * r);
    const tangent = angle + Math.PI / 2;
    const drift = this.band ? rand(-this.band.range, this.band.range) : this.time * 0.02 + rand(-0.1, 0.1);
    const color = scale(hsv(this.hueBase + drift, 0.72, 1), brightness);
    this.env.sim.splat(u, v, Math.cos(tangent) * speed, -Math.sin(tangent) * speed, color, 1.5);
  }

  render(): void {
    const { gpu, sim } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display) return;

    const bloom = this.bloom?.apply(sim.dye.read);
    const rays = this.sunrays?.apply(sim.dye.read, sim.dye.write);

    display.bind();
    gl.uniform2f(display.u('texelSize'), 1 / gpu.width, 1 / gpu.height);
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    if (bloom) gl.uniform1i(display.u('uBloom'), bloom.attach(1));
    if (rays) gl.uniform1i(display.u('uSunrays'), rays.attach(2));
    gl.uniform3f(display.u('uBgTop'), ...this.bgTop);
    gl.uniform3f(display.u('uBgBottom'), ...this.bgBottom);
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform1f(display.u('uTime'), this.time);
    gpu.blit(null);
  }

  private buildPipeline(): void {
    const { gpu, quality } = this.env;
    const q = quality.settings;
    const defines: string[] = [];
    if (q.tier !== 'low') defines.push('SHADING');
    if (q.bloom) {
      defines.push('BLOOM');
      this.bloom = new Bloom(gpu, { resolution: 256, iterations: 8, intensity: 0.45, threshold: 0.6, softKnee: 0.7 });
    }
    if (q.sunrays) {
      defines.push('SUNRAYS');
      this.sunrays = new Sunrays(gpu, 196, 0.8);
    }
    this.display = gpu.program(displaySource, defines);
  }
}
