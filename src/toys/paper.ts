import type { FluidSim, RGB } from '../engine/fluid';
import type { FBO, Gpu, Program } from '../engine/gl';
import { hex, rand } from '../util/color';
import paperSource from './shaders/paper.frag?raw';
import displaySource from './shaders/watercolor.frag?raw';

export const CREAM_PAPER = '#faf3e6';

/**
 * A pigment is stored as how much of each colour channel it absorbs from the
 * paper (Beer-Lambert), so overlapping paints multiply like real watercolour.
 */
export function pigment(color: string, paper: string = CREAM_PAPER): RGB {
  const target = hex(color);
  const base = hex(paper);
  return target.map((value, i) => Math.max(0, -Math.log(Math.max(value, 0.02) / base[i]))) as RGB;
}

/**
 * Shared watercolour look: bakes a paper-grain texture once per size and
 * draws the fluid's pigment onto it. Used by Paint and Paint with Brush.
 */
export class PaperRenderer {
  paper: RGB = hex(CREAM_PAPER);
  /** How deep heavy layers may get. Low keeps everything pastel; high allows ink-dark colours. */
  depth = 0.85;
  private display: Program | null = null;
  private grainProgram: Program | null = null;
  private grain: FBO | null = null;
  private seed: [number, number] = [0, 0];

  constructor(private readonly gpu: Gpu) {}

  enter(): void {
    this.display = this.gpu.program(displaySource);
    this.grainProgram = this.gpu.program(paperSource);
    this.seed = [rand(0, 100), rand(0, 100)];
    this.bake();
  }

  dispose(): void {
    if (this.grain) this.gpu.deleteFbo(this.grain);
    this.grain = null;
  }

  /** Paper grain is static, so render it once into a texture instead of every frame. */
  bake(): void {
    const { gpu } = this;
    const gl = gpu.gl;
    const program = this.grainProgram;
    if (!program) return;
    this.dispose();
    this.grain = gpu.fbo(gpu.width, gpu.height, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.LINEAR, gl.UNSIGNED_BYTE);
    program.bind();
    gl.uniform1f(program.u('uAspect'), gpu.aspect);
    gl.uniform2f(program.u('uSeed'), this.seed[0], this.seed[1]);
    gpu.blit(this.grain);
  }

  render(sim: FluidSim): void {
    const { gpu } = this;
    const gl = gpu.gl;
    const display = this.display;
    if (!display || !this.grain) return;
    gl.disable(gl.BLEND);
    display.bind();
    // Look a couple of texels out for the wet-edge darkening.
    gl.uniform2f(display.u('texelSize'), sim.dye.texelSizeX * 2.5, sim.dye.texelSizeY * 2.5);
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uPaper'), this.grain.attach(1));
    gl.uniform3f(display.u('uPaperColor'), ...this.paper);
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform1f(display.u('uDepth'), this.depth);
    gpu.blit(null);
  }
}
