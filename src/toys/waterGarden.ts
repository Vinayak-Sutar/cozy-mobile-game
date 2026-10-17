import { GARDEN_SLOTS, store, type GardenSlot } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { WindField } from '../engine/wind';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { GardenTray, type TrayItem } from '../ui/gardenTray';
import { Herbarium } from '../ui/herbarium';
import { clamp, rand } from '../util/color';
import { drawFlower, drawPot, speciesById } from './flowers';
import displaySource from './shaders/waterGarden.frag?raw';
import { Toy } from './Toy';

/** The garden bed, in simulation space (0..1, y up). */
const BED_TOP = 0.36;
const BED_BOTTOM = 0.285;
const BED_LEFT = 0.1;
const BED_RIGHT = 0.9;
const CLOUD_Y = 0.82;
/** Growth added by each raindrop that lands on a plant (3 = full bloom: about 6 s of rain). */
const DROP_GROWTH = 0.016;
const HOLD_TO_PICK = 0.7;
const WIND_EVERY = 3;

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Bird {
  x: number;
  y: number;
  speed: number;
  phase: number;
  size: number;
}

const easeOutBack = (x: number): number => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

/**
 * Water the Garden: pick seeds and pots from the tray and plant them in the
 * bed, then hold the little cloud and steer its rain over them. Swirling
 * elsewhere stirs the wind, which blows the rain. Plants grow seed → sprout →
 * bud → bloom, and the garden is saved just as you leave it. Long-press a
 * plant to pick it.
 */
export class WaterGarden extends Toy {
  readonly id = 'water' as const;
  override readonly usesOverlay = true;
  override readonly quietIdle = true;
  override readonly ghostColor = 'rgba(40, 70, 110, 0.7)';

  readonly simConfig: SimConfig = {
    curl: 8,
    velocityDissipation: 0.9,
    densityDissipation: 0.9,
    pressure: 0.8,
    splatRadius: 0.25,
    splatForce: 2600,
  };

  readonly sound: SoundTheme = {
    scale: [64, 67, 69, 72, 74, 76, 79, 81, 84],
    voice: 'kalimba',
    bed: 'brook',
    swish: { type: 'bandpass', low: 300, high: 1400, q: 0.7, gain: 0.04 },
  };

  private display: Program | null = null;
  private wind: WindField | null = null;
  private readonly windAt: [number, number] = [0, 0];
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private birds: Bird[] = [];
  private nextBird = 4;
  private frame = 0;
  private cloud = { x: 0.5, target: 0.5, pointer: null as number | null, rainLeft: 0, everHeld: false, spawn: 0 };
  /** Smoothed growth per slot, so plants grow visibly rather than jump. */
  private shown: number[] = [];
  private plantedAt: number[] = [];
  private hold: { pointer: number; slot: number; start: number; x: number; y: number } | null = null;
  private hover: number | null = null;
  private dirty = false;
  private saveIn = 0;
  private celebrated = false;
  private tray: GardenTray | null = null;
  private herbarium: Herbarium | null = null;

  private get slots(): GardenSlot[] {
    return store.data.garden.slots;
  }

  /** Swirling leaves a faint trail of mist, which is how you see the wind. */
  strokeColor(): RGB {
    return [0.035, 0, 0];
  }

  mountUi(container: HTMLElement): void {
    this.herbarium = new Herbarium(container, this.env.audio);
    this.tray = new GardenTray(
      container,
      {
        slotAt: (x, y) => this.slotAt(x, y),
        place: (slot, item) => this.place(slot, item),
        hover: (slot) => (this.hover = slot),
      },
      this.env.audio,
      this.env.haptics,
    );
    // An empty garden starts with the tray open, so the first step is obvious.
    if (this.slots.every((s) => !s.plant)) window.setTimeout(() => this.tray?.toggle(true), 700);
  }

  unmountUi(): void {
    this.tray?.destroy();
    this.herbarium?.destroy();
    this.tray = null;
    this.herbarium = null;
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.wind = new WindField(this.env.gpu);
    this.shown = this.slots.map((s) => (s.plant ? s.growth : 0));
    this.plantedAt = this.slots.map(() => -10);
    this.drops = [];
    this.splashes = [];
    this.birds = [];
    this.cloud = { x: 0.5, target: 0.5, pointer: null, rainLeft: 0, everHeld: false, spawn: 0 };
    this.celebrated = this.allBloomed();
  }

  override exit(): void {
    this.saveNow();
    this.env.audio.setRain(0);
    this.wind?.dispose();
    this.wind = null;
  }

  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    const { width, height } = this.env.view;
    const [u, v] = this.uv(pointer.x, pointer.y);
    if (pointer.synthetic) return;

    // The cloud: touch it (or anywhere high in the sky) to hold it and make it rain.
    const cloudX = this.cloud.x * width;
    const cloudY = (1 - CLOUD_Y) * height;
    if (this.cloud.pointer === null && (Math.hypot(pointer.x - cloudX, pointer.y - cloudY) < this.cloudSize() * 3 || v > 0.72)) {
      this.cloud.pointer = pointer.id;
      this.cloud.target = clamp(u, 0.06, 0.94);
      this.cloud.everHeld = true;
      this.tray?.toggle(false);
      return;
    }

    const slot = this.slotAt(pointer.x, pointer.y);
    if (slot !== null) {
      const picked = this.tray?.selected;
      if (picked) {
        if (this.place(slot, picked)) this.tray?.clearSelection();
        return;
      }
      if (this.slots[slot].plant) {
        // Start a long-press to pick this plant.
        this.hold = { pointer: pointer.id, slot, start: this.time, x: pointer.x, y: pointer.y };
        return;
      }
      // An empty spot: offer the seeds.
      this.tray?.toggle(true);
      return;
    }

    this.tray?.toggle(false);
    // Anywhere else: a little gust.
    this.drop(u, v, [0.08, 0, 0], 0.4);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    if (pointer.id === this.cloud.pointer) {
      this.cloud.target = clamp(pointer.x / this.env.view.width, 0.06, 0.94);
      return;
    }
    if (this.hold && this.hold.pointer === pointer.id) {
      if (Math.hypot(pointer.x - this.hold.x, pointer.y - this.hold.y) < 16) return;
      this.hold = null;
    }
    // Stir the air: the rain blows along with it.
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { radius: 1.6, push: 1.3, pigment: 1 });
  }

  override pointerUp(pointer: Pointer): void {
    if (pointer.id === this.cloud.pointer) {
      this.cloud.pointer = null;
      this.cloud.rainLeft = 1.2;
    }
    if (this.hold?.pointer === pointer.id) this.hold = null;
  }

  override update(dt: number): void {
    super.update(dt);
    const { sim } = this.env;
    const { width, height } = this.env.view;
    const t = this.time;

    // The cloud glides after your finger.
    this.cloud.x += (this.cloud.target - this.cloud.x) * Math.min(1, dt * 5);
    const raining = this.cloud.pointer !== null || this.cloud.rainLeft > 0;
    this.cloud.rainLeft = Math.max(0, this.cloud.rainLeft - dt);
    const rainLevel = this.cloud.pointer !== null ? 1 : this.cloud.rainLeft / 1.2;
    this.env.audio.setRain(rainLevel);

    if (raining) {
      // Raindrops from under the cloud, plus a soft downdraft and a little mist.
      const s = this.cloudSize();
      this.cloud.spawn += dt * 55 * rainLevel;
      while (this.cloud.spawn >= 1) {
        this.cloud.spawn -= 1;
        this.drops.push({
          x: this.cloud.x * width + rand(-s * 1.5, s * 1.5),
          y: (1 - CLOUD_Y) * height + s * 0.6,
          vx: 0,
          vy: rand(80, 140),
        });
      }
      sim.splatVelocity(this.cloud.x, CLOUD_Y - 0.06, 0, -90 * rainLevel, 1.2);
      sim.splatDye(this.cloud.x, CLOUD_Y - 0.03, [0.02 * rainLevel, 0, 0], 1.2);
    }

    if (this.wind && ++this.frame % WIND_EVERY === 0) this.wind.update(sim.velocity.read);
    this.updateDrops(dt, width, height);
    this.updateSplashes(dt);
    this.updateBirds(dt, width, height);

    // Plants ease toward their real growth so you can watch them stretch.
    this.slots.forEach((slot, i) => {
      const target = slot.plant ? slot.growth : 0;
      this.shown[i] += (target - this.shown[i]) * Math.min(1, dt * 2.5);
    });

    // Long-press to pick a plant.
    if (this.hold && t - this.hold.start >= HOLD_TO_PICK) {
      this.pick(this.hold.slot);
      this.hold = null;
    }

    if (this.dirty) {
      this.saveIn -= dt;
      if (this.saveIn <= 0) this.saveNow();
    }
  }

  render(): void {
    const { gpu, sim } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display) return;
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1f(display.u('uAspect'), gpu.aspect);
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform1f(display.u('uBedTop'), BED_TOP);
    gl.uniform1f(display.u('uBedBottom'), BED_BOTTOM);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const minDim = Math.min(width, height);
    const t = this.time;
    this.drawBirds(ctx);
    const showSpots = !!this.tray?.isOpen || !!this.tray?.selected || this.hover !== null;
    this.slots.forEach((slot, i) => this.drawSlot(ctx, slot, i, width, height, minDim, t, showSpots));
    this.drawRain(ctx);
    this.drawCloud(ctx, this.cloud.x * width, (1 - CLOUD_Y) * height, t);
    const needsWater = this.slots.some((s) => s.plant && s.growth < 3);
    if (!this.cloud.everHeld && needsWater) this.drawCloudHint(ctx, this.cloud.x * width, (1 - CLOUD_Y) * height, t);
  }

  // ---------- Planting ----------

  private slotX(i: number): number {
    return BED_LEFT + ((BED_RIGHT - BED_LEFT) * (i + 0.5)) / GARDEN_SLOTS;
  }

  /** The planting spot under a screen point: generous, so small fingers hit it. */
  private slotAt(clientX: number, clientY: number): number | null {
    const { width, height } = this.env.view;
    const spacing = ((BED_RIGHT - BED_LEFT) / GARDEN_SLOTS) * width;
    // From well above the plants down to the front of the bed: easy to hit with a finger.
    const top = (1 - BED_TOP) * height - Math.min(width, height) * 0.26;
    const bottom = (1 - BED_BOTTOM) * height + 10;
    if (clientY < top || clientY > bottom) return null;
    for (let i = 0; i < GARDEN_SLOTS; i++) {
      if (Math.abs(clientX - this.slotX(i) * width) < spacing / 2) return i;
    }
    return null;
  }

  private place(slotIndex: number, item: TrayItem): boolean {
    const slot = this.slots[slotIndex];
    const { audio, haptics } = this.env;
    if (item.kind === 'pot') {
      slot.pot = item.id === 'none' ? null : item.id;
    } else {
      if (slot.plant) {
        // Spot taken: a little bounce says "already growing here".
        this.plantedAt[slotIndex] = this.time - 0.35;
        haptics.tap(0.2);
        return false;
      }
      slot.plant = item.id;
      slot.growth = 0;
      this.shown[slotIndex] = 0;
      this.celebrated = false;
    }
    this.plantedAt[slotIndex] = this.time;
    audio.ui('select');
    haptics.tap(0.5);
    this.puff(slotIndex);
    this.markDirty();
    this.saveNow();
    return true;
  }

  private pick(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot.plant) return;
    slot.plant = null;
    slot.growth = 0;
    this.shown[slotIndex] = 0;
    this.env.audio.ui('open');
    this.env.haptics.tap(0.6);
    this.puff(slotIndex);
    this.markDirty();
    this.saveNow();
  }

  /** A puff of soil when something is planted or picked. */
  private puff(slotIndex: number): void {
    const { width, height } = this.env.view;
    const x = this.slotX(slotIndex) * width;
    const y = (1 - BED_TOP) * height;
    for (let i = 0; i < 8; i++) {
      this.splashes.push({ x, y, vx: rand(-60, 60), vy: rand(-140, -60), life: 0.6 });
    }
  }

  // ---------- Rain ----------

  private updateDrops(dt: number, width: number, height: number): void {
    const { sim } = this.env;
    const ground = (1 - BED_TOP) * height;
    const spacing = ((BED_RIGHT - BED_LEFT) / GARDEN_SLOTS) * width;
    const texelToPx = width / sim.velocity.width;
    const terminal = height * 0.75;
    const alive: Drop[] = [];

    for (const d of this.drops) {
      // Blown by the wind you stir up, falling toward a gentle top speed.
      this.wind?.sample(d.x / width, 1 - d.y / height, this.windAt);
      d.vx += (this.windAt[0] * texelToPx - d.vx) * Math.min(1, dt * 4);
      d.vy = Math.min(terminal, d.vy + height * 1.2 * dt) - this.windAt[1] * texelToPx * dt * 2;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < -20 || d.x > width + 20) continue;

      const slotIndex = Math.round(((d.x / width - BED_LEFT) / (BED_RIGHT - BED_LEFT)) * GARDEN_SLOTS - 0.5);
      const slot = this.slots[slotIndex];
      const onPlant = !!slot?.plant && Math.abs(d.x - this.slotX(slotIndex) * width) < spacing * 0.38;
      const landY = onPlant && slot.pot ? ground - this.potWidth() * 0.62 : ground;
      if (d.y < landY) {
        alive.push(d);
        continue;
      }

      // Splash, darken the soil, and feed the plant if it landed on one.
      for (let i = 0; i < 2; i++) this.splashes.push({ x: d.x, y: landY, vx: rand(-40, 40), vy: rand(-90, -40), life: 0.35 });
      if (Math.random() < 0.5) sim.splatDye(d.x / width, BED_TOP - 0.012, [0, 0.12, 0], 0.18);
      if (onPlant && slot.growth < 3) {
        const before = Math.floor(slot.growth);
        slot.growth = Math.min(3, slot.growth + DROP_GROWTH);
        this.markDirty();
        if (Math.floor(slot.growth) > before) this.onStage(slotIndex, Math.floor(slot.growth));
      }
    }
    this.drops = alive;
  }

  /** A plant reached a new stage: sprout, bud, then bloom. */
  private onStage(slotIndex: number, stage: number): void {
    const { audio, haptics, view } = this.env;
    const slot = this.slots[slotIndex];
    const u = this.slotX(slotIndex);
    audio.chime(u, 0.3 + stage * 0.2);
    haptics.tap(0.3 + stage * 0.15);
    if (stage < 3 || !slot.plant) return;

    const species = speciesById(slot.plant);
    if (species) {
      const flowers = store.data.garden.flowers;
      const isNew = !flowers[species.id];
      flowers[species.id] = (flowers[species.id] ?? 0) + 1;
      this.herbarium?.refresh(isNew ? species : null);
    }
    const x = u * view.width;
    const y = (1 - BED_TOP) * view.height - Math.min(view.width, view.height) * 0.12;
    for (let i = 0; i < 10; i++) this.splashes.push({ x, y, vx: rand(-80, 80), vy: rand(-120, -20), life: 0.8 });
    if (!this.celebrated && this.allBloomed()) {
      this.celebrated = true;
      audio.celebrate();
    }
  }

  private allBloomed(): boolean {
    return this.slots.every((s) => s.plant && s.growth >= 3);
  }

  private updateSplashes(dt: number): void {
    const gravity = this.env.view.height * 0.9;
    for (const s of this.splashes) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += gravity * dt;
      s.life -= dt;
    }
    this.splashes = this.splashes.filter((s) => s.life > 0);
  }

  private drawRain(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 150, 220, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of this.drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * 0.025, d.y - Math.max(6, d.vy * 0.025));
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(160, 200, 240, 0.9)';
    for (const s of this.splashes) {
      ctx.globalAlpha = Math.min(1, s.life * 2.5);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Drawing ----------

  private cloudSize(): number {
    return Math.min(this.env.view.width, this.env.view.height) * 0.05;
  }

  private potWidth(): number {
    return Math.min(this.env.view.width, this.env.view.height) * 0.085;
  }

  private drawSlot(
    ctx: CanvasRenderingContext2D,
    slot: GardenSlot,
    i: number,
    width: number,
    height: number,
    minDim: number,
    t: number,
    showSpots: boolean,
  ): void {
    const x = this.slotX(i) * width;
    const ground = (1 - BED_TOP) * height;
    // Things just placed pop in with a little bounce.
    const age = t - this.plantedAt[i];
    const pop = age < 0.5 ? easeOutBack(clamp(age / 0.5, 0, 1)) : 1;

    ctx.save();
    ctx.translate(x, ground);
    if (!slot.plant && !slot.pot) {
      // An empty spot: a little dug hole; a pulsing dashed ring while planting.
      ctx.fillStyle = 'rgba(60, 38, 24, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 1, minDim * 0.03, minDim * 0.008, 0, 0, Math.PI * 2);
      ctx.fill();
      if (showSpots) {
        const pulse = 1 + Math.sin(t * 4 + i) * 0.08;
        ctx.strokeStyle = this.hover === i ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = this.hover === i ? 3 : 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(0, -minDim * 0.04, minDim * 0.045 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }

    ctx.scale(pop, pop);
    let base = 0;
    if (slot.pot) {
      drawPot(ctx, slot.pot, this.potWidth());
      base = -this.potWidth() * 0.62;
    }
    if (slot.plant) {
      const species = speciesById(slot.plant);
      const g = this.shown[i];
      ctx.translate(0, base);
      if (g < 0.05 || !species) {
        // Freshly planted: a small mound with a seed peeking out.
        ctx.fillStyle = '#7a5236';
        ctx.beginPath();
        ctx.ellipse(0, 0, minDim * 0.022, minDim * 0.01, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#c79a5b';
        ctx.beginPath();
        ctx.ellipse(0, -minDim * 0.006, 3.5, 2.4, -0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // seed → sprout (0..1) → bud (1..2) → bloom (2..3)
        const grow = g < 1 ? 0.15 + 0.35 * g : g < 2 ? 0.5 + 0.35 * (g - 1) : 0.85 + 0.15 * (g - 2);
        const open = g < 1 ? 0 : g < 2 ? 0.12 * (g - 1) : 0.12 + 0.88 * (g - 2);
        const sway = Math.sin(t * 1.3 + i * 1.7) * 0.1;
        drawFlower(ctx, species, minDim * (slot.pot ? 0.1 : 0.12), minDim * 0.032, grow, open, sway);
      }
      if (slot.growth < 3) this.drawThirst(ctx, slot.growth, minDim, t, i);
      if (this.hold && this.hold.slot === i) this.drawHoldRing(ctx, minDim, (t - this.hold.start) / HOLD_TO_PICK);
    }
    ctx.restore();
  }

  /** A little ring above a growing plant shows progress to its next stage. */
  private drawThirst(ctx: CanvasRenderingContext2D, growth: number, minDim: number, t: number, i: number): void {
    // Hover just above the plant: low over a seed, higher as it grows.
    const y = -minDim * (0.06 + 0.1 * clamp(growth / 2.5, 0, 1)) + Math.sin(t * 2 + i) * 1.5;
    const r = minDim * 0.022;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(0, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#3f8ff0';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, y, r, -Math.PI / 2, -Math.PI / 2 + (growth % 1) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#5aa9ff';
    ctx.beginPath();
    ctx.moveTo(0, y - r * 0.55);
    ctx.quadraticCurveTo(r * 0.45, y + r * 0.15, 0, y + r * 0.4);
    ctx.quadraticCurveTo(-r * 0.45, y + r * 0.15, 0, y - r * 0.55);
    ctx.fill();
  }

  private drawHoldRing(ctx: CanvasRenderingContext2D, minDim: number, progress: number): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -minDim * 0.08, minDim * 0.06, -Math.PI / 2, -Math.PI / 2 + clamp(progress, 0, 1) * Math.PI * 2);
    ctx.stroke();
  }

  /** A friendly little cloud: sleepy when resting, eyes open while it rains. */
  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const s = this.cloudSize();
    const raining = this.cloud.pointer !== null || this.cloud.rainLeft > 0;
    const by = y + Math.sin(t * 1.4) * 2;
    const fill = raining ? '#eef4fb' : '#ffffff';
    const puff = (): void => {
      ctx.beginPath();
      ctx.arc(x - s * 1.05, by + s * 0.1, s * 0.75, 0, Math.PI * 2);
      ctx.arc(x - s * 0.2, by - s * 0.35, s * 0.95, 0, Math.PI * 2);
      ctx.arc(x + s * 0.8, by - s * 0.05, s * 0.85, 0, Math.PI * 2);
      ctx.arc(x + s * 1.35, by + s * 0.3, s * 0.6, 0, Math.PI * 2);
      ctx.ellipse(x, by + s * 0.35, s * 1.8, s * 0.6, 0, 0, Math.PI * 2);
    };
    ctx.save();
    ctx.shadowColor = 'rgba(40, 80, 140, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = fill;
    puff();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(110, 145, 190, 0.55)';
    ctx.lineWidth = 2;
    puff();
    ctx.stroke();
    ctx.fillStyle = fill;
    puff();
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 180, 215, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, by + s * 0.55, s * 1.6, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4a5a78';
    ctx.fillStyle = '#4a5a78';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const dx of [-0.45, 0.45]) {
      ctx.beginPath();
      if (raining) {
        ctx.arc(x + dx * s, by + s * 0.05, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.arc(x + dx * s, by + s * 0.05, s * 0.16, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    if (raining) {
      ctx.ellipse(x, by + s * 0.32, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(x, by + s * 0.28, s * 0.14, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 150, 170, 0.45)';
    for (const dx of [-0.8, 0.8]) {
      ctx.beginPath();
      ctx.ellipse(x + dx * s, by + s * 0.28, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** "Hold me and move me": little arrows and a bobbing raindrop. */
  private drawCloudHint(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const s = this.cloudSize();
    const nudge = Math.sin(t * 3) * 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 70, 110, 0.75)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const ax = x + side * (s * 2.6 + nudge);
      ctx.beginPath();
      ctx.moveTo(ax - side * 7, y - 9);
      ctx.lineTo(ax, y);
      ctx.lineTo(ax - side * 7, y + 9);
      ctx.stroke();
    }
    const dropY = y + s * 1.4 + ((t * 40) % 24);
    ctx.fillStyle = 'rgba(90, 150, 220, 0.8)';
    ctx.beginPath();
    ctx.ellipse(x, dropY, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private updateBirds(dt: number, width: number, height: number): void {
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = rand(9, 18);
      const y = height * rand(0.08, 0.3);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        this.birds.push({
          x: dir > 0 ? -20 - i * 18 : width + 20 + i * 18,
          y: y + i * 8,
          speed: dir * rand(28, 40),
          phase: rand(0, 6),
          size: rand(5, 7),
        });
      }
    }
    for (const b of this.birds) {
      b.x += b.speed * dt;
      b.phase += dt * 6;
    }
    this.birds = this.birds.filter((b) => b.x > -60 && b.x < width + 60);
  }

  private drawBirds(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 70, 90, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const b of this.birds) {
      const flap = Math.sin(b.phase) * b.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.size, b.y - flap);
      ctx.quadraticCurveTo(b.x - b.size * 0.4, b.y - b.size * 0.4, b.x, b.y);
      ctx.quadraticCurveTo(b.x + b.size * 0.4, b.y - b.size * 0.4, b.x + b.size, b.y - flap);
      ctx.stroke();
    }
    ctx.restore();
  }

  private markDirty(): void {
    if (!this.dirty) this.saveIn = 1.5;
    this.dirty = true;
  }

  private saveNow(): void {
    if (!this.dirty) return;
    this.dirty = false;
    store.save();
  }
}
