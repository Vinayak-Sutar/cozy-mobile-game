import { store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import { Probe } from '../engine/probe';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { icons } from '../ui/icons';
import { ColorBook, PaintPots, type PainterTool } from '../ui/paintPots';
import type { PauseAction } from '../ui/pause';
import { clamp, hex, rand, scale, toCss } from '../util/color';
import {
  FIRST_WISHES,
  PAINTER_DEPTH,
  PRIMARIES,
  PRIMARY_ABSORPTION,
  recipeAbsorption,
  shade,
  WISHES,
  wishCloseness,
  type Wish,
} from './mixing';
import { PaperRenderer } from './paper';
import { Toy } from './Toy';

/** Pip's dish, in simulation space (0..1, y up), and its radius as a fraction of the short side. */
const DISH = { x: 0.5, y: 0.42 };
const DISH_RADIUS = 0.3;
/** How long the dish must stay a match before Pip drinks it. */
const MATCH_HOLD = 0.6;
const HINT_AFTER = 15;
const PROBE_EVERY = 4;
/** Probe values are absorption x this, so readings up to 8 fit in a byte. */
const PROBE_SCALE = 1 / 8;

type Phase = 'asking' | 'drinking' | 'happy';

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  heart: boolean;
}

const easeOutBack = (x: number): number => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

/**
 * Little Painter: Pip asks for a colour. Mix red, yellow and blue in Pip's
 * dish until the ring around it fills; Pip drinks the paint, turns that
 * colour, and the colour goes in your colour book. Stuck? After a while a
 * small hint shows which paints make it.
 */
export class LittlePainter extends Toy {
  readonly id = 'painter' as const;
  override readonly light = true;
  override readonly quietIdle = true;
  override readonly usesOverlay = true;
  override readonly ghostColor = 'rgba(92, 72, 52, 0.75)';

  readonly simConfig: SimConfig = {
    curl: 3,
    velocityDissipation: 1.8,
    densityDissipation: 0,
    pressure: 0.7,
    splatRadius: 0.14,
    splatForce: 2200,
  };

  readonly sound: SoundTheme = {
    scale: [53, 57, 60, 62, 65, 67, 69, 72, 74, 77],
    voice: 'marimba',
    bed: 'paper',
    swish: { type: 'bandpass', low: 1500, high: 4000, q: 0.6, gain: 0.03 },
  };

  private renderer: PaperRenderer | null = null;
  private probe: Probe | null = null;
  private pots: PaintPots | null = null;
  private book: ColorBook | null = null;
  private tool: PainterTool = 'blue';
  private wish: Wish = WISHES[0];
  private target: RGB = [1, 1, 1];
  private mix: RGB = [1, 1, 1];
  private mixAbsorption: RGB = [0, 0, 0];
  private closeness = 0;
  private matchTimer = 0;
  private phase: Phase = 'asking';
  private phaseStart = 0;
  private wishStart = 0;
  private pipColor: RGB = hex('#f1ece4');
  private pipFrom: RGB = hex('#f1ece4');
  private bits: Bit[] = [];
  private frame = 0;
  private samples: RGB[] = [];
  private cleaning = 0;
  private nextBlink = 3;

  strokeColor(): RGB {
    if (this.tool === 'sponge') return [0, 0, 0];
    const i = PRIMARIES.findIndex((p) => p.id === this.tool);
    // Tuned so one even coat over the dish is about one "unit" of that paint.
    return scale(PRIMARY_ABSORPTION[i], 0.085);
  }

  mountUi(container: HTMLElement): void {
    this.book = new ColorBook(container, this.env.audio);
    this.pots = new PaintPots(container, this.tool, (tool) => (this.tool = tool), this.env.audio, this.env.haptics);
  }

  unmountUi(): void {
    this.pots?.destroy();
    this.book?.destroy();
    this.pots = null;
    this.book = null;
  }

  override pauseActions(): PauseAction[] {
    return [{ label: 'Clean paper', icon: icons.sparkle, run: () => (this.cleaning = 0.6) }];
  }

  protected override onEnter(): void {
    this.renderer = new PaperRenderer(this.env.gpu);
    this.renderer.depth = PAINTER_DEPTH;
    this.renderer.enter();
    this.probe = new Probe(this.env.gpu);
    this.bits = [];
    this.cleaning = 0;
    this.newWish();
  }

  override exit(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.probe?.dispose();
    this.probe = null;
  }

  override onResize(): void {
    this.renderer?.bake();
  }

  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    // The brush rests while Pip drinks and celebrates, so the dish starts clean next time.
    if (pointer.synthetic || this.phase !== 'asking') return;
    const [u, v] = this.uv(pointer.x, pointer.y);
    if (this.tool === 'sponge') this.env.sim.liftDye(u, v, 0.35, 1.6);
    else this.env.sim.splatDye(u, v, scale(this.strokeColor(), 0.6), 0.9);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    if (this.phase !== 'asking') return;
    if (this.tool === 'sponge') {
      const { sim } = this.env;
      const dx = pointer.x - x0;
      const dy = pointer.y - y0;
      const steps = Math.min(14, Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8)));
      const strength = Math.min(0.5, 0.2 * Math.max(0.25, dt * 60));
      for (let i = 1; i <= steps; i++) {
        const [u, v] = this.uv(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
        sim.liftDye(u, v, strength, 1.6);
      }
      return;
    }
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { radius: 1.3, push: 0.35, pigment: 1, spacing: 12, maxSteps: 12 });
  }

  override update(dt: number): void {
    super.update(dt);
    const { sim, audio, haptics } = this.env;
    const t = this.time;
    const inPhase = t - this.phaseStart;

    if (this.cleaning > 0) {
      this.cleaning -= dt;
      sim.scaleDye(this.cleaning > 0 ? Math.exp(-dt * 9) : 0);
    }

    if (this.phase === 'asking' && this.probe && ++this.frame % PROBE_EVERY === 0) {
      this.measureDish();
      const { closeness, matched } = wishCloseness(this.mixAbsorption, this.wish);
      this.closeness += (closeness - this.closeness) * 0.5;
      this.matchTimer = matched ? this.matchTimer + dt * PROBE_EVERY : 0;
      if (this.matchTimer >= MATCH_HOLD) this.startDrinking();
    }

    if (this.phase !== 'asking') {
      // Pip drinks the dish dry (and it stays clean until the next wish).
      sim.liftDye(DISH.x, DISH.y, 0.12, this.dishLiftScale());
    }
    if (this.phase === 'drinking') {
      // ...and turns the colour of the paint.
      const k = clamp(inPhase / 1.2, 0, 1);
      this.pipColor = this.pipFrom.map((c, i) => c + (this.target[i] - c) * k) as RGB;
      if (Math.random() < 0.6) this.spawnSip();
      if (inPhase >= 1.2) {
        this.phase = 'happy';
        this.phaseStart = t;
        audio.celebrate();
        haptics.tap(0.8);
        this.grant();
        for (let i = 0; i < 8; i++) this.spawnHeart();
      }
    } else if (this.phase === 'happy' && inPhase >= 1.8) {
      this.newWish();
    }

    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.heart) b.vy -= 20 * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    this.nextBlink -= dt;
    if (this.nextBlink < -0.15) this.nextBlink = rand(2.5, 5);
  }

  render(): void {
    this.renderer?.render(this.env.sim);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const minDim = Math.min(width, height);
    const t = this.time;
    this.drawDish(ctx, DISH.x * width, (1 - DISH.y) * height, minDim * DISH_RADIUS, t);
    this.drawPip(ctx, width * 0.27, height * 0.2, minDim * 0.1, t);
    this.drawBubble(ctx, width * 0.66, height * 0.17, minDim, t);
    for (const b of this.bits) {
      ctx.save();
      ctx.globalAlpha = clamp(b.life * 2, 0, 1);
      ctx.fillStyle = b.color;
      if (b.heart) this.heart(ctx, b.x, b.y, 7);
      else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- Wishes ----------

  private newWish(): void {
    const granted = store.data.painter.granted;
    const next =
      granted < FIRST_WISHES.length
        ? WISHES.find((w) => w.id === FIRST_WISHES[granted])
        : (() => {
            const pool = WISHES.filter((w) => w.id !== this.wish.id);
            return pool[Math.floor(Math.random() * pool.length)];
          })();
    this.wish = next ?? WISHES[0];
    this.target = shade(recipeAbsorption(this.wish.recipe));
    this.phase = 'asking';
    this.phaseStart = this.time;
    this.wishStart = this.time;
    this.closeness = 0;
    this.matchTimer = 0;
    this.env.audio.ui('open');
  }

  private startDrinking(): void {
    this.phase = 'drinking';
    this.phaseStart = this.time;
    this.pipFrom = [...this.pipColor] as RGB;
    this.env.audio.chime(0.5, 0.6);
    this.env.haptics.tap(0.5);
  }

  private grant(): void {
    const painter = store.data.painter;
    painter.granted += 1;
    painter.made[this.wish.id] = (painter.made[this.wish.id] ?? 0) + 1;
    store.save();
    this.book?.refresh();
  }

  /**
   * Size for a lift stamp that covers the whole dish: the splat falls to ~55%
   * at the rim (splat radius is in hundredths of screen height, widened by
   * the aspect ratio on landscape screens).
   */
  private dishLiftScale(): number {
    const { width, height } = this.env.view;
    const rimInHeights = (Math.min(width, height) * DISH_RADIUS) / height;
    const aspect = width / height;
    return (rimInHeights * rimInHeights) / 0.6 / (this.simConfig.splatRadius / 100) / (aspect > 1 ? aspect : 1);
  }

  /** Average colour in the dish: a ring of sample points plus the centre. */
  private measureDish(): void {
    const { width, height } = this.env.view;
    const r = Math.min(width, height) * DISH_RADIUS * 0.55;
    const points: [number, number][] = [[DISH.x, DISH.y]];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      points.push([DISH.x + (Math.cos(a) * r) / width, DISH.y + (Math.sin(a) * r) / height]);
    }
    this.probe?.readRgb(this.env.sim.dye.read, points, 0.025, PROBE_SCALE, this.samples);
    const avg: RGB = [0, 0, 0];
    for (const s of this.samples) for (let c = 0; c < 3; c++) avg[c] += s[c] / PROBE_SCALE / this.samples.length;
    this.mixAbsorption = avg;
    this.mix = shade(avg);
  }

  // ---------- Drawing ----------

  private drawDish(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    ctx.save();
    // A ceramic rim around the paper "bowl".
    ctx.shadowColor = 'rgba(60, 40, 20, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.strokeStyle = '#fbf7f0';
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(120, 95, 70, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r - r * 0.06, 0, Math.PI * 2);
    ctx.stroke();

    // The closeness ring fills with the colour you've mixed.
    if (this.phase === 'asking' && this.closeness > 0.01) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = r * 0.075 + 4;
      ctx.lineCap = 'round';
      const end = -Math.PI / 2 + this.closeness * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, end);
      ctx.stroke();
      ctx.strokeStyle = toCss(this.mix);
      ctx.lineWidth = r * 0.075;
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, end);
      ctx.stroke();
      if (this.closeness > 0.85) {
        // Almost there: little twinkles around the rim.
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
          const a = t * 1.5 + (i / 5) * Math.PI * 2;
          const tw = 0.5 + 0.5 * Math.sin(t * 6 + i);
          this.star(ctx, x + Math.cos(a) * r * 1.12, y + Math.sin(a) * r * 1.12, 3 + tw * 3);
        }
      }
    }
    ctx.restore();
  }

  private drawPip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    const happy = this.phase === 'happy';
    const drinking = this.phase === 'drinking';
    const excited = this.phase === 'asking' && this.closeness > 0.7;
    const bounce = happy ? Math.abs(Math.sin(t * 9)) * r * 0.25 : Math.sin(t * (excited ? 6 : 2)) * r * (excited ? 0.08 : 0.04);
    const squash = 1 + Math.sin(t * (excited ? 6 : 2)) * 0.03;
    const cy = y - bounce;
    const body = toCss(this.pipColor);

    ctx.save();
    // Shadow, then a round body with a little sprout on top.
    ctx.fillStyle = 'rgba(60, 40, 20, 0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.95, r * 0.8, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5ea85a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 0.95);
    ctx.quadraticCurveTo(x + r * 0.1, cy - r * 1.25, x + r * 0.05, cy - r * 1.35);
    ctx.stroke();
    ctx.fillStyle = '#7cc274';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.22, cy - r * 1.28, r * 0.2, r * 0.09, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(70, 50, 40, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, cy, r * squash, r / squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Eyes look toward the dish; closed in delight when happy; blink now and then.
    const { width, height } = this.env.view;
    const look = Math.atan2((1 - DISH.y) * height - cy, DISH.x * width - x);
    ctx.fillStyle = '#3b3346';
    ctx.strokeStyle = '#3b3346';
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      const ex = x + side * r * 0.32;
      const ey = cy - r * 0.08;
      ctx.beginPath();
      if (happy) {
        ctx.arc(ex, ey + r * 0.04, r * 0.11, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (this.nextBlink < 0) {
        ctx.moveTo(ex - r * 0.1, ey);
        ctx.lineTo(ex + r * 0.1, ey);
        ctx.stroke();
      } else {
        ctx.arc(ex + Math.cos(look) * r * 0.04, ey + Math.sin(look) * r * 0.04, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255, 140, 160, 0.5)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * r * 0.55, cy + r * 0.18, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mouth: a smile, a bigger smile when excited, an "o" while drinking.
    ctx.beginPath();
    if (drinking) {
      ctx.fillStyle = '#3b3346';
      ctx.ellipse(x, cy + r * 0.3, r * 0.12, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(x, cy + r * 0.12, r * (excited || happy ? 0.26 : 0.18), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The wish: a speech bubble with a splash of the colour, and later a recipe hint. */
  private drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, minDim: number, t: number): void {
    if (this.phase !== 'asking') return;
    const pop = easeOutBack(clamp((t - this.wishStart) / 0.45, 0, 1));
    const w = minDim * 0.36 * pop;
    const h = minDim * 0.26 * pop;
    if (w < 2) return;
    const hint = t - this.wishStart > HINT_AFTER;

    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 20, 0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.3);
    ctx.fill();
    // Tail pointing at Pip.
    ctx.beginPath();
    ctx.moveTo(x - w * 0.32, y + h * 0.25);
    ctx.lineTo(x - w * 0.62, y + h * 0.62);
    ctx.lineTo(x - w * 0.12, y + h * 0.38);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // A wobbly paint splash of the wished colour.
    const sx = x;
    const sy = hint ? y - h * 0.12 : y;
    const sr = Math.min(w, h) * (hint ? 0.26 : 0.33);
    ctx.fillStyle = toCss(this.target);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const wobble = 1 + 0.08 * Math.sin(a * 5 + t * 1.5) + 0.05 * Math.sin(a * 3 - t);
      const px = sx + Math.cos(a) * sr * wobble;
      const py = sy + Math.sin(a) * sr * wobble;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.fill();

    if (hint) {
      // Which paints make it: little dots joined by "+".
      const parts = this.wish.recipe
        .map((amount, i) => ({ amount, color: PRIMARIES[i].hex }))
        .filter((p) => p.amount > 0);
      const gap = w * 0.2;
      const startX = x - ((parts.length - 1) * gap) / 2;
      const dotY = y + h * 0.3;
      ctx.font = `${Math.round(h * 0.16)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      parts.forEach((p, i) => {
        const dx = startX + i * gap;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(dx, dotY, h * (0.05 + 0.04 * Math.min(1.5, p.amount)), 0, Math.PI * 2);
        ctx.fill();
        if (i < parts.length - 1) {
          ctx.fillStyle = '#8a7a6a';
          ctx.fillText('+', dx + gap / 2, dotY);
        }
      });
    }
    ctx.restore();
  }

  private spawnSip(): void {
    const { width, height } = this.env.view;
    const minDim = Math.min(width, height);
    const a = rand(0, Math.PI * 2);
    const r = rand(0, minDim * DISH_RADIUS * 0.7);
    const sx = DISH.x * width + Math.cos(a) * r;
    const sy = (1 - DISH.y) * height + Math.sin(a) * r;
    const tx = width * 0.27;
    const ty = height * 0.2 + minDim * 0.03;
    this.bits.push({ x: sx, y: sy, vx: (tx - sx) / 0.6, vy: (ty - sy) / 0.6, life: 0.6, color: toCss(this.target), heart: false });
  }

  private spawnHeart(): void {
    const { width, height } = this.env.view;
    this.bits.push({
      x: width * 0.27 + rand(-30, 30),
      y: height * 0.2 + rand(-20, 10),
      vx: rand(-25, 25),
      vy: rand(-70, -40),
      life: rand(1, 1.6),
      color: Math.random() < 0.5 ? '#ff8fb1' : toCss(this.target),
      heart: true,
    });
  }

  private heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.5, y - s * 1.2, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
    ctx.fill();
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? s * 0.35 : s;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}
