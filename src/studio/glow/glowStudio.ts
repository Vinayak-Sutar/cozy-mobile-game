import { FluidSim, type RGB } from '../../engine/fluid';
import { type FBO, Gpu, type Program } from '../../engine/gl';
import { Bloom, Sunrays } from '../../engine/post';
import displaySource from '../../toys/shaders/glowInk.frag?raw';
import { hsv, scale } from '../../util/color';
import { SYMMETRY_MODES, symmetryTransforms } from '../brush/symmetry';
import { hexToRgb } from '../color';
import { context, makeCanvas, newId } from '../doc/document';
import { canvasBlob, savePainting } from '../doc/library';
import { encode, fileName, type ImageFormat, shareOrSave } from '../export';
import { pushRecent, savePrefs, type StudioPrefs } from '../tools';
import { ColorPanel } from '../ui/colorPanel';
import { button, icons } from '../ui/icons';
import { Sheet } from '../ui/sheet';
import { VSlider } from '../ui/vslider';
import hazeSource from './haze.frag?raw';

/** Night skies to paint light on: [name, top, bottom]. */
export const GLOW_BACKGROUNDS: Record<string, { name: string; top: string; bottom: string }> = {
  night: { name: 'Night sky', top: '#0d1030', bottom: '#04050d' },
  sea: { name: 'Deep sea', top: '#06283a', bottom: '#01080d' },
  plum: { name: 'Plum dusk', top: '#2a0f33', bottom: '#08030c' },
  forest: { name: 'Forest night', top: '#0b2418', bottom: '#020805' },
  ember: { name: 'Embers', top: '#2b0d06', bottom: '#070201' },
  black: { name: 'Black', top: '#000000', bottom: '#000000' },
};

interface Finger {
  x: number;
  y: number;
  t: number;
  hue: number;
  /** Seconds the finger has stayed (nearly) still: light gathers under it. */
  still: number;
  speed: number;
  spin: number;
  dir: number;
}

/** Each undo step is a full-screen snapshot on the GPU (about 18 MB on a big phone screen). */
const MAX_UNDO = (() => {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return memory <= 2 ? 3 : memory <= 4 ? 5 : 8;
})();

export interface GlowOptions {
  onExit(): void;
}

/**
 * The Glow studio: painting with light. Drift's Glow (a fluid of light with
 * bloom and light rays), made into an art tool: the light stays, you can
 * freeze it, mirror it into mandalas, pick its colour and sky, and save it.
 */
export class GlowStudio {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly gpu: Gpu;
  private readonly sim: FluidSim;
  private readonly display: Program;
  private readonly haze: Program;
  private bloom: Bloom | null = null;
  private sunrays: Sunrays | null = null;
  private readonly sheet: Sheet;
  private readonly fingers = new Map<number, Finger>();
  private undoStack: FBO[] = [];
  private frozen = false;
  /** Something changed while frozen: draw one more frame. */
  private dirty = true;
  private strokes = 0;
  private hueBase = Math.random();
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private toastTimer = 0;
  private exiting = false;
  private readonly toastEl: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly freezeBtn: HTMLButtonElement;
  private readonly well: HTMLButtonElement;
  private readonly symBtn: HTMLButtonElement;
  private colorPanel: ColorPanel | null = null;

  /** Null when WebGL isn't available. */
  static create(parent: HTMLElement, prefs: StudioPrefs, options: GlowOptions): GlowStudio | null {
    try {
      return new GlowStudio(parent, prefs, options);
    } catch (err) {
      console.error('[studio] glow unavailable:', err);
      return null;
    }
  }

  private constructor(
    parent: HTMLElement,
    private readonly prefs: StudioPrefs,
    private readonly options: GlowOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'st-editor st-glow';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'st-view';
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);
    this.sizeCanvas();
    const gpu = Gpu.create(this.canvas);
    if (!gpu) {
      this.el.remove();
      throw new Error('WebGL unavailable');
    }
    this.gpu = gpu;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const strong = memory > 2;
    this.sim = new FluidSim(gpu, { simRes: 128, dyeRes: strong ? 1024 : 512, pressureIterations: strong ? 20 : 12 });
    const defines = ['SHADING', 'BLOOM'];
    // Softer and tighter than the Glow toy's bloom, so the sky stays dark around a picture.
    this.bloom = new Bloom(gpu, { resolution: 256, iterations: 6, intensity: 0.28, threshold: 0.7, softKnee: 0.6 });
    if (strong) {
      defines.push('SUNRAYS');
      this.sunrays = new Sunrays(gpu, 196, 0.45);
    }
    this.display = gpu.program(displaySource, defines);
    this.haze = gpu.program(hazeSource);
    this.configure();

    // Top bar: back, undo, clear, freeze, save.
    const top = document.createElement('div');
    top.className = 'st-topbar';
    const back = button(icons.gallery, 'Gallery');
    back.addEventListener('click', () => void this.exit());
    const title = document.createElement('span');
    title.className = 'st-zoom';
    title.textContent = 'Glow';
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    this.undoBtn = button(icons.undo, 'Undo');
    this.undoBtn.addEventListener('click', () => this.undo());
    const clear = button(icons.trash, 'Clear');
    clear.addEventListener('click', () => this.clear());
    this.freezeBtn = button(icons.freeze, 'Freeze the light');
    this.freezeBtn.addEventListener('click', () => this.setFrozen(!this.frozen));
    const share = button(icons.share, 'Save and share');
    share.addEventListener('click', () => this.openExport());
    top.append(back, title, spacer, this.undoBtn, clear, this.freezeBtn, share);

    // Size and brightness on the left edge.
    const side = document.createElement('div');
    side.className = 'st-side';
    const size = new VSlider('Size', (v, done) => {
      this.prefs.glow.size = v;
      if (done) savePrefs(this.prefs);
    });
    const bright = new VSlider('Bright', (v, done) => {
      this.prefs.glow.brightness = Math.max(0.05, v);
      if (done) savePrefs(this.prefs);
    });
    size.set(prefs.glow.size);
    bright.set(prefs.glow.brightness);
    side.append(size.el, bright.el);

    // Bottom: colour, symmetry, motion, sky.
    const bottom = document.createElement('div');
    bottom.className = 'st-bottombar';
    this.well = document.createElement('button');
    this.well.className = 'st-well';
    this.well.setAttribute('aria-label', 'Colour');
    this.well.addEventListener('click', () => this.openSettings('light'));
    this.symBtn = button(icons.sparkle, 'Symmetry');
    this.symBtn.addEventListener('click', () => this.openSettings('symmetry'));
    const motion = button(icons.wind, 'Swirl and flow');
    motion.addEventListener('click', () => this.openSettings('motion'));
    const sky = button(icons.moon, 'Background');
    sky.addEventListener('click', () => this.openSettings('sky'));
    bottom.append(this.well, this.symBtn, motion, sky);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-toast';
    this.el.append(top, side, bottom, this.toastEl);
    this.sheet = new Sheet(this.el);

    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', this.resize);
    this.updateUi();
    this.loop();
    this.toast('Paint with light. Hold still to gather a glow.', 2600);
  }

  // ---------- Setup ----------

  private sizeCanvas(): void {
    const rect = this.el.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  }

  private resize = (): void => {
    this.sizeCanvas();
    this.sim.resize();
    this.bloom?.resize();
    this.sunrays?.resize();
    // Old snapshots no longer fit the new size.
    this.clearUndo();
  };

  /** Swirl, flow and fading from the settings. */
  private configure(): void {
    const g = this.prefs.glow;
    this.sim.configure({
      curl: 2 + g.swirl * 30,
      velocityDissipation: 3 - g.flow * 2.6,
      densityDissipation: g.fade ? 0.9 : 0,
      pressure: 0.8,
      splatRadius: 0.22,
      splatForce: 4200,
    });
  }

  private get radius(): number {
    return 0.12 + this.prefs.glow.size * 1.6;
  }

  // ---------- Painting ----------

  private uv(x: number, y: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [(x - rect.left) / rect.width, 1 - (y - rect.top) / rect.height];
  }

  /** Symmetry copies of a point (and its direction) in CSS pixels on the canvas. */
  private copies(x: number, y: number, dx: number, dy: number): [number, number, number, number][] {
    const rect = this.canvas.getBoundingClientRect();
    const g = this.prefs.glow;
    const ts = symmetryTransforms({ mode: g.symmetry.mode, count: g.symmetry.count, x: rect.width / 2, y: rect.height / 2 });
    const lx = x - rect.left;
    const ly = y - rect.top;
    if (!ts) return [[x, y, dx, dy]];
    return ts.map((t) => [t.a * lx + t.c * ly + t.e + rect.left, t.b * lx + t.d * ly + t.f + rect.top, t.a * dx + t.c * dy, t.b * dx + t.d * dy]);
  }

  private get copyCount(): number {
    const { mode, count } = this.prefs.glow.symmetry;
    const n = Math.max(2, Math.min(16, count));
    return mode === 'off' ? 1 : mode === 'vertical' || mode === 'horizontal' ? 2 : mode === 'quadrant' ? 4 : mode === 'radial' ? n : 2 * n;
  }

  /** The colour of light for a finger: its own hue, or the picked colour. */
  private color(finger: Finger, k: number): RGB {
    const g = this.prefs.glow;
    if (g.rainbow) return scale(hsv(finger.hue, 0.78, 1), k);
    const [r, gr, b] = hexToRgb(this.prefs.color).map((c) => c / 255);
    // Picked colours are brightened to full strength; dark colours glow dimly.
    const peak = Math.max(r, gr, b, 0.05);
    return scale([r / peak, gr / peak, b / peak], k * Math.max(0.35, peak));
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    this.sheet.close();
    this.canvas.setPointerCapture?.(e.pointerId);
    if (!this.fingers.size) this.saveUndo();
    const finger: Finger = {
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      hue: this.hueBase + this.strokes * 0.17,
      still: 0,
      speed: 0,
      spin: Math.random() * Math.PI * 2,
      dir: Math.random() < 0.5 ? 1 : -1,
    };
    this.strokes++;
    this.fingers.set(e.pointerId, finger);
    this.bloomAt(finger, e.clientX, e.clientY, 1);
    if (!this.prefs.glow.rainbow) pushRecent(this.prefs, this.prefs.color);
  };

  private move = (e: PointerEvent): void => {
    const finger = this.fingers.get(e.pointerId);
    if (!finger) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.paint(finger, ev.clientX, ev.clientY, ev.timeStamp);
  };

  private up = (e: PointerEvent): void => {
    const finger = this.fingers.get(e.pointerId);
    this.fingers.delete(e.pointerId);
    if (!finger) return;
    // Letting go after holding still: the gathered light blooms out.
    const charge = this.charge(finger);
    if (charge >= 0.08) this.bloomAt(finger, finger.x, finger.y, 1 + charge * 1.6);
    if (!this.fingers.size) {
      savePrefs(this.prefs);
      this.updateUi();
    }
  };

  /** Lays light along the path the finger took (weighted by time, so it's the same on any screen). */
  private paint(finger: Finger, x: number, y: number, t: number): void {
    const dxPx = x - finger.x;
    const dyPx = y - finger.y;
    const distance = Math.hypot(dxPx, dyPx);
    const dt = Math.max(1 / 240, (t - finger.t) / 1000);
    if (distance < 0.5) return;
    const rect = this.canvas.getBoundingClientRect();
    const unit = Math.max(rect.width, rect.height);
    finger.speed = finger.speed * 0.7 + (distance / dt) * 0.3;
    const frameWeight = Math.min(2, Math.max(0.25, dt * 60));
    const steps = Math.min(6, Math.max(1, Math.ceil(distance / 22)));
    // Symmetry copies share the light, so a mandala isn't many times brighter than one stroke.
    const share = 1 / Math.sqrt(this.copyCount);
    // Gentler than Drift's Glow toy: the light should stay near where you paint it.
    const force = ((this.sim.config.splatForce / 60) * frameWeight * 0.4 * share) / steps;
    const color = this.color(finger, (0.1 * this.prefs.glow.brightness * frameWeight * share) / Math.sqrt(steps));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      for (const [cx, cy, cdx, cdy] of this.copies(finger.x + dxPx * k, finger.y + dyPx * k, dxPx, dyPx)) {
        const [u, v] = this.uv(cx, cy);
        this.sim.splatVelocity(u, v, (cdx / unit / dt) * force, (-cdy / unit / dt) * force, this.radius);
        this.sim.splatDye(u, v, color, this.radius);
      }
    }
    // Colours drift slowly while the finger moves.
    finger.hue += distance * 0.00012;
    finger.x = x;
    finger.y = y;
    finger.t = t;
  }

  /** A touch opens a little flower of light: a bright heart, and petals flung outward. */
  private bloomAt(finger: Finger, x: number, y: number, strength: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const g = this.prefs.glow;
    const ring = Math.min(rect.width, rect.height) * 0.04 * (0.8 + strength * 0.35) * (0.6 + g.size);
    const share = 1 / Math.sqrt(this.copyCount);
    const push = 300 * strength * share;
    const offset = Math.random() * Math.PI * 2;
    const k = g.brightness * 2 * share;
    for (const [cx, cy] of this.copies(x, y, 0, 0)) {
      const [u, v] = this.uv(cx, cy);
      this.sim.splatDye(u, v, this.color(finger, 0.3 * strength * k * 0.6), 0.4 * (0.6 + g.size));
      for (let p = 0; p < 7; p++) {
        const a = offset + (p / 7) * Math.PI * 2;
        const pu = u + (Math.cos(a) * ring) / rect.width;
        const pv = v + (Math.sin(a) * ring) / rect.height;
        const petal = g.rainbow ? scale(hsv(finger.hue + (p % 2 ? 0.07 : -0.07), 0.8, 1), 0.14 * strength * k * 0.6) : this.color(finger, 0.14 * strength * k * 0.6);
        this.sim.splat(pu, pv, Math.cos(a) * push, Math.sin(a) * push, petal, 0.3 * (0.6 + g.size));
      }
    }
  }

  /** 0..1: how much light a resting finger has gathered (after a short moment of stillness). */
  private charge(finger: Finger): number {
    return Math.min(1, Math.max(0, (finger.still - 0.25) / 1.6));
  }

  /** Light gathers and spins under a finger that rests on the glass. */
  private gather(dt: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height);
    const weight = Math.min(2, Math.max(0.25, dt * 60));
    for (const finger of this.fingers.values()) {
      finger.speed *= Math.exp(-dt * 8);
      finger.still = finger.speed < minDim * 0.25 ? finger.still + dt : Math.max(0, finger.still - dt * 3);
      const charge = this.charge(finger);
      if (charge <= 0) continue;
      finger.spin += dt * (2.2 + charge * 4) * finger.dir;
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 5);
      const ring = minDim * (0.028 + charge * 0.03);
      const swirl = (8 + charge * 14) * finger.dir * weight;
      for (let j = 0; j < 3; j++) {
        const a = finger.spin + (j * Math.PI * 2) / 3;
        const x = finger.x + Math.cos(a) * ring;
        const y = finger.y + Math.sin(a) * ring;
        for (const [cx, cy, cdx, cdy] of this.copies(x, y, -Math.sin(a) * swirl, Math.cos(a) * swirl)) {
          const [u, v] = this.uv(cx, cy);
          const color = this.prefs.glow.rainbow ? scale(hsv(finger.hue + (j - 1) * 0.05, 0.75, 1), 1) : this.color(finger, 1);
          this.sim.splat(u, v, cdx, -cdy, scale(color, 0.0045 * (0.3 + charge) * pulse * weight * this.prefs.glow.brightness * 2), 0.32);
        }
      }
    }
  }

  // ---------- Frame ----------

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (!this.frozen) {
      this.gather(dt);
      this.sim.step(dt);
      if (!this.prefs.glow.fade) this.clearHaze(dt);
    } else if (!this.dirty && !this.fingers.size) {
      // Frozen and untouched: the picture hasn't changed, so save the battery.
      return;
    }
    this.dirty = false;
    this.draw(null);
  };

  /** Fades only the faintest light, so a picture that stays doesn't fog over. */
  private clearHaze(dt: number): void {
    const { gpu, sim } = this;
    const gl = gpu.gl;
    gl.disable(gl.BLEND);
    this.haze.bind();
    gl.uniform1i(this.haze.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1f(this.haze.u('uFade'), Math.min(1, dt * 1.6));
    gl.uniform1f(this.haze.u('uFloor'), 0.05);
    gpu.blit(sim.dye.write);
    sim.dye.swap();
  }

  /** Draws the light over the sky into `target` (or the screen). */
  private draw(target: FBO | null): void {
    const { gpu, sim } = this;
    const gl = gpu.gl;
    const bloom = this.bloom?.apply(sim.dye.read);
    const rays = this.sunrays?.apply(sim.dye.read, sim.dye.write);
    const bg = GLOW_BACKGROUNDS[this.prefs.glow.background] ?? GLOW_BACKGROUNDS.night;
    const top = hexToRgb(bg.top).map((c) => c / 255) as RGB;
    const bottom = hexToRgb(bg.bottom).map((c) => c / 255) as RGB;
    const display = this.display;
    display.bind();
    gl.uniform2f(display.u('texelSize'), 1 / gpu.width, 1 / gpu.height);
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    if (bloom) gl.uniform1i(display.u('uBloom'), bloom.attach(1));
    if (rays) gl.uniform1i(display.u('uSunrays'), rays.attach(2));
    gl.uniform3f(display.u('uBgTop'), ...top);
    gl.uniform3f(display.u('uBgBottom'), ...bottom);
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform1f(display.u('uTime'), this.time);
    gpu.blit(target);
  }

  // ---------- Actions ----------

  private setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    this.updateUi();
    this.toast(frozen ? 'Frozen: the light holds still' : 'Flowing again');
  }

  private saveUndo(): void {
    const recycled = this.undoStack.length >= MAX_UNDO ? (this.undoStack.shift() ?? null) : null;
    this.undoStack.push(this.sim.snapshotDye(recycled));
    this.updateUi();
  }

  private undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return this.toast('Nothing to undo');
    this.sim.restoreDye(snapshot);
    this.sim.clearVelocity();
    this.gpu.deleteFbo(snapshot);
    this.updateUi();
  }

  private clearUndo(): void {
    for (const fbo of this.undoStack) this.gpu.deleteFbo(fbo);
    this.undoStack = [];
    this.updateUi();
  }

  private clear(): void {
    this.saveUndo();
    this.sim.clear();
    this.toast('Cleared (undo brings it back)');
  }

  private updateUi(): void {
    this.dirty = true;
    this.undoBtn.disabled = !this.undoStack.length;
    this.freezeBtn.classList.toggle('on', this.frozen);
    const g = this.prefs.glow;
    this.well.style.background = g.rainbow ? 'conic-gradient(#ff5f6d, #ffc371, #f9f871, #7cf29c, #5ec8ff, #9b7bff, #ff5f6d)' : this.prefs.color;
    this.symBtn.classList.toggle('on', g.symmetry.mode !== 'off');
  }

  private toast(text: string, ms = 1500): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  // ---------- Panels ----------

  private openSettings(tab: string): void {
    const g = this.prefs.glow;
    g.tab = tab;
    const wrap = document.createElement('div');
    const render = (): void => {
      const tabs = document.createElement('div');
      tabs.className = 'st-tabs';
      for (const [id, label] of [
        ['light', 'Colour'],
        ['symmetry', 'Symmetry'],
        ['motion', 'Motion'],
        ['sky', 'Sky'],
      ]) {
        const b = document.createElement('button');
        b.className = `st-tab${g.tab === id ? ' active' : ''}`;
        b.textContent = label;
        b.addEventListener('click', () => {
          g.tab = id;
          render();
        });
        tabs.appendChild(b);
      }
      const parts: HTMLElement[] = [tabs];
      const chip = (label: string, on: boolean, run: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.className = `st-chip-btn${on ? ' primary' : ''}`;
        b.textContent = label;
        b.addEventListener('click', () => {
          run();
          savePrefs(this.prefs);
          this.updateUi();
          render();
        });
        return b;
      };
      const range = (label: string, value: number, set: (v: number) => void): HTMLElement => {
        const row = document.createElement('div');
        row.className = 'st-row';
        row.innerHTML = `<label>${label}</label><input type="range" min="0" max="100"><span class="value"></span>`;
        const input = row.querySelector('input') as HTMLInputElement;
        const out = row.querySelector('.value') as HTMLElement;
        input.value = String(Math.round(value * 100));
        out.textContent = `${input.value}%`;
        input.addEventListener('input', () => {
          out.textContent = `${input.value}%`;
          set(Number(input.value) / 100);
          this.configure();
        });
        input.addEventListener('change', () => savePrefs(this.prefs));
        return row;
      };
      if (g.tab === 'light') {
        const row = document.createElement('div');
        row.className = 'st-actions';
        row.append(
          chip('Rainbow', g.rainbow, () => (g.rainbow = true)),
          chip('One colour', !g.rainbow, () => (g.rainbow = false)),
        );
        parts.push(row);
        if (!g.rainbow) {
          this.colorPanel = new ColorPanel(this.prefs, () => this.updateUi());
          parts.push(this.colorPanel.el);
        } else {
          const note = document.createElement('p');
          note.className = 'st-note';
          note.textContent = 'Each stroke is a new colour of the rainbow, and colours drift as you paint.';
          parts.push(note);
        }
      } else if (g.tab === 'symmetry') {
        const grid = document.createElement('div');
        grid.className = 'st-sym-grid';
        for (const mode of SYMMETRY_MODES) {
          const b = document.createElement('button');
          b.className = `st-sym${g.symmetry.mode === mode.id ? ' active' : ''}`;
          b.innerHTML = `<span>${mode.name}</span>`;
          b.addEventListener('click', () => {
            g.symmetry.mode = mode.id;
            savePrefs(this.prefs);
            this.updateUi();
            render();
          });
          grid.appendChild(b);
        }
        parts.push(grid);
        if (g.symmetry.mode === 'radial' || g.symmetry.mode === 'kaleidoscope') {
          const row = document.createElement('div');
          row.className = 'st-row';
          row.innerHTML = '<label>Copies</label><input type="range" min="2" max="16" step="1"><span class="value"></span>';
          const input = row.querySelector('input') as HTMLInputElement;
          const out = row.querySelector('.value') as HTMLElement;
          input.value = String(g.symmetry.count);
          out.textContent = input.value;
          input.addEventListener('input', () => {
            g.symmetry.count = Number(input.value);
            out.textContent = input.value;
          });
          input.addEventListener('change', () => savePrefs(this.prefs));
          parts.push(row);
        }
        const note = document.createElement('p');
        note.className = 'st-note';
        note.textContent = 'Mirrors and turns around the middle of the screen: try Kaleidoscope for neon mandalas.';
        parts.push(note);
      } else if (g.tab === 'motion') {
        parts.push(
          range('Swirl', g.swirl, (v) => (g.swirl = v)),
          range('Flow', g.flow, (v) => (g.flow = v)),
        );
        const row = document.createElement('div');
        row.className = 'st-actions';
        row.append(
          chip('Light stays', !g.fade, () => {
            g.fade = false;
            this.configure();
          }),
          chip('Light fades', g.fade, () => {
            g.fade = true;
            this.configure();
          }),
        );
        const note = document.createElement('p');
        note.className = 'st-note';
        note.textContent = 'Swirl curls the light; Flow is how long it keeps drifting after you lift. Freeze (top) holds everything still.';
        parts.push(row, note);
      } else {
        const grid = document.createElement('div');
        grid.className = 'st-sky-grid';
        for (const [id, bg] of Object.entries(GLOW_BACKGROUNDS)) {
          const b = document.createElement('button');
          b.className = `st-sky${g.background === id ? ' active' : ''}`;
          b.style.background = `linear-gradient(${bg.top}, ${bg.bottom})`;
          b.innerHTML = `<span>${bg.name}</span>`;
          b.addEventListener('click', () => {
            g.background = id;
            savePrefs(this.prefs);
            this.updateUi();
            render();
          });
          grid.appendChild(b);
        }
        parts.push(grid);
      }
      wrap.replaceChildren(...parts);
    };
    render();
    const titles: Record<string, string> = { light: 'Colour', symmetry: 'Symmetry', motion: 'Motion', sky: 'Sky' };
    // Each button has its own sheet id, so tapping another one switches instead of closing.
    this.sheet.open(`glow-${tab}`, titles[tab] ?? 'Glow', wrap, () => (this.colorPanel = null));
  }

  /** The finished picture, at the screen's full resolution, bloom and all. */
  private snapshot(): HTMLCanvasElement {
    const { gpu } = this;
    const gl = gpu.gl;
    const w = gpu.width;
    const h = gpu.height;
    const target = gpu.fbo(w, h, { internalFormat: gl.RGBA, format: gl.RGBA }, gl.NEAREST, gl.UNSIGNED_BYTE);
    this.draw(target);
    const pixels = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gpu.deleteFbo(target);
    const out = makeCanvas(w, h);
    const ctx = context(out);
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      // GL rows run bottom-up.
      image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    ctx.putImageData(image, 0, 0);
    return out;
  }

  private openExport(): void {
    const picture = this.snapshot();
    let format: ImageFormat = 'png';
    const wrap = document.createElement('div');
    const preview = makeCanvas(Math.round(picture.width * Math.min(1, 360 / Math.max(picture.width, picture.height))), 1);
    preview.height = Math.round((picture.height * preview.width) / picture.width);
    context(preview).drawImage(picture, 0, 0, preview.width, preview.height);
    preview.className = 'st-export-preview';
    const seg = document.createElement('div');
    seg.className = 'st-seg';
    const formatRow = document.createElement('div');
    formatRow.className = 'st-row';
    formatRow.innerHTML = '<label>Format</label>';
    const drawSeg = (): void => {
      seg.replaceChildren(
        ...(['png', 'jpeg'] as ImageFormat[]).map((id) => {
          const b = document.createElement('button');
          b.textContent = id.toUpperCase();
          b.className = format === id ? 'active' : '';
          b.addEventListener('click', () => {
            format = id;
            drawSeg();
          });
          return b;
        }),
      );
    };
    drawSeg();
    formatRow.appendChild(seg);
    const note = document.createElement('p');
    note.className = 'st-note';
    note.textContent = `${picture.width} × ${picture.height} px, the size of your screen. Keep in gallery to carry on with brushes and layers.`;
    const actions = document.createElement('div');
    actions.className = 'st-actions';
    const shareBtn = document.createElement('button');
    shareBtn.className = 'st-chip-btn primary';
    shareBtn.textContent = 'Share or save';
    shareBtn.addEventListener('click', async () => {
      shareBtn.disabled = true;
      try {
        const blob = await encode(picture, format, 0.92);
        const result = await shareOrSave(blob, fileName('Glow', format === 'png' ? 'png' : 'jpg'));
        if (result !== 'cancelled') this.toast(result === 'shared' ? 'Shared' : 'Saved to your downloads');
      } catch {
        this.toast('Could not export this time');
      } finally {
        shareBtn.disabled = false;
      }
    });
    const keep = document.createElement('button');
    keep.className = 'st-chip-btn';
    keep.textContent = 'Keep in gallery';
    keep.addEventListener('click', async () => {
      keep.disabled = true;
      try {
        await this.keep(picture);
        this.toast('Kept in your gallery');
      } catch {
        this.toast('Could not save. Is the phone out of space?', 2600);
      } finally {
        keep.disabled = false;
      }
    });
    actions.append(shareBtn, keep);
    wrap.append(preview, formatRow, note, actions);
    this.sheet.open('export', 'Save your light', wrap);
  }

  /** Saves the picture as a painting in the gallery (one layer), so it can be painted on further. */
  private async keep(picture: HTMLCanvasElement): Promise<void> {
    const id = newId();
    const layerId = newId();
    const now = Date.now();
    const thumbCanvas = makeCanvas(Math.round(picture.width * Math.min(1, 360 / Math.max(picture.width, picture.height))), 1);
    thumbCanvas.height = Math.round((picture.height * thumbCanvas.width) / picture.width);
    context(thumbCanvas).drawImage(picture, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const bg = GLOW_BACKGROUNDS[this.prefs.glow.background] ?? GLOW_BACKGROUNDS.night;
    await savePainting(
      {
        id,
        name: `Glow ${new Date(now).toLocaleDateString([], { day: 'numeric', month: 'short' })}`,
        width: picture.width,
        height: picture.height,
        paper: { color: bg.bottom, texture: 'smooth', visible: true },
        layers: [{ id: layerId, name: 'Light', opacity: 1, blend: 'source-over', visible: true, alphaLock: false }],
        active: 0,
        created: now,
        updated: now,
        thumb: await canvasBlob(thumbCanvas),
      },
      new Map([[layerId, await canvasBlob(picture)]]),
    );
  }

  async exit(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    this.destroy();
    this.options.onExit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.clearUndo();
    this.bloom?.dispose();
    this.sunrays?.dispose();
    this.gpu.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.el.remove();
  }
}
