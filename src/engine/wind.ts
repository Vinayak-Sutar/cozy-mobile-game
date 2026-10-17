import type { FBO, Gpu, Program } from './gl';
import windSource from './shaders/wind.frag?raw';

const COLS = 16;
const ROWS = 24;
/** Fastest velocity (sim texels per second) the 8-bit packing can represent. */
const SCALE = 400;

/**
 * A coarse copy of the fluid's velocity field on the CPU, refreshed every few
 * frames, so particles drawn outside the fluid (raindrops) drift with the air
 * you stir. 16x24 cells, 1.5 KB per read.
 */
export class WindField {
  private readonly fbo: FBO;
  private readonly program: Program;
  private readonly pixels = new Uint8Array(COLS * ROWS * 4);
  private hasData = false;

  constructor(private readonly gpu: Gpu) {
    const gl = gpu.gl;
    this.fbo = gpu.fbo(COLS, ROWS, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.NEAREST, gl.UNSIGNED_BYTE);
    this.program = gpu.program(windSource);
  }

  update(velocity: FBO): void {
    const { gpu } = this;
    const gl = gpu.gl;
    gl.disable(gl.BLEND);
    this.program.bind();
    gl.uniform1i(this.program.u('uVelocity'), velocity.attach(0));
    gl.uniform2f(this.program.u('uGrid'), COLS, ROWS);
    gl.uniform1f(this.program.u('uScale'), SCALE);
    gpu.blit(this.fbo);
    gl.readPixels(0, 0, COLS, ROWS, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    this.hasData = true;
  }

  /**
   * Wind at (u, v) in simulation space (0..1, y up), in sim texels per second,
   * bilinearly interpolated. Writes into `out` as [vx, vy].
   */
  sample(u: number, v: number, out: [number, number]): void {
    if (!this.hasData) {
      out[0] = 0;
      out[1] = 0;
      return;
    }
    const gx = Math.min(COLS - 1.001, Math.max(0, u * COLS - 0.5));
    const gy = Math.min(ROWS - 1.001, Math.max(0, v * ROWS - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    for (let axis = 0; axis < 2; axis++) {
      const at = (x: number, y: number): number => (this.pixels[(y * COLS + x) * 4 + axis] / 255 - 0.5) * 2 * SCALE;
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      out[axis] = top * (1 - fy) + bottom * fy;
    }
  }

  dispose(): void {
    this.gpu.deleteFbo(this.fbo);
  }
}
