import type { FBO, Gpu, Program } from './gl';
import bloomBlurSource from './shaders/bloomBlur.frag?raw';
import bloomFinalSource from './shaders/bloomFinal.frag?raw';
import bloomPrefilterSource from './shaders/bloomPrefilter.frag?raw';
import blurSource from './shaders/blur.frag?raw';
import blurVertexSource from './shaders/blur.vert?raw';
import sunraysSource from './shaders/sunrays.frag?raw';
import sunraysMaskSource from './shaders/sunraysMask.frag?raw';

export interface BloomConfig {
  resolution: number;
  iterations: number;
  intensity: number;
  threshold: number;
  softKnee: number;
}

/** Soft glow around bright dye: threshold, blur down a mip chain, add back up. */
export class Bloom {
  output!: FBO;
  private levels: FBO[] = [];
  private readonly prefilter: Program;
  private readonly blur: Program;
  private readonly final: Program;

  constructor(
    private readonly gpu: Gpu,
    readonly config: BloomConfig,
  ) {
    this.prefilter = gpu.program(bloomPrefilterSource);
    this.blur = gpu.program(bloomBlurSource);
    this.final = gpu.program(bloomFinalSource);
    this.resize();
  }

  resize(): void {
    const { gpu } = this;
    this.dispose();
    const res = gpu.resolution(this.config.resolution);
    this.output = gpu.fbo(res.width, res.height, gpu.rgba, gpu.filter);
    for (let i = 0; i < this.config.iterations; i++) {
      const width = res.width >> (i + 1);
      const height = res.height >> (i + 1);
      if (width < 2 || height < 2) break;
      this.levels.push(gpu.fbo(width, height, gpu.rgba, gpu.filter));
    }
  }

  apply(source: FBO): FBO {
    const { gpu, config } = this;
    const gl = gpu.gl;
    if (this.levels.length < 2) return this.output;

    let last = this.output;
    gl.disable(gl.BLEND);
    this.prefilter.bind();
    const knee = config.threshold * config.softKnee + 0.0001;
    gl.uniform3f(this.prefilter.u('curve'), config.threshold - knee, knee * 2, 0.25 / knee);
    gl.uniform1f(this.prefilter.u('threshold'), config.threshold);
    gl.uniform1i(this.prefilter.u('uTexture'), source.attach(0));
    gpu.blit(last);

    this.blur.bind();
    for (const dest of this.levels) {
      gl.uniform2f(this.blur.u('texelSize'), last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.blur.u('uTexture'), last.attach(0));
      gpu.blit(dest);
      last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const base = this.levels[i];
      gl.uniform2f(this.blur.u('texelSize'), last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.blur.u('uTexture'), last.attach(0));
      gpu.blit(base);
      last = base;
    }
    gl.disable(gl.BLEND);

    this.final.bind();
    gl.uniform2f(this.final.u('texelSize'), last.texelSizeX, last.texelSizeY);
    gl.uniform1i(this.final.u('uTexture'), last.attach(0));
    gl.uniform1f(this.final.u('intensity'), config.intensity);
    gpu.blit(this.output);
    return this.output;
  }

  dispose(): void {
    if (this.output) this.gpu.deleteFbo(this.output);
    for (const level of this.levels) this.gpu.deleteFbo(level);
    this.levels = [];
  }
}

/** God-rays radiating from the centre through gaps in the dye. */
export class Sunrays {
  output!: FBO;
  private temp!: FBO;
  private readonly mask: Program;
  private readonly rays: Program;
  private readonly blur: Program;

  constructor(
    private readonly gpu: Gpu,
    private readonly resolution: number,
    public weight: number,
  ) {
    this.mask = gpu.program(sunraysMaskSource);
    this.rays = gpu.program(sunraysSource);
    this.blur = gpu.program(blurSource, [], blurVertexSource);
    this.resize();
  }

  resize(): void {
    const { gpu } = this;
    this.dispose();
    const res = gpu.resolution(this.resolution);
    this.output = gpu.fbo(res.width, res.height, gpu.r, gpu.filter);
    this.temp = gpu.fbo(res.width, res.height, gpu.r, gpu.filter);
  }

  /** `scratch` is any dye-sized buffer we may overwrite (the dye's write buffer works). */
  apply(source: FBO, scratch: FBO): FBO {
    const { gpu } = this;
    const gl = gpu.gl;
    gl.disable(gl.BLEND);

    this.mask.bind();
    gl.uniform1i(this.mask.u('uTexture'), source.attach(0));
    gpu.blit(scratch);

    this.rays.bind();
    gl.uniform1f(this.rays.u('weight'), this.weight);
    gl.uniform1i(this.rays.u('uTexture'), scratch.attach(0));
    gpu.blit(this.output);

    this.blur.bind();
    gl.uniform2f(this.blur.u('texelSize'), this.output.texelSizeX, 0);
    gl.uniform1i(this.blur.u('uTexture'), this.output.attach(0));
    gpu.blit(this.temp);
    gl.uniform2f(this.blur.u('texelSize'), 0, this.output.texelSizeY);
    gl.uniform1i(this.blur.u('uTexture'), this.temp.attach(0));
    gpu.blit(this.output);
    return this.output;
  }

  dispose(): void {
    if (this.output) this.gpu.deleteFbo(this.output);
    if (this.temp) this.gpu.deleteFbo(this.temp);
  }
}
