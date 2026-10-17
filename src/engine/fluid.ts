import type { DoubleFBO, FBO, Gpu, Program } from './gl';
import advectionSource from './shaders/advection.frag?raw';
import clearSource from './shaders/clear.frag?raw';
import curlSource from './shaders/curl.frag?raw';
import divergenceSource from './shaders/divergence.frag?raw';
import forceSource from './shaders/force.frag?raw';
import gradientSubtractSource from './shaders/gradientSubtract.frag?raw';
import pressureSource from './shaders/pressure.frag?raw';
import splatSource from './shaders/splat.frag?raw';
import vorticitySource from './shaders/vorticity.frag?raw';

export type RGB = [number, number, number];

/** How a toy's fluid behaves. */
export interface SimConfig {
  /** Swirliness (vorticity confinement). */
  curl: number;
  /** How quickly motion calms down. */
  velocityDissipation: number;
  /** How quickly colour fades. */
  densityDissipation: number;
  /** Fraction of last frame's pressure kept (helps the solver converge). */
  pressure: number;
  /** Splat size, in hundredths of the screen (like the original demo). */
  splatRadius: number;
  /** Multiplier from finger speed to fluid velocity. */
  splatForce: number;
  /** How strongly dye (its red channel) sinks, like water falling through air. 0 = off. */
  buoyancy?: number;
}

/** The parts of a quality tier the simulation cares about. */
export interface SimQuality {
  simRes: number;
  dyeRes: number;
  pressureIterations: number;
}

export const DEFAULT_SIM: SimConfig = {
  curl: 25,
  velocityDissipation: 0.25,
  densityDissipation: 1,
  pressure: 0.8,
  splatRadius: 0.22,
  splatForce: 5000,
};

/**
 * Stable-fluids solver on the GPU (after GPU Gems ch. 38 and Pavel Dobryakov's
 * MIT-licensed WebGL demo). Velocity lives on a coarse grid, dye on a finer one.
 */
export class FluidSim {
  config: SimConfig = { ...DEFAULT_SIM };
  dye!: DoubleFBO;
  velocity!: DoubleFBO;
  private divergence!: FBO;
  private curlField!: FBO;
  private pressure!: DoubleFBO;
  private quality: SimQuality;

  private readonly splatProgram: Program;
  private readonly liftProgram: Program;
  private readonly curlProgram: Program;
  private readonly vorticityProgram: Program;
  private readonly divergenceProgram: Program;
  private readonly clearProgram: Program;
  private readonly pressureProgram: Program;
  private readonly gradientProgram: Program;
  private readonly advectionProgram: Program;
  private readonly forceProgram: Program;

  constructor(
    private readonly gpu: Gpu,
    quality: SimQuality,
  ) {
    this.quality = quality;
    this.splatProgram = gpu.program(splatSource);
    this.liftProgram = gpu.program(splatSource, ['MULTIPLY']);
    this.curlProgram = gpu.program(curlSource);
    this.vorticityProgram = gpu.program(vorticitySource);
    this.divergenceProgram = gpu.program(divergenceSource);
    this.clearProgram = gpu.program(clearSource);
    this.pressureProgram = gpu.program(pressureSource);
    this.gradientProgram = gpu.program(gradientSubtractSource);
    this.advectionProgram = gpu.program(advectionSource, gpu.linearFiltering ? [] : ['MANUAL_FILTERING']);
    this.forceProgram = gpu.program(forceSource);
    this.initFramebuffers();
  }

  get aspect(): number {
    return this.gpu.aspect;
  }

  configure(config: Partial<SimConfig>): void {
    this.config = { ...DEFAULT_SIM, ...config };
  }

  setQuality(quality: SimQuality): void {
    this.quality = quality;
    this.initFramebuffers();
  }

  /** Call after the canvas changes size; keeps the current picture. */
  resize(): void {
    this.initFramebuffers();
  }

  clear(): void {
    const { gpu } = this;
    for (const target of [this.dye, this.velocity, this.pressure]) {
      gpu.clearFbo(target.read);
      gpu.clearFbo(target.write);
    }
  }

  /** Pushes fluid with velocity (dx, dy) and adds `color` at (x, y) in 0..1 screen space (y up). */
  splat(x: number, y: number, dx: number, dy: number, color: RGB, radiusScale = 1): void {
    this.splatVelocity(x, y, dx, dy, radiusScale);
    this.splatDye(x, y, color, radiusScale);
  }

  splatVelocity(x: number, y: number, dx: number, dy: number, radiusScale = 1): void {
    this.splatInto(this.velocity, x, y, [dx, dy, 0], radiusScale);
  }

  splatDye(x: number, y: number, color: RGB, radiusScale = 1): void {
    this.splatInto(this.dye, x, y, color, radiusScale);
  }

  /** Pulls pigment out: each channel of existing dye is scaled by (1 - strength x falloff). Never goes negative. */
  liftDye(x: number, y: number, strength: number, radiusScale = 1): void {
    const k = Math.min(1, Math.max(0, strength));
    this.stamp(this.liftProgram, this.dye.read, x, y, [k, k, k], radiusScale, 'multiply');
  }

  /** Multiplies all dye by `factor` (used to gently wash the paper clean). */
  scaleDye(factor: number): void {
    const gl = this.gpu.gl;
    gl.disable(gl.BLEND);
    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.u('uTexture'), this.dye.read.attach(0));
    gl.uniform1f(this.clearProgram.u('value'), factor);
    this.gpu.blit(this.dye.write);
    this.dye.swap();
  }

  /** Stops all motion (after an undo, so restored paint doesn't keep sliding). */
  clearVelocity(): void {
    this.gpu.clearFbo(this.velocity.read);
    this.gpu.clearFbo(this.velocity.write);
    this.gpu.clearFbo(this.pressure.read);
    this.gpu.clearFbo(this.pressure.write);
  }

  /** Copies the current dye into `target` (allocating it if needed) for undo. */
  snapshotDye(target: FBO | null): FBO {
    const { gpu } = this;
    const fbo =
      target && target.width === this.dye.width && target.height === this.dye.height
        ? target
        : gpu.fbo(this.dye.width, this.dye.height, gpu.rgba, gpu.filter);
    if (target && fbo !== target) gpu.deleteFbo(target);
    gpu.copy(this.dye.read, fbo);
    return fbo;
  }

  /** Restores dye saved by snapshotDye. Returns false if the size changed since. */
  restoreDye(snapshot: FBO): boolean {
    if (snapshot.width !== this.dye.width || snapshot.height !== this.dye.height) return false;
    this.gpu.copy(snapshot, this.dye.read);
    return true;
  }

  step(dt: number): void {
    const { gpu, config } = this;
    const gl = gpu.gl;
    const velocity = this.velocity;
    gl.disable(gl.BLEND);

    this.curlProgram.bind();
    gl.uniform2f(this.curlProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.curlProgram.u('uVelocity'), velocity.read.attach(0));
    gpu.blit(this.curlField);

    this.vorticityProgram.bind();
    gl.uniform2f(this.vorticityProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgram.u('uVelocity'), velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgram.u('uCurl'), this.curlField.attach(1));
    gl.uniform1f(this.vorticityProgram.u('curl'), config.curl);
    gl.uniform1f(this.vorticityProgram.u('dt'), dt);
    gpu.blit(velocity.write);
    velocity.swap();

    if (config.buoyancy) {
      this.forceProgram.bind();
      gl.uniform2f(this.forceProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(this.forceProgram.u('uVelocity'), velocity.read.attach(0));
      gl.uniform1i(this.forceProgram.u('uDye'), this.dye.read.attach(1));
      gl.uniform1f(this.forceProgram.u('uBuoyancy'), config.buoyancy);
      gl.uniform1f(this.forceProgram.u('dt'), dt);
      gpu.blit(velocity.write);
      velocity.swap();
    }

    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.u('uVelocity'), velocity.read.attach(0));
    gpu.blit(this.divergence);

    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.u('uTexture'), this.pressure.read.attach(0));
    gl.uniform1f(this.clearProgram.u('value'), config.pressure);
    gpu.blit(this.pressure.write);
    this.pressure.swap();

    this.pressureProgram.bind();
    gl.uniform2f(this.pressureProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.pressureProgram.u('uDivergence'), this.divergence.attach(0));
    for (let i = 0; i < this.quality.pressureIterations; i++) {
      gl.uniform1i(this.pressureProgram.u('uPressure'), this.pressure.read.attach(1));
      gpu.blit(this.pressure.write);
      this.pressure.swap();
    }

    this.gradientProgram.bind();
    gl.uniform2f(this.gradientProgram.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(this.gradientProgram.u('uPressure'), this.pressure.read.attach(0));
    gl.uniform1i(this.gradientProgram.u('uVelocity'), velocity.read.attach(1));
    gpu.blit(velocity.write);
    velocity.swap();

    const advection = this.advectionProgram;
    advection.bind();
    gl.uniform2f(advection.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY);
    if (!gpu.linearFiltering) {
      gl.uniform2f(advection.u('dyeTexelSize'), velocity.texelSizeX, velocity.texelSizeY);
    }
    const velocityUnit = velocity.read.attach(0);
    gl.uniform1i(advection.u('uVelocity'), velocityUnit);
    gl.uniform1i(advection.u('uSource'), velocityUnit);
    gl.uniform1f(advection.u('dt'), dt);
    gl.uniform1f(advection.u('dissipation'), config.velocityDissipation);
    gpu.blit(velocity.write);
    velocity.swap();

    if (!gpu.linearFiltering) {
      gl.uniform2f(advection.u('dyeTexelSize'), this.dye.texelSizeX, this.dye.texelSizeY);
    }
    gl.uniform1i(advection.u('uVelocity'), velocity.read.attach(0));
    gl.uniform1i(advection.u('uSource'), this.dye.read.attach(1));
    gl.uniform1f(advection.u('dissipation'), config.densityDissipation);
    gpu.blit(this.dye.write);
    this.dye.swap();
  }

  private splatInto(target: DoubleFBO, x: number, y: number, value: RGB, radiusScale: number): void {
    this.stamp(this.splatProgram, target.read, x, y, value, radiusScale, 'add');
  }

  /**
   * Draws one Gaussian stamp straight into `fbo` with blending, limited by a
   * scissor box to where the stamp is visible. Much cheaper than redrawing the
   * whole texture per splat, which matters for brushes that stamp a lot.
   */
  private stamp(
    program: Program,
    fbo: FBO,
    x: number,
    y: number,
    value: RGB,
    radiusScale: number,
    blend: 'add' | 'multiply',
  ): void {
    const gl = this.gpu.gl;
    const radius = this.correctRadius((this.config.splatRadius / 100) * radiusScale);
    // Beyond ~3.2 standard widths the Gaussian is below 1e-4: invisible.
    const extentY = 3.2 * Math.sqrt(radius);
    const extentX = extentY / this.aspect;
    const x0 = Math.max(0, Math.floor((x - extentX) * fbo.width));
    const x1 = Math.min(fbo.width, Math.ceil((x + extentX) * fbo.width));
    const y0 = Math.max(0, Math.floor((y - extentY) * fbo.height));
    const y1 = Math.min(fbo.height, Math.ceil((y + extentY) * fbo.height));
    if (x1 <= x0 || y1 <= y0) return;

    program.bind();
    gl.uniform1f(program.u('aspectRatio'), this.aspect);
    gl.uniform2f(program.u('point'), x, y);
    gl.uniform3f(program.u('color'), value[0], value[1], value[2]);
    gl.uniform1f(program.u('radius'), radius);
    gl.enable(gl.BLEND);
    if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x0, y0, x1 - x0, y1 - y0);
    this.gpu.blit(fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
  }

  private correctRadius(radius: number): number {
    const aspect = this.aspect;
    return aspect > 1 ? radius * aspect : radius;
  }

  private initFramebuffers(): void {
    const { gpu } = this;
    const gl = gpu.gl;
    const simRes = gpu.resolution(this.quality.simRes);
    const dyeRes = gpu.resolution(this.quality.dyeRes);
    const filter = gpu.filter;
    gl.disable(gl.BLEND);

    this.dye = this.dye
      ? gpu.resizeDoubleFbo(this.dye, dyeRes.width, dyeRes.height, gpu.rgba, filter)
      : gpu.doubleFbo(dyeRes.width, dyeRes.height, gpu.rgba, filter);
    this.velocity = this.velocity
      ? gpu.resizeDoubleFbo(this.velocity, simRes.width, simRes.height, gpu.rg, filter)
      : gpu.doubleFbo(simRes.width, simRes.height, gpu.rg, filter);

    if (this.divergence) gpu.deleteFbo(this.divergence);
    if (this.curlField) gpu.deleteFbo(this.curlField);
    if (this.pressure) gpu.deleteDoubleFbo(this.pressure);
    this.divergence = gpu.fbo(simRes.width, simRes.height, gpu.r, gl.NEAREST);
    this.curlField = gpu.fbo(simRes.width, simRes.height, gpu.r, gl.NEAREST);
    this.pressure = gpu.doubleFbo(simRes.width, simRes.height, gpu.r, gl.NEAREST);
  }
}
