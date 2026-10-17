import { store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { Bloom } from '../engine/post';
import { Probe } from '../engine/probe';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { SkyBook } from '../ui/skyBook';
import { clamp, rand, scale } from '../util/color';
import { CONSTELLATIONS, type Constellation } from './constellations';
import displaySource from './shaders/lanternLights.frag?raw';
import { Toy } from './Toy';

/** The lake's surface, as a fraction of screen height from the bottom. */
const LAKE = 0.2;
/** Where the constellation appears (fractions of the screen, y from the bottom). */
const SKY_BOX = { left: 0.18, right: 0.82, top: 0.95, bottom: 0.75 };
const LOTUS_X = [0.2, 0.5, 0.8];
const PROBE_EVERY = 3;
const PROBE_SCALE = 0.5;
/** How far (in screen heights) a scoop of light lasts before it runs out. */
const CARRY_REACH = 1.6;
/** Seconds without a touch before a little mote of light shows what to do. */
const HINT_AFTER = 6;
const HINT_CYCLE = 2.8;

interface LightColor {
  id: string;
  rgb: RGB;
  css: string;
}

const LIGHTS: LightColor[] = [
  { id: 'pink', rgb: [1.0, 0.45, 0.75], css: '#ff7fc4' },
  { id: 'teal', rgb: [0.3, 1.0, 0.85], css: '#56f0d0' },
  { id: 'gold', rgb: [1.0, 0.8, 0.3], css: '#ffcf5a' },
];

/**
 * Splits a light sample into how much pink, teal and gold it holds (light adds
 * up linearly, so it's a 3x3 solve). Pink and gold point almost the same way in
 * RGB, so comparing directions alone would let pink fill a gold lantern.
 */
const UNMIX_LIGHT = (() => {
  const m = [0, 1, 2].map((c) => LIGHTS.map((l) => l.rgb[c]));
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const inv = [
    [m[1][1] * m[2][2] - m[1][2] * m[2][1], m[0][2] * m[2][1] - m[0][1] * m[2][2], m[0][1] * m[1][2] - m[0][2] * m[1][1]],
    [m[1][2] * m[2][0] - m[1][0] * m[2][2], m[0][0] * m[2][2] - m[0][2] * m[2][0], m[0][2] * m[1][0] - m[0][0] * m[1][2]],
    [m[1][0] * m[2][1] - m[1][1] * m[2][0], m[0][1] * m[2][0] - m[0][0] * m[2][1], m[0][0] * m[1][1] - m[0][1] * m[1][0]],
  ];
  return inv.map((row) => row.map((v) => v / det));
})();

function unmixLight(light: RGB): number[] {
  return UNMIX_LIGHT.map((row) => Math.max(0, row[0] * light[0] + row[1] * light[1] + row[2] * light[2]));
}

type LanternState = 'waiting' | 'lit' | 'rising' | 'star';

interface Lantern {
  x: number;
  y: number;
  color: number;
  fill: number;
  state: LanternState;
  since: number;
  star: [number, number];
  bob: number;
}

type Night = 'lighting' | 'constellation' | 'ending';

/** Light scooped from a lotus by a finger: which colour, and how much is left. */
interface Carry {
  color: number;
  left: number;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * Lantern Lights: three lotus flowers on a night lake glow pink, teal and gold.
 * Touch a flower to scoop up its light and draw a ribbon of it through the air;
 * the light drifts upward and swirls. Guide it into the paper lantern of the
 * same colour. A full lantern lights up and rises to become a star; light them
 * all and the stars join into a constellation for your sky book.
 */
export class LanternLights extends Toy {
  readonly id = 'lanterns' as const;
  override readonly usesOverlay = true;
  // No ghost finger: it would waft the light into the lanterns for you.
  override readonly quietIdle = true;

  readonly simConfig: SimConfig = {
    curl: 6,
    velocityDissipation: 0.5,
    densityDissipation: 0.45,
    // Light dissolves into the high sky instead of pooling at the top and drifting back down.
    ceilingFade: 5,
    pressure: 0.8,
    splatRadius: 0.16,
    splatForce: 3200,
    buoyancy: -260,
    buoyancyWeights: [0.33, 0.33, 0.33],
  };

  readonly sound: SoundTheme = {
    scale: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83],
    voice: 'bell',
    bed: 'night',
    swish: { type: 'bandpass', low: 350, high: 1500, q: 0.8, gain: 0.04 },
  };

  private display: Program | null = null;
  private bloom: Bloom | null = null;
  private probe: Probe | null = null;
  private lanterns: Lantern[] = [];
  private lotusColors: number[] = [0, 1, 2];
  private constellation: Constellation = CONSTELLATIONS[0];
  private night: Night = 'lighting';
  private nightStart = 0;
  private frame = 0;
  private samples: RGB[] = [];
  private glowSprite: HTMLCanvasElement | null = null;
  private book: SkyBook | null = null;
  private carries = new Map<number, Carry>();
  private lastTouch = 0;

  strokeColor(pointer: Pointer): RGB {
    const carry = this.carries.get(pointer.id);
    if (!carry) return [0, 0, 0];
    // Bright at first, thinning out as the scoop runs low.
    return scale(LIGHTS[carry.color].rgb, 0.15 * Math.sqrt(carry.left));
  }

  mountUi(container: HTMLElement): void {
    this.book = new SkyBook(container, this.env.audio);
  }

  unmountUi(): void {
    this.book?.destroy();
    this.book = null;
  }

  protected override onEnter(): void {
    this.buildPipeline();
    this.probe = new Probe(this.env.gpu);
    this.glowSprite ??= makeGlow();
    this.startNight();
  }

  override exit(): void {
    this.bloom?.dispose();
    this.bloom = null;
    this.probe?.dispose();
    this.probe = null;
  }

  override onResize(): void {
    this.bloom?.resize();
  }

  override onQualityChange(): void {
    this.bloom?.dispose();
    this.bloom = null;
    this.buildPipeline();
  }

  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    const { width, height } = this.env.view;
    const [u, v] = this.uv(pointer.x, pointer.y);
    this.lastTouch = this.time;
    // Touching a lotus scoops up its light: the finger now draws with it.
    const reach = Math.min(width, height) * 0.14;
    for (let i = 0; i < LOTUS_X.length; i++) {
      if (Math.hypot(pointer.x - LOTUS_X[i] * width, pointer.y - (1 - LAKE) * height) < reach) {
        this.carries.set(pointer.id, { color: this.lotusColors[i], left: 1 });
        this.puff(i, 3);
        this.env.audio.chime(LOTUS_X[i], 0.3);
        this.env.haptics.tap(0.3);
        return;
      }
    }
    this.drop(u, v, [0, 0, 0], 0.5);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    this.lastTouch = this.time;
    const carry = this.carries.get(pointer.id);
    if (carry) {
      // A ribbon of light that follows the finger, then drifts up and swirls.
      this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { pigment: 1, radius: 0.7, push: 0.6, spacing: 10, maxSteps: 10 });
      carry.left -= Math.hypot(pointer.x - x0, pointer.y - y0) / (this.env.view.height * CARRY_REACH);
      if (carry.left <= 0) this.carries.delete(pointer.id);
      return;
    }
    // Without a scoop of light: a wide, gentle push, like wafting warm air with your hand.
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { pigment: 0, radius: 2.2, push: 1 });
  }

  override pointerUp(pointer: Pointer): void {
    this.carries.delete(pointer.id);
  }

  override update(dt: number): void {
    super.update(dt);
    const { audio, haptics } = this.env;
    const t = this.time;
    const inNight = t - this.nightStart;

    // The lotus flowers glow steadily.
    const weight = Math.min(2, Math.max(0.25, dt * 60));
    for (let i = 0; i < LOTUS_X.length; i++) this.puff(i, weight);

    if (this.night === 'lighting' && this.probe && ++this.frame % PROBE_EVERY === 0) this.measure(dt * PROBE_EVERY);

    for (const lantern of this.lanterns) {
      const age = t - lantern.since;
      if (lantern.state === 'lit' && age > 0.9) {
        lantern.state = 'rising';
        lantern.since = t;
      } else if (lantern.state === 'rising' && age > 2.4) {
        lantern.state = 'star';
        lantern.since = t;
        audio.chime(lantern.star[0], 0.9);
      }
    }

    if (this.night === 'lighting' && this.lanterns.every((l) => l.state === 'star')) {
      this.night = 'constellation';
      this.nightStart = t;
      audio.celebrate();
      haptics.tap(0.8);
      this.found();
    } else if (this.night === 'constellation' && inNight > 5.5) {
      this.night = 'ending';
      this.nightStart = t;
    } else if (this.night === 'ending' && inNight > 1.2) {
      this.startNight();
    }
  }

  render(): void {
    const { gpu, sim } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display) return;
    const bloom = this.bloom?.apply(sim.dye.read);
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    if (bloom) gl.uniform1i(display.u('uBloom'), bloom.attach(1));
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform1f(display.u('uLake'), LAKE);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const minDim = Math.min(width, height);
    const t = this.time;
    const fade = this.night === 'ending' ? 1 - clamp((t - this.nightStart) / 1.2, 0, 1) : 1;
    const fadeIn = this.night === 'lighting' ? clamp((t - this.nightStart) / 0.8, 0, 1) : 1;

    this.drawConstellation(ctx, width, height, t, fade);
    ctx.save();
    ctx.globalAlpha = fadeIn * fade;
    for (const lantern of this.lanterns) this.drawLantern(ctx, lantern, width, height, minDim, t);
    ctx.restore();
    for (let i = 0; i < LOTUS_X.length; i++) this.drawLotus(ctx, i, width, height, minDim, t);
    this.drawHint(ctx, width, height, minDim, t);
  }

  // ---------- Night flow ----------

  private startNight(): void {
    const { sim } = this.env;
    sim.clear();
    this.constellation = CONSTELLATIONS[store.data.lanterns.next % CONSTELLATIONS.length];
    this.night = 'lighting';
    this.nightStart = this.time;
    // Shuffle which lotus gives which colour, so each night needs fresh steering.
    this.lotusColors = shuffle([0, 1, 2]);
    this.carries.clear();

    const count = this.constellation.points.length;
    const colors = shuffle(Array.from({ length: count }, (_, i) => i % LIGHTS.length));
    const placed: [number, number][] = [];
    this.lanterns = this.constellation.points.map((p, i) => {
      let x = 0.5;
      let y = 0.55;
      for (let tries = 0; tries < 60; tries++) {
        x = rand(0.14, 0.86);
        y = rand(0.4, 0.68);
        if (placed.every(([px, py]) => Math.hypot(px - x, (py - y) * 1.6) > 0.2)) break;
      }
      placed.push([x, y]);
      return {
        x,
        y,
        color: colors[i],
        fill: 0,
        state: 'waiting' as LanternState,
        since: this.time,
        star: [SKY_BOX.left + p[0] * (SKY_BOX.right - SKY_BOX.left), SKY_BOX.top - p[1] * (SKY_BOX.top - SKY_BOX.bottom)],
        bob: rand(0, Math.PI * 2),
      };
    });
  }

  private found(): void {
    const lanterns = store.data.lanterns;
    lanterns.found[this.constellation.id] = (lanterns.found[this.constellation.id] ?? 0) + 1;
    lanterns.next = (CONSTELLATIONS.indexOf(this.constellation) + 1) % CONSTELLATIONS.length;
    store.save();
    this.book?.refresh();
  }

  /** How much light of the right colour is inside each waiting lantern. */
  private measure(dt: number): void {
    const waiting = this.lanterns.filter((l) => l.state === 'waiting');
    if (waiting.length === 0) return;
    const points = waiting.map((l) => this.lanternPos(l, this.time)).map(([x, y]) => [x, y] as [number, number]);
    this.probe?.readRgb(this.env.sim.dye.read, points, 0.025, PROBE_SCALE, this.samples);
    waiting.forEach((lantern, i) => {
      const shares = unmixLight(scale(this.samples[i] ?? [0, 0, 0], 1 / PROBE_SCALE));
      const mine = shares[lantern.color];
      const others = shares.reduce((sum, v) => sum + v, 0) - mine;
      // Only the matching colour fills it; other colours mixed in hold it back. The
      // flowers' faint steady glow stays under the threshold.
      const gain = Math.max(0, mine - 0.7 * others - 0.09);
      lantern.fill = Math.min(1, lantern.fill + gain * dt * 6);
      if (lantern.fill >= 1) {
        lantern.state = 'lit';
        lantern.since = this.time;
        this.env.audio.chime(lantern.x, lantern.y);
        this.env.haptics.tap(0.6);
      }
    });
  }

  /** Light rising from lotus `i`. `strength` 1 = the steady glow; more for a tap. */
  private puff(i: number, strength: number): void {
    const { sim } = this.env;
    const color = LIGHTS[this.lotusColors[i]].rgb;
    const x = LOTUS_X[i] + Math.sin(this.time * 0.9 + i * 2) * 0.006;
    // The steady glow is faint, just enough to show each flower's colour rising; the
    // lanterns need the brighter light a finger scoops up and carries to them.
    sim.splatDye(x, LAKE + 0.015, scale(color, 0.025 * strength), strength > 1 ? 1.2 : 0.35);
    sim.splatVelocity(x, LAKE + 0.03, 0, 80 * strength, 0.6);
  }

  /** A lantern's position (0..1, y up), including its gentle bob or its rise to the stars. */
  private lanternPos(l: Lantern, t: number): [number, number] {
    const bob = Math.sin(t * 1.1 + l.bob) * 0.008;
    if (l.state === 'rising') {
      const k = easeInOut(clamp((t - l.since) / 2.4, 0, 1));
      return [l.x + (l.star[0] - l.x) * k, l.y + bob * (1 - k) + (l.star[1] - l.y) * k];
    }
    if (l.state === 'star') return l.star;
    return [l.x, l.y + bob];
  }

  private buildPipeline(): void {
    const { gpu, quality } = this.env;
    const defines: string[] = [];
    if (quality.settings.bloom) {
      defines.push('BLOOM');
      this.bloom = new Bloom(gpu, { resolution: 256, iterations: 8, intensity: 0.6, threshold: 0.35, softKnee: 0.7 });
    }
    this.display = gpu.program(displaySource, defines);
  }

  // ---------- Drawing ----------

  private drawLantern(ctx: CanvasRenderingContext2D, l: Lantern, width: number, height: number, minDim: number, t: number): void {
    const [u, v] = this.lanternPos(l, t);
    const x = u * width;
    const y = (1 - v) * height;
    const light = LIGHTS[l.color];
    const s = minDim * 0.06;

    if (l.state === 'star') {
      const tw = 0.7 + 0.3 * Math.sin(t * 3 + l.bob);
      this.glow(ctx, x, y, s * 2.2, light.css, 0.5 * tw);
      ctx.fillStyle = '#fff8e0';
      sparkle(ctx, x, y, s * 0.42 * tw);
      return;
    }

    const rising = l.state === 'rising' ? clamp((t - l.since) / 2.4, 0, 1) : 0;
    const k = 1 - rising * 0.65;
    const glow = l.state === 'waiting' ? l.fill : 1;
    if (glow > 0.02) this.glow(ctx, x, y, s * (2 + glow * 1.6) * k, light.css, 0.25 + glow * 0.55);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    // A paper sky lantern: wider at the top, ribbed, tinted with the colour it wants.
    const body = (): void => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, -s * 0.9);
      ctx.quadraticCurveTo(0, -s * 1.12, s * 0.62, -s * 0.9);
      ctx.quadraticCurveTo(s * 0.72, 0, s * 0.45, s * 0.85);
      ctx.lineTo(-s * 0.45, s * 0.85);
      ctx.quadraticCurveTo(-s * 0.72, 0, -s * 0.62, -s * 0.9);
      ctx.closePath();
    };
    const paper = mixCss('#efe4d0', light.css, 0.3 + glow * 0.5);
    ctx.fillStyle = paper;
    body();
    ctx.fill();
    // Warm inner light grows as the lantern fills.
    if (glow > 0) {
      const g = ctx.createRadialGradient(0, s * 0.3, 0, 0, s * 0.2, s * 1.1);
      g.addColorStop(0, `rgba(255, 250, 225, ${0.9 * glow})`);
      g.addColorStop(1, `rgba(255, 250, 225, 0)`);
      ctx.fillStyle = g;
      body();
      ctx.fill();
    }
    ctx.strokeStyle = mixCss('#b49a78', light.css, 0.55);
    ctx.lineWidth = 1.4;
    body();
    ctx.stroke();
    for (const rib of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(rib * s * 1.8, -s * 0.95 - Math.abs(rib) * -s * 0.15);
      ctx.quadraticCurveTo(rib * s * 2.2, 0, rib * s * 1.4, s * 0.85);
      ctx.stroke();
    }
    // The opening at the bottom, with a little flame once it's lit.
    ctx.fillStyle = 'rgba(60, 40, 30, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.85, s * 0.45, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (l.state !== 'waiting') {
      ctx.fillStyle = '#ffd56a';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.72, s * 0.09, s * 0.16 + Math.sin(t * 12) * s * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // A coloured tassel says which light it wants.
      ctx.strokeStyle = light.css;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.95);
      ctx.lineTo(Math.sin(t * 2 + l.bob) * 2, s * 1.35);
      ctx.stroke();
      ctx.fillStyle = light.css;
      ctx.beginPath();
      ctx.arc(Math.sin(t * 2 + l.bob) * 2, s * 1.4, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLotus(ctx: CanvasRenderingContext2D, i: number, width: number, height: number, minDim: number, t: number): void {
    const light = LIGHTS[this.lotusColors[i]];
    const x = LOTUS_X[i] * width;
    const y = (1 - LAKE) * height + minDim * 0.01;
    const s = minDim * 0.045;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2 + i * 2.1);
    this.glow(ctx, x, y - s * 0.3, s * 3.2 * pulse, light.css, 0.55);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(40, 90, 70, 0.9)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.25, s * 1.5, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixCss('#ffffff', light.css, 0.6);
    for (const [a, len] of [
      [-1.1, 0.9],
      [1.1, 0.9],
      [-0.55, 1.1],
      [0.55, 1.1],
      [0, 1.25],
    ]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -s * len * 0.5, s * 0.28, s * len * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * When nobody has touched for a while, a mote of light floats from a flower to
   * a lantern of its colour: touch the flower, carry the light up.
   */
  private drawHint(ctx: CanvasRenderingContext2D, width: number, height: number, minDim: number, t: number): void {
    if (this.night !== 'lighting') return;
    const idle = t - Math.max(this.lastTouch, this.nightStart) - HINT_AFTER;
    const target = this.lanterns.find((l) => l.state === 'waiting');
    if (idle < 0 || !target) return;
    const light = LIGHTS[target.color];
    const lotus = this.lotusColors.indexOf(target.color);
    const k = (idle % HINT_CYCLE) / HINT_CYCLE;
    const alpha = Math.min(1, idle) * Math.sin(Math.PI * k);
    const x0 = LOTUS_X[lotus] * width;
    const y0 = (1 - LAKE) * height - minDim * 0.02;
    const [u, v] = this.lanternPos(target, t);
    const x1 = u * width;
    const y1 = (1 - v) * height + minDim * 0.07;

    // A soft ring on the flower says "touch here".
    ctx.save();
    ctx.globalAlpha = alpha * (1 - k);
    ctx.strokeStyle = light.css;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x0, y0, minDim * (0.05 + k * 0.06), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // The mote, on a gentle curve, trailing a few fading dots.
    const at = (e: number): [number, number] => {
      const bend = Math.sin(e * Math.PI) * minDim * 0.08 * Math.sign(x1 - x0 || 1);
      return [x0 + (x1 - x0) * e - bend, y0 + (y1 - y0) * e];
    };
    const e = easeInOut(k);
    ctx.save();
    ctx.fillStyle = light.css;
    for (let i = 1; i <= 4; i++) {
      const [tx, ty] = at(Math.max(0, e - i * 0.05));
      ctx.globalAlpha = alpha * (0.5 - i * 0.1);
      ctx.beginPath();
      ctx.arc(tx, ty, minDim * 0.008, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const [mx, my] = at(e);
    this.glow(ctx, mx, my, minDim * 0.14, light.css, 0.8 * alpha);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fffbea';
    sparkle(ctx, mx, my, minDim * 0.018);
    ctx.restore();
  }

  /** Once every star is in place, the lines join one by one and the picture is named. */
  private drawConstellation(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, fade: number): void {
    if (this.night === 'lighting') return;
    const age = this.night === 'constellation' ? t - this.nightStart : 6;
    const lines = this.constellation.lines;
    const at = (i: number): [number, number] => {
      const [u, v] = this.lanterns[i].star;
      return [u * width, (1 - v) * height];
    };
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(255, 238, 190, 0.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    lines.forEach(([a, b], i) => {
      const k = clamp((age - i * 0.25) / 0.35, 0, 1);
      if (k <= 0) return;
      const [x0, y0] = at(a);
      const [x1, y1] = at(b);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
      ctx.stroke();
    });
    // Its name, under the stars.
    const k = clamp((age - lines.length * 0.25) / 0.5, 0, 1);
    if (k > 0) {
      const text = this.constellation.name;
      const size = Math.round(Math.min(width, height) * 0.055);
      ctx.globalAlpha = fade * k;
      ctx.font = `700 ${size}px Nunito, Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 36;
      const y = (1 - SKY_BOX.bottom) * height + size * 1.6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.roundRect(width / 2 - w / 2, y - size, w, size * 2, size);
      ctx.fill();
      ctx.fillStyle = '#2b2a5c';
      ctx.fillText(text, width / 2, y + 1);
    }
    ctx.restore();
  }

  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
    const sprite = this.glowSprite;
    if (!sprite) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= alpha;
    ctx.drawImage(tintedGlow(sprite, color), x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeGlow(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return canvas;
}

const tinted = new Map<string, HTMLCanvasElement>();

/** The glow sprite in a colour (cached per colour). */
function tintedGlow(sprite: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cached = tinted.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(sprite, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  tinted.set(color, canvas);
  return canvas;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** Mixes two "#rrggbb" colours: k = 0 gives `a`, 1 gives `b`. */
function mixCss(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
