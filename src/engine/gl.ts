import baseVertexSource from './shaders/base.vert?raw';
import copySource from './shaders/copy.frag?raw';
import noiseSource from './shaders/noise.glsl?raw';

export type GL = WebGLRenderingContext | WebGL2RenderingContext;

export interface TexFormat {
  internalFormat: number;
  format: number;
}

export interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  /** Binds the texture to a unit and returns the unit, ready for `uniform1i`. */
  attach(unit: number): number;
}

export interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

export class Program {
  readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: GL,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ) {
    const program = gl.createProgram();
    if (!program) throw new Error('Could not create WebGL program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) this.uniforms.set(info.name, gl.getUniformLocation(program, info.name));
    }
  }

  bind(): void {
    this.gl.useProgram(this.program);
  }

  /** Uniform location, or null if the shader compiler optimised it away (gl.uniform* ignores null). */
  u(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }
}

/**
 * Thin WebGL wrapper: context + capability detection, shader compilation,
 * framebuffer helpers and a full-screen quad blit.
 */
export class Gpu {
  readonly gl: GL;
  readonly isWebGL2: boolean;
  readonly halfFloatType: number;
  readonly rgba: TexFormat;
  readonly rg: TexFormat;
  readonly r: TexFormat;
  readonly linearFiltering: boolean;
  readonly renderer: string;
  private readonly vertexShaders = new Map<string, WebGLShader>();
  private readonly programs = new Map<string, Program>();
  private readonly copyProgram: Program;

  static create(canvas: HTMLCanvasElement): Gpu | null {
    try {
      return new Gpu(canvas);
    } catch (err) {
      console.error('[drift] WebGL init failed:', err);
      return null;
    }
  }

  private constructor(readonly canvas: HTMLCanvasElement) {
    const params: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    };
    let gl: GL | null = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params) ?? (canvas.getContext('experimental-webgl', params) as GL | null);
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.isWebGL2 = isWebGL2;

    let halfFloatType: number;
    let linearFiltering: boolean;
    let rgba: TexFormat | null;
    let rg: TexFormat | null;
    let r: TexFormat | null;

    if (isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      gl2.getExtension('EXT_color_buffer_float');
      gl2.getExtension('EXT_color_buffer_half_float');
      // 16-bit float textures are filterable in core WebGL2.
      linearFiltering = true;
      halfFloatType = gl2.HALF_FLOAT;
      rgba = this.supportedFormat(gl2.RGBA16F, gl2.RGBA, halfFloatType);
      rg = this.supportedFormat(gl2.RG16F, gl2.RG, halfFloatType);
      r = this.supportedFormat(gl2.R16F, gl2.RED, halfFloatType);
    } else {
      const halfFloat = gl.getExtension('OES_texture_half_float');
      if (!halfFloat) throw new Error('Half-float textures are not supported');
      linearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
      halfFloatType = halfFloat.HALF_FLOAT_OES;
      rgba = this.supportedFormat(gl.RGBA, gl.RGBA, halfFloatType);
      rg = rgba;
      r = rgba;
    }
    if (!rgba || !rg || !r) throw new Error('No renderable half-float texture format');

    this.halfFloatType = halfFloatType;
    this.linearFiltering = linearFiltering;
    this.rgba = rgba;
    this.rg = rg;
    this.r = r;
    this.renderer = readRenderer(gl);

    this.initQuad();
    this.copyProgram = this.program(copySource);
  }

  get width(): number {
    return this.gl.drawingBufferWidth;
  }

  get height(): number {
    return this.gl.drawingBufferHeight;
  }

  get aspect(): number {
    return this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
  }

  get filter(): number {
    return this.linearFiltering ? this.gl.LINEAR : this.gl.NEAREST;
  }

  /**
   * Compiles (or reuses) a program. `defines` become `#define` lines;
   * `#include <noise>` pulls in noise.glsl. Programs are cached, so toys can
   * ask for theirs every time they open without recompiling.
   */
  program(fragmentSource: string, defines: string[] = [], vertexSource: string = baseVertexSource): Program {
    const header = defines.map((d) => `#define ${d}\n`).join('');
    const key = `${vertexSource}\n//--\n${header}${fragmentSource}`;
    const cached = this.programs.get(key);
    if (cached) return cached;

    let vs = this.vertexShaders.get(vertexSource);
    if (!vs) {
      vs = this.compile(this.gl.VERTEX_SHADER, vertexSource);
      this.vertexShaders.set(vertexSource, vs);
    }
    const fs = this.compile(this.gl.FRAGMENT_SHADER, header + fragmentSource.replace('#include <noise>', noiseSource));
    const program = new Program(this.gl, vs, fs);
    this.programs.set(key, program);
    return program;
  }

  /** Resolution of a simulation buffer whose short side is `resolution`, matching the screen's aspect. */
  resolution(resolution: number): { width: number; height: number } {
    let aspect = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspect);
    return this.gl.drawingBufferWidth > this.gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  fbo(w: number, h: number, format: TexFormat, filter: number, type: number = this.halfFloatType): FBO {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) throw new Error('Could not allocate framebuffer');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, w, h, 0, format.format, type, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(unit: number) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      },
    };
  }

  doubleFbo(w: number, h: number, format: TexFormat, filter: number): DoubleFBO {
    let fbo1 = this.fbo(w, h, format, filter);
    let fbo2 = this.fbo(w, h, format, filter);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value) {
        fbo2 = value;
      },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  /** Copies one framebuffer's texture into another (stretched if sizes differ). */
  copy(source: FBO, target: FBO): void {
    this.gl.disable(this.gl.BLEND);
    this.copyProgram.bind();
    this.gl.uniform1i(this.copyProgram.u('uTexture'), source.attach(0));
    this.blit(target);
  }

  /** Resizes a framebuffer, carrying its current contents across (stretched). */
  resizeFbo(target: FBO, w: number, h: number, format: TexFormat, filter: number): FBO {
    const next = this.fbo(w, h, format, filter);
    this.copyProgram.bind();
    this.gl.uniform1i(this.copyProgram.u('uTexture'), target.attach(0));
    this.blit(next);
    this.deleteFbo(target);
    return next;
  }

  resizeDoubleFbo(target: DoubleFBO, w: number, h: number, format: TexFormat, filter: number): DoubleFBO {
    if (target.width === w && target.height === h) return target;
    target.read = this.resizeFbo(target.read, w, h, format, filter);
    this.deleteFbo(target.write);
    target.write = this.fbo(w, h, format, filter);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1 / w;
    target.texelSizeY = 1 / h;
    return target;
  }

  deleteFbo(target: FBO): void {
    this.gl.deleteFramebuffer(target.fbo);
    this.gl.deleteTexture(target.texture);
  }

  deleteDoubleFbo(target: DoubleFBO): void {
    this.deleteFbo(target.read);
    this.deleteFbo(target.write);
  }

  /** Clears a framebuffer to a colour (black by default) without drawing anything. */
  clearFbo(target: FBO, color: readonly [number, number, number] = [0, 0, 0]): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(color[0], color[1], color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Uploads a 2D canvas as a texture (e.g. a picture drawn with canvas paths). Reuses `existing` if given. */
  uploadCanvas(canvas: HTMLCanvasElement, existing: WebGLTexture | null = null): WebGLTexture {
    const gl = this.gl;
    const texture = existing ?? gl.createTexture();
    if (!texture) throw new Error('Could not allocate texture');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    return texture;
  }

  /** Binds a plain texture to a unit and returns the unit, ready for `uniform1i`. */
  bindTexture(texture: WebGLTexture, unit: number): number {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    return unit;
  }

  /** Draws the full-screen quad into `target`, or the screen when `target` is null. */
  blit(target: FBO | null): void {
    const gl = this.gl;
    if (target === null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  private initQuad(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  private supportedFormat(internalFormat: number, format: number, type: number): TexFormat | null {
    if (this.canRenderTo(internalFormat, format, type)) return { internalFormat, format };
    const gl2 = this.gl as WebGL2RenderingContext;
    if (!this.isWebGL2) return null;
    // Fall back to wider formats when narrower ones are not renderable on this GPU.
    if (internalFormat === gl2.R16F) return this.supportedFormat(gl2.RG16F, gl2.RG, type);
    if (internalFormat === gl2.RG16F) return this.supportedFormat(gl2.RGBA16F, gl2.RGBA, type);
    return null;
  }

  private canRenderTo(internalFormat: number, format: number, type: number): boolean {
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    return ok;
  }
}

function readRenderer(gl: GL): string {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  } catch {
    // Some browsers deprecate this extension; fall through.
  }
  return String(gl.getParameter(gl.RENDERER));
}
