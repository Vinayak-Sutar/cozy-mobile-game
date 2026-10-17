import type { RGB } from './fluid';
import type { FBO, Gpu, Program } from './gl';
import probeSource from './shaders/probe.frag?raw';

export const MAX_PROBES = 8;

/**
 * Reads how much dye sits at a few points, so gameplay can react to the fluid
 * (e.g. "is this seed getting water?", "what colour is in the dish?").
 * Samples into a tiny 8x1 texture and reads back 32 bytes. Call it every few
 * frames, not every frame: readPixels makes the CPU wait for the GPU.
 */
export class Probe {
  private readonly fbo: FBO;
  private readonly program: Program;
  private readonly rgbProgram: Program;
  private readonly points = new Float32Array(MAX_PROBES * 2);
  private readonly pixels = new Uint8Array(MAX_PROBES * 4);

  constructor(private readonly gpu: Gpu) {
    const gl = gpu.gl;
    this.fbo = gpu.fbo(MAX_PROBES, 1, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.NEAREST, gl.UNSIGNED_BYTE);
    this.program = gpu.program(probeSource);
    this.rgbProgram = gpu.program(probeSource, ['RGB']);
  }

  /**
   * Writes the red-channel amount at each point (0..1) into `out`.
   * Points are in simulation space (0..1, y up); `radius` is a fraction of screen height.
   */
  read(source: FBO, points: readonly [number, number][], radius: number, scale: number, out: number[]): void {
    const count = this.sample(this.program, source, points, radius, scale);
    for (let i = 0; i < count; i++) out[i] = this.pixels[i * 4] / 255;
  }

  /** Like `read`, but all three channels: each is the dye value times `scale`, clamped to 0..1. */
  readRgb(source: FBO, points: readonly [number, number][], radius: number, scale: number, out: RGB[]): void {
    const count = this.sample(this.rgbProgram, source, points, radius, scale);
    for (let i = 0; i < count; i++) {
      out[i] = [this.pixels[i * 4] / 255, this.pixels[i * 4 + 1] / 255, this.pixels[i * 4 + 2] / 255];
    }
  }

  dispose(): void {
    this.gpu.deleteFbo(this.fbo);
  }

  private sample(program: Program, source: FBO, points: readonly [number, number][], radius: number, scale: number): number {
    const { gpu } = this;
    const gl = gpu.gl;
    const count = Math.min(points.length, MAX_PROBES);
    this.points.fill(-1);
    for (let i = 0; i < count; i++) {
      this.points[i * 2] = points[i][0];
      this.points[i * 2 + 1] = points[i][1];
    }
    gl.disable(gl.BLEND);
    program.bind();
    gl.uniform1i(program.u('uTexture'), source.attach(0));
    gl.uniform2fv(program.u('uPoints[0]'), this.points);
    gl.uniform1f(program.u('uRadius'), radius);
    gl.uniform1f(program.u('uAspect'), gpu.aspect);
    gl.uniform1f(program.u('uScale'), scale);
    gpu.blit(this.fbo);
    gl.readPixels(0, 0, MAX_PROBES, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    return count;
  }
}
