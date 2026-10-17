import { type KoiFish, store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { WindField } from '../engine/wind';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { KoiBook } from '../ui/koiBook';
import { clamp, rand } from '../util/color';
import { waterDistance, type WaterScene } from './boats/maps';
import { landColor, paintScenery, paintShoreMask } from './boats/scenery';
import { type Body, keepInWater } from './boats/twists';
import { drawKoi, koiPattern, type KoiVariety, type Patch, SPINE_POINTS, VARIETIES, varietyById } from './koi/koi';
import displaySource from './shaders/paperBoats.frag?raw';
import { Toy } from './Toy';

const FOAM: RGB = [0.12, 0.12, 0.12];
const WIND_EVERY = 2;
/** Koi length at each stage (baby, young, grown up), in units of the screen's short side. */
const LENGTHS = [0.13, 0.2, 0.28];
/** Food a baby needs to become young, and a young koi to grow up. */
const NEEDS = [6, 8];
/** Grown-up koi eat this many pellets, then are full for a while and leave the food alone. */
const FULL_AFTER = 4;
const FULL_SECONDS = 18;
/** At most this many grown-ups in the pond; the oldest swims off up the stream. */
const MAX_GROWN = 5;
const SCOOPS = 6;
const SCOOP_REFILL = 1.3;
const PELLET_LIFE = 16;
const HINT_AFTER = 6;
const BANNER_SECONDS = 3.8;
const NAMES = ['Mochi', 'Sunny', 'Pebble', 'Ripple', 'Biscuit', 'Lulu', 'Kumo', 'Tofu', 'Maple', 'Nori', 'Peach', 'Coco', 'Hana', 'Sora', 'Yuzu', 'Momo', 'Dumpling', 'Splash'];

type Mode = 'swim' | 'arrive' | 'leave';

interface Koi {
  data: KoiFish;
  variety: KoiVariety;
  patches: Patch[];
  x: number;
  y: number;
  angle: number;
  speed: number;
  wander: number;
  nextWander: number;
  phase: number;
  spine: [number, number][];
  mode: Mode;
  fleeUntil: number;
  fleeAngle: number;
  mouth: number;
  fullUntil: number;
  ate: number;
  /** Length shown, easing toward the stage's length when it grows. */
  length: number;
  alpha: number;
  nextHeart: number;
}

interface Pellet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

interface Leaf extends Body {
  angle: number;
  spin: number;
  color: string;
}

interface Pop {
  x: number;
  y: number;
  age: number;
  kind: 'bubble' | 'heart' | 'sparkle';
  size: number;
}

interface Banner {
  title: string;
  line: string;
  start: number;
}

const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Feed the Koi: a garden pond with koi in it. Tap the water to sprinkle food
 * (from a pouch that slowly refills); it floats and drifts with the current,
 * and swirling moves it. One baby koi at a time is growing up: feed it and it
 * grows, then shows its pattern and goes in your koi book, and a new baby
 * swims in under the bridge. The grown-ups are greedy and quicker, until
 * they're full, and a tap right on top of a koi makes it dart away.
 */
export class FeedKoi extends Toy {
  readonly id = 'koi' as const;
  override readonly light = true;
  override readonly usesOverlay = true;
  override readonly quietIdle = true;

  readonly simConfig: SimConfig = {
    curl: 3,
    velocityDissipation: 0.9,
    densityDissipation: 1.1,
    pressure: 0.8,
    splatRadius: 0.22,
    splatForce: 2400,
  };

  readonly sound: SoundTheme = {
    scale: [62, 64, 67, 69, 71, 74, 76, 79, 81, 83],
    voice: 'kalimba',
    bed: 'brook',
    swish: { type: 'lowpass', low: 250, high: 1000, q: 0.7, gain: 0.045 },
  };

  private display: Program | null = null;
  private wind: WindField | null = null;
  private readonly windAt: [number, number] = [0, 0];
  private readonly water: [number, number] = [0, 0];
  private frame = 0;
  private book: KoiBook | null = null;
  private scene: WaterScene | null = null;
  private scenery: HTMLCanvasElement | null = null;
  private sceneryScale = 1;
  private shore: WebGLTexture | null = null;
  private unit = 1;
  private top = 0.4;
  private streamX = 0.6;
  private pads: [number, number, number][] = [];

  private koi: Koi[] = [];
  private pellets: Pellet[] = [];
  private leaves: Leaf[] = [];
  private pops: Pop[] = [];
  private scoops = SCOOPS;
  private pouchShakeAt = -10;
  private lastTouch = 0;
  private banner: Banner | null = null;
  private babyDueAt = -1;

  strokeColor(): RGB {
    return FOAM;
  }

  mountUi(container: HTMLElement): void {
    this.book = new KoiBook(container, this.env.audio);
  }

  unmountUi(): void {
    this.book?.destroy();
    this.book = null;
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.wind = new WindField(this.env.gpu);
    this.layout();
    this.pellets = [];
    this.pops = [];
    this.scoops = SCOOPS;
    this.babyDueAt = -1;
    this.koi = store.data.koi.fish.map((f) => this.makeKoi(f, false));
    if (!this.koi.some((k) => k.data.stage < 2)) this.babyDueAt = 1;
    this.scatterLeaves();
    const first = Object.keys(store.data.koi.raised).length === 0;
    this.banner = first
      ? { title: 'Feed the baby koi!', line: 'Tap the water to sprinkle food.', start: 0 }
      : { title: 'Your koi pond', line: 'The baby is hungry!', start: 0 };
  }

  override exit(): void {
    this.wind?.dispose();
    this.wind = null;
    if (this.shore) this.env.gpu.gl.deleteTexture(this.shore);
    this.shore = null;
    this.scenery = null;
  }

  override onResize(): void {
    const old = this.unit;
    this.layout();
    const k = this.unit / old;
    if (k !== 1 && Number.isFinite(k)) {
      for (const koi of this.koi) {
        koi.x *= k;
        koi.y *= k;
        koi.spine = koi.spine.map(([x, y]) => [x * k, y * k]);
      }
      for (const p of this.pellets) {
        p.x *= k;
        p.y *= k;
      }
      for (const leaf of this.leaves) {
        leaf.x *= k;
        leaf.y *= k;
        leaf.r *= k;
      }
    }
  }

  override intro(): void {}

  override ambient(): void {}

  override pointerDown(pointer: Pointer): void {
    this.lastTouch = this.time;
    const { audio } = this.env;
    const u = this.unit;
    const x = pointer.x;
    const y = pointer.y;
    if (!this.scene || waterDistance(this.scene, x / u, y / u) > -0.02) return;
    // A tap right on top of a koi startles it.
    for (const koi of this.koi) {
      const [mx, my] = koi.spine[2];
      if (koi.mode === 'swim' && Math.hypot(x - mx, y - my) < u * 0.09 + koi.length * 0.2) {
        koi.fleeUntil = this.time + 0.9;
        koi.fleeAngle = Math.atan2(my - y, mx - x);
        this.pops.push({ x: mx, y: my - koi.length * 0.4, age: 0, kind: 'bubble', size: koi.length * 0.12 });
      }
    }
    if (this.scoops < 1) {
      this.pouchShakeAt = this.time;
      audio.ui('tap');
      return;
    }
    this.scoops -= 1;
    for (let i = 0; i < 3; i++) {
      this.pellets.push({ x: x + rand(-1, 1) * u * 0.03, y: y + rand(-1, 1) * u * 0.03, vx: 0, vy: 0, age: rand(0, 0.3) });
    }
    if (this.pellets.length > 42) this.pellets.splice(0, this.pellets.length - 42);
    audio.plop(x / this.env.view.width - 0.5, rand(0.9, 1.15));
    const [su, sv] = this.uv(x, y);
    this.drop(su, sv, FOAM, 0.3);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    this.lastTouch = this.time;
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { pigment: 0.5, radius: 1.2, push: 1 });
  }

  override update(dt: number): void {
    super.update(dt);
    const { sim } = this.env;
    if (this.wind && ++this.frame % WIND_EVERY === 0) this.wind.update(sim.velocity.read);
    this.scoops = Math.min(SCOOPS, this.scoops + dt / SCOOP_REFILL);
    if (this.babyDueAt >= 0 && this.time >= this.babyDueAt) {
      this.babyDueAt = -1;
      this.newBaby();
    }
    this.updatePellets(dt);
    for (const koi of this.koi) this.updateKoi(koi, dt);
    this.koi = this.koi.filter((k) => !(k.mode === 'leave' && k.alpha <= 0));
    this.separate();
    this.updateLeaves(dt);
    for (const p of this.pops) {
      p.age += dt;
      p.y -= (p.kind === 'heart' ? 30 : 18) * dt;
    }
    this.pops = this.pops.filter((p) => p.age < (p.kind === 'sparkle' ? 0.9 : 1.3));
  }

  render(): void {
    const { gpu, sim, view } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display || !this.shore) return;
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uVelocity'), sim.velocity.read.attach(1));
    gl.uniform1i(display.u('uShore'), gpu.bindTexture(this.shore, 2));
    gl.uniform2f(display.u('uSimShift'), 0, 0);
    gl.uniform2f(display.u('uCamera'), 0, 0);
    gl.uniform2f(display.u('uView'), view.width, view.height);
    gl.uniform2f(display.u('uWorld'), view.width, view.height);
    gl.uniform1f(display.u('uUnit'), this.unit);
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform3f(display.u('uDeep'), 0.1, 0.27, 0.27);
    gl.uniform3f(display.u('uShallow'), 0.32, 0.52, 0.42);
    gl.uniform3f(display.u('uFoam'), 0.9, 0.97, 0.95);
    gl.uniform1f(display.u('uCaustic'), 0.09);
    gl.uniform1f(display.u('uNight'), 0);
    gl.uniform1f(display.u('uWave'), 0);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const t = this.time;

    // Under the surface: the koi. On it: lily pads, food and leaves. Then the garden around.
    for (const koi of this.koi) {
      drawKoi(ctx, { spine: koi.spine, length: koi.length, mouth: koi.mouth, flap: koi.phase * 0.7, alpha: koi.alpha }, koi.variety, koi.patches);
    }
    for (const [x, y, r] of this.pads) this.drawPad(ctx, x, y, r, t);
    for (const p of this.pellets) this.drawPellet(ctx, p);
    for (const leaf of this.leaves) this.drawLeaf(ctx, leaf);
    if (this.scenery) {
      const s = this.sceneryScale;
      ctx.drawImage(this.scenery, 0, 0, width * s, height * s, 0, 0, width, height);
    } else {
      ctx.fillStyle = landColor('garden');
      ctx.fillRect(0, 0, width, height);
    }
    this.drawBridge(ctx);

    for (const koi of this.koi) {
      if (koi.mode === 'swim' && koi.data.stage < 2) this.drawHunger(ctx, koi, t);
    }
    for (const p of this.pops) this.drawPop(ctx, p);
    this.drawPouch(ctx, t);
    this.drawHint(ctx, t);
    this.drawBanner(ctx, t);
  }

  // ---------- The pond ----------

  private layout(): void {
    const { width, height } = this.env.view;
    const u = Math.min(width, height);
    this.unit = u;
    const W = width / u;
    const H = height / u;
    this.top = H > W ? 0.42 : 0.3;
    this.streamX = W * 0.64;
    const bottom = 0.18;
    this.scene = {
      id: 'koi-pond',
      size: [W, H],
      water: [
        { kind: 'rect', x: 0.07, y: this.top, w: W - 0.14, h: H - this.top - bottom, r: Math.min(0.34, (W - 0.14) / 2, (H - this.top - bottom) / 2) },
        {
          kind: 'path',
          points: [
            [this.streamX, -0.3],
            [this.streamX, this.top + 0.1],
          ],
          width: 0.2,
        },
      ],
      islands: [],
      docks: [],
      ground: 'garden',
    };
    const pondH = H - this.top - bottom;
    this.pads = [
      [0.26 * W, this.top + pondH * 0.18, 0.075],
      [0.78 * W, this.top + pondH * 0.52, 0.09],
      [0.3 * W, this.top + pondH * 0.8, 0.07],
    ].map(([x, y, r]) => [x * u, y * u, r * u] as [number, number, number]);
    this.sceneryScale = Math.min(window.devicePixelRatio || 1, 1.5);
    this.scenery = paintScenery(this.scene, u, this.sceneryScale);
    this.shore = this.env.gpu.uploadCanvas(paintShoreMask(this.scene), this.shore);
  }

  private scatterLeaves(): void {
    const scene = this.scene;
    if (!scene) return;
    const u = this.unit;
    const colors = ['#e8534a', '#f08a4b', '#f2c046', '#d9443b'];
    this.leaves = [];
    for (let tries = 0; tries < 200 && this.leaves.length < 6; tries++) {
      const x = rand(0, scene.size[0]);
      const y = rand(this.top, scene.size[1]);
      if (waterDistance(scene, x, y) > -0.06) continue;
      this.leaves.push({ x: x * u, y: y * u, vx: 0, vy: 0, r: u * rand(0.018, 0.026), angle: rand(0, Math.PI * 2), spin: rand(-0.3, 0.3), color: colors[this.leaves.length % colors.length] });
    }
  }

  /** The stirred water under a point, in px/s. */
  private waterAt(x: number, y: number, out: [number, number]): void {
    const { width, height } = this.env.view;
    if (!this.wind) {
      out[0] = 0;
      out[1] = 0;
      return;
    }
    this.wind.sample(x / width, 1 - y / height, this.windAt);
    const texelToPx = width / this.env.sim.velocity.width;
    out[0] = this.windAt[0] * texelToPx * 0.75;
    out[1] = -this.windAt[1] * texelToPx * 0.75;
  }

  private updatePellets(dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    const k = 1 - Math.exp(-dt * 4);
    for (const p of this.pellets) {
      this.waterAt(p.x, p.y, this.water);
      p.vx += (this.water[0] - p.vx) * k;
      p.vy += (this.water[1] - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
      const body: Body = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: this.unit * 0.014 };
      keepInWater(scene, this.unit, body, 0.2);
      p.x = body.x;
      p.y = body.y;
      p.vx = body.vx;
      p.vy = body.vy;
    }
    this.pellets = this.pellets.filter((p) => p.age < PELLET_LIFE);
  }

  private updateLeaves(dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    const k = 1 - Math.exp(-dt * 3);
    for (const leaf of this.leaves) {
      this.waterAt(leaf.x, leaf.y, this.water);
      leaf.vx += (this.water[0] - leaf.vx) * k;
      leaf.vy += (this.water[1] - leaf.vy) * k;
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.angle += (leaf.spin + leaf.vx * 0.004) * dt;
      keepInWater(scene, this.unit, leaf, 0.3);
    }
  }

  // ---------- Koi ----------

  private makeKoi(data: KoiFish, arriving: boolean): Koi {
    const scene = this.scene;
    const u = this.unit;
    const variety = varietyById(data.variety);
    let x = this.streamX * u;
    let y = -LENGTHS[data.stage] * u;
    let angle = Math.PI / 2;
    if (!arriving && scene) {
      for (let tries = 0; tries < 60; tries++) {
        const px = rand(0, scene.size[0]);
        const py = rand(this.top, scene.size[1]);
        if (waterDistance(scene, px, py) < -0.12) {
          x = px * u;
          y = py * u;
          break;
        }
      }
      angle = rand(0, Math.PI * 2);
    }
    const length = LENGTHS[data.stage] * u;
    const seg = length / (SPINE_POINTS - 1);
    const spine = Array.from({ length: SPINE_POINTS }, (_, i) => [x - Math.cos(angle) * seg * i, y - Math.sin(angle) * seg * i] as [number, number]);
    return {
      data,
      variety,
      patches: koiPattern(variety.id, data.id),
      x,
      y,
      angle,
      speed: 0,
      wander: angle,
      nextWander: 0,
      phase: rand(0, 10),
      spine,
      mode: arriving ? 'arrive' : 'swim',
      fleeUntil: 0,
      fleeAngle: 0,
      mouth: 0,
      fullUntil: 0,
      ate: 0,
      length,
      alpha: arriving ? 0 : 1,
      nextHeart: 0,
    };
  }

  private updateKoi(koi: Koi, dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    const u = this.unit;
    const t = this.time;
    const stage = koi.data.stage;
    const grown = stage === 2;
    const full = t < koi.fullUntil;
    koi.length += (LENGTHS[stage] * u - koi.length) * (1 - Math.exp(-dt * 3));
    const L = koi.length;
    koi.mouth = Math.max(0, koi.mouth - dt * 4);

    // Where does it want to go, and how fast?
    let desired = koi.angle;
    let target = u * (grown ? 0.12 : 0.1);
    if (koi.mode === 'arrive') {
      desired = Math.atan2(this.top * u + u * 0.35 - koi.y, this.streamX * u - koi.x);
      koi.alpha = Math.min(1, koi.alpha + dt * 1.5);
      if (waterDistance(scene, koi.x / u, koi.y / u) < -0.15 && koi.y > (this.top + 0.2) * u) koi.mode = 'swim';
    } else if (koi.mode === 'leave') {
      desired = Math.atan2(-u - koi.y, this.streamX * u - koi.x);
      target = u * 0.16;
      if (koi.y < this.top * u) koi.alpha = Math.max(0, koi.alpha - dt * 0.8);
    } else if (t < koi.fleeUntil) {
      desired = koi.fleeAngle;
      target = u * 0.45;
    } else {
      const food = full ? null : this.nearestPellet(koi, u * (grown ? 0.42 : 0.5));
      if (food) {
        desired = Math.atan2(food.y - koi.y, food.x - koi.x);
        target = u * [0.22, 0.26, 0.32][stage];
      } else {
        if (t > koi.nextWander) {
          koi.wander = koi.angle + rand(-1.2, 1.2);
          koi.nextWander = t + rand(2, 4.5);
        }
        desired = koi.wander;
        target *= full ? 0.7 : 1;
      }
      // Turn away from the shore before reaching it.
      const ahead = L * 0.6 + u * 0.06;
      const px = (koi.x + Math.cos(koi.angle) * ahead) / u;
      const py = (koi.y + Math.sin(koi.angle) * ahead) / u;
      if (waterDistance(scene, px, py) > -0.05) {
        const e = 0.01;
        const gx = waterDistance(scene, px + e, py) - waterDistance(scene, px - e, py);
        const gy = waterDistance(scene, px, py + e) - waterDistance(scene, px, py - e);
        desired = Math.atan2(-gy, -gx);
        koi.wander = desired;
      }
    }
    const turn = (t < koi.fleeUntil || koi.mode !== 'swim' ? 4 : 2.6) * dt;
    koi.angle += clamp(angleDiff(desired, koi.angle), -turn, turn);
    koi.speed += (target - koi.speed) * (1 - Math.exp(-dt * 2.5));
    this.waterAt(koi.x, koi.y, this.water);
    koi.x += Math.cos(koi.angle) * koi.speed * dt + this.water[0] * 0.3 * dt;
    koi.y += Math.sin(koi.angle) * koi.speed * dt + this.water[1] * 0.3 * dt;
    if (koi.mode === 'swim') {
      const body: Body = { x: koi.x, y: koi.y, vx: 0, vy: 0, r: L * 0.14 };
      keepInWater(scene, u, body, 0);
      koi.x = body.x;
      koi.y = body.y;
    }

    // The body follows the head, with a gentle side-to-side swim.
    koi.phase += dt * (3 + (koi.speed / u) * 14);
    const wiggle = Math.sin(koi.phase) * L * 0.03;
    const seg = L / (SPINE_POINTS - 1);
    koi.spine[0] = [koi.x - Math.sin(koi.angle) * wiggle, koi.y + Math.cos(koi.angle) * wiggle];
    for (let i = 1; i < SPINE_POINTS; i++) {
      const [ax, ay] = koi.spine[i - 1];
      const [bx, by] = koi.spine[i];
      const d = Math.hypot(bx - ax, by - ay) || 1;
      koi.spine[i] = [ax + ((bx - ax) / d) * seg, ay + ((by - ay) / d) * seg];
    }

    if (koi.mode === 'swim' && !full) this.eat(koi);
    if (full && t > koi.nextHeart) {
      koi.nextHeart = t + 2.2;
      this.pops.push({ x: koi.x, y: koi.y - L * 0.3, age: 0, kind: 'heart', size: u * 0.016 });
    }
  }

  private nearestPellet(koi: Koi, sight: number): Pellet | null {
    let best: Pellet | null = null;
    let bestD = sight;
    for (const p of this.pellets) {
      const d = Math.hypot(p.x - koi.x, p.y - koi.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Gulps any food right at its mouth. */
  private eat(koi: Koi): void {
    const L = koi.length;
    const mx = koi.x + Math.cos(koi.angle) * L * 0.08;
    const my = koi.y + Math.sin(koi.angle) * L * 0.08;
    const reach = Math.max(L * 0.12, this.unit * 0.025);
    const index = this.pellets.findIndex((p) => Math.hypot(p.x - mx, p.y - my) < reach);
    if (index < 0) return;
    this.pellets.splice(index, 1);
    koi.mouth = 1;
    const { audio } = this.env;
    const pan = koi.x / this.env.view.width - 0.5;
    audio.babble(koi.data.stage === 2 ? 45 : 57 + koi.data.stage * 4, pan);
    this.pops.push({ x: mx, y: my, age: 0, kind: 'bubble', size: L * 0.07 });

    const data = koi.data;
    if (data.stage === 2) {
      koi.ate += 1;
      if (koi.ate >= FULL_AFTER) {
        koi.ate = 0;
        koi.fullUntil = this.time + FULL_SECONDS;
        koi.nextHeart = this.time;
      }
      return;
    }
    data.eaten += 1;
    if (data.eaten < NEEDS[data.stage]) return;
    data.eaten = 0;
    data.stage += 1;
    for (let i = 0; i < 8; i++) {
      this.pops.push({ x: koi.x + rand(-1, 1) * L * 0.5, y: koi.y + rand(-1, 1) * L * 0.4, age: rand(-0.3, 0), kind: 'sparkle', size: this.unit * rand(0.012, 0.022) });
    }
    if (data.stage === 2) this.grownUp(koi);
    else {
      audio.chime(koi.x / this.env.view.width, 0.7);
      this.env.haptics.tap(0.4);
    }
    store.save();
  }

  /** A koi has grown up: it goes in the book, and a new baby will come. */
  private grownUp(koi: Koi): void {
    const { audio, haptics } = this.env;
    const koiSave = store.data.koi;
    koiSave.raised[koi.variety.id] = (koiSave.raised[koi.variety.id] ?? 0) + 1;
    audio.celebrate();
    haptics.tap(0.8);
    this.banner = { title: `${koi.data.name} is all grown up!`, line: `A beautiful ${koi.variety.name} koi.`, start: this.time };
    this.book?.refresh();
    // The pond only holds so many; the oldest grown-up heads off up the stream.
    const grown = this.koi.filter((k) => k.data.stage === 2 && k.mode === 'swim');
    if (grown.length > MAX_GROWN) {
      const oldest = grown[0];
      oldest.mode = 'leave';
      koiSave.fish = koiSave.fish.filter((f) => f !== oldest.data);
    }
    this.babyDueAt = this.time + 4;
  }

  private newBaby(): void {
    const koiSave = store.data.koi;
    const variety = VARIETIES[koiSave.next % VARIETIES.length];
    koiSave.next += 1;
    koiSave.born += 1;
    const used = new Set(koiSave.fish.map((f) => f.name));
    const names = NAMES.filter((n) => !used.has(n));
    const data: KoiFish = { id: koiSave.born, variety: variety.id, name: names[Math.floor(Math.random() * names.length)] ?? 'Koi', stage: 0, eaten: 0 };
    koiSave.fish.push(data);
    store.save();
    this.koi.push(this.makeKoi(data, true));
    this.banner = { title: `A baby ${variety.name} swam in!`, line: `Say hello to ${data.name}.`, start: this.time };
    this.env.audio.chime(this.streamX / (this.env.view.width / this.unit), 0.5);
  }

  /** Koi gently keep out of each other's way. */
  private separate(): void {
    for (let i = 0; i < this.koi.length; i++) {
      for (let j = i + 1; j < this.koi.length; j++) {
        const a = this.koi[i];
        const b = this.koi[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = (a.length + b.length) * 0.32;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }

  // ---------- Drawing ----------

  /** Over the baby: a little bubble of food it wants, and dots for how close it is to growing. */
  private drawHunger(ctx: CanvasRenderingContext2D, koi: Koi, t: number): void {
    const u = this.unit;
    const need = NEEDS[koi.data.stage];
    const r = u * 0.04 * (1 + 0.05 * Math.sin(t * 4));
    const x = koi.x;
    const y = koi.y - koi.length * 0.35 - u * 0.07;
    ctx.save();
    ctx.globalAlpha = koi.alpha;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.85);
    ctx.lineTo(x, y + r * 1.5);
    ctx.lineTo(x + r * 0.3, y + r * 0.85);
    ctx.fill();
    for (const [dx, dy] of [
      [-0.32, 0.12],
      [0.3, 0.16],
      [0, -0.24],
    ]) {
      ctx.fillStyle = '#b06a3b';
      ctx.beginPath();
      ctx.arc(x + dx * r, y + dy * r, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Growth dots.
    const dot = u * 0.009;
    const gap = dot * 2.6;
    const startX = x - ((need - 1) * gap) / 2;
    for (let i = 0; i < need; i++) {
      ctx.fillStyle = i < koi.data.eaten ? '#ffcf5a' : 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(startX + i * gap, y - r - dot * 2.2, dot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    const bob = Math.sin(t * 0.8 + x) * r * 0.03;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(0, 25, 20, 0.22)';
    ctx.beginPath();
    ctx.ellipse(r * 0.1, r * 0.18, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c9a4c';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, 0.25, Math.PI * 2 - 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 240, 170, 0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = 0.6 + (i / 6) * Math.PI * 1.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPellet(ctx: CanvasRenderingContext2D, p: Pellet): void {
    const r = this.unit * 0.014;
    const fade = clamp((PELLET_LIFE - p.age) / 2, 0, 1);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0, 20, 20, 0.25)';
    ctx.beginPath();
    ctx.arc(p.x + 1.5, p.y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b06a3b';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 170, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf): void {
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle);
    ctx.fillStyle = leaf.color;
    ctx.beginPath();
    // A little five-pointed maple leaf.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? leaf.r * 0.45 : leaf.r;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A red arched bridge over the stream where new babies swim in. */
  private drawBridge(ctx: CanvasRenderingContext2D): void {
    const u = this.unit;
    const x = this.streamX * u;
    const y = this.top * u * 0.62;
    const half = u * 0.17;
    const deck = u * 0.075;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 20, 20, 0.25)';
    ctx.fillRect(x - half + 4, y - deck / 2 + 6, half * 2, deck);
    ctx.fillStyle = '#b7854f';
    ctx.fillRect(x - half, y - deck / 2, half * 2, deck);
    ctx.strokeStyle = 'rgba(90, 55, 30, 0.45)';
    ctx.lineWidth = 1;
    for (let px = x - half; px <= x + half; px += deck * 0.32) {
      ctx.beginPath();
      ctx.moveTo(px, y - deck / 2);
      ctx.lineTo(px, y + deck / 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#d9443b';
    for (const side of [-1, 1]) {
      ctx.fillRect(x - half, y + side * deck * 0.5 - u * 0.006, half * 2, u * 0.012);
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(x - half + (i / 4) * half * 2, y + side * deck * 0.5, u * 0.012, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawPop(ctx: CanvasRenderingContext2D, p: Pop): void {
    if (p.age < 0) return;
    const k = p.age / (p.kind === 'sparkle' ? 0.9 : 1.3);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (p.kind === 'bubble') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'heart') {
      const s = p.size;
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.9);
      ctx.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.5, p.y - s * 1.2, p.x, p.y - s * 0.35);
      ctx.bezierCurveTo(p.x + s * 0.5, p.y - s * 1.2, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s * 0.9);
      ctx.fill();
    } else {
      const s = p.size * (1 - k * 0.5);
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
      ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The food pouch at the bottom, with dots for scoops left. It refills by itself. */
  private drawPouch(ctx: CanvasRenderingContext2D, t: number): void {
    const { width, height } = this.env.view;
    const u = this.unit;
    const x = width / 2;
    const y = height - u * 0.085;
    const s = u * 0.06;
    const shake = t - this.pouchShakeAt < 0.4 ? Math.sin((t - this.pouchShakeAt) * 40) * 0.15 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(shake);
    ctx.fillStyle = 'rgba(30, 40, 20, 0.2)';
    ctx.beginPath();
    ctx.ellipse(s * 0.1, s * 0.75, s * 0.9, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9d3a8';
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.5);
    ctx.quadraticCurveTo(-s * 1.0, s * 0.7, 0, s * 0.75);
    ctx.quadraticCurveTo(s * 1.0, s * 0.7, s * 0.55, -s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9443b';
    ctx.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 0.16);
    ctx.fillStyle = '#b06a3b';
    for (const [dx, dy] of [
      [-0.2, 0.1],
      [0.18, 0.2],
      [0, -0.12],
    ]) {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s + s * 0.15, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const dot = u * 0.01;
    for (let i = 0; i < SCOOPS; i++) {
      const fill = clamp(this.scoops - i, 0, 1);
      const dx = x + (i - (SCOOPS - 1) / 2) * dot * 2.8;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(dx, y + s * 1.15, dot, 0, Math.PI * 2);
      ctx.fill();
      if (fill > 0) {
        ctx.fillStyle = '#b06a3b';
        ctx.beginPath();
        ctx.arc(dx, y + s * 1.15, dot * fill, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** After a quiet spell, a pulsing finger shows where to drop food: near the baby, not on it. */
  private drawHint(ctx: CanvasRenderingContext2D, t: number): void {
    const baby = this.koi.find((k) => k.data.stage < 2 && k.mode === 'swim');
    if (!baby || !this.scene) return;
    const first = Object.keys(store.data.koi.raised).length === 0 && baby.data.eaten === 0 && baby.data.stage === 0;
    const idle = t - this.lastTouch - (first ? 2 : HINT_AFTER);
    if (idle < 0) return;
    const u = this.unit;
    let x = baby.x + Math.cos(baby.angle) * u * 0.2;
    let y = baby.y + Math.sin(baby.angle) * u * 0.2;
    if (waterDistance(this.scene, x / u, y / u) > -0.05) {
      x = baby.x;
      y = baby.y - u * 0.18;
    }
    const k = (idle % 1.4) / 1.4;
    ctx.save();
    ctx.globalAlpha = Math.min(1, idle * 2) * (1 - k);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, u * (0.03 + k * 0.05), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, idle * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, u * 0.03 * (k < 0.15 ? 0.8 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, t: number): void {
    const banner = this.banner;
    if (!banner) return;
    const age = t - banner.start;
    if (age > BANNER_SECONDS) {
      this.banner = null;
      return;
    }
    const { width } = this.env.view;
    const u = this.unit;
    const k = Math.min(1, age / 0.35, (BANNER_SECONDS - age) / 0.5);
    const titleSize = Math.round(u * 0.056);
    const lineSize = Math.round(u * 0.036);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${lineSize}px Nunito, Fredoka, system-ui, sans-serif`;
    const lineW = ctx.measureText(banner.line).width;
    ctx.font = `800 ${titleSize}px Nunito, Fredoka, system-ui, sans-serif`;
    const w = Math.min(width - 24, Math.max(ctx.measureText(banner.title).width, lineW) + 40);
    const h = titleSize + lineSize + 30;
    const x = width / 2;
    const y = this.top * u + u * 0.12 + h / 2 + (1 - k) * -14;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.shadowColor = 'rgba(20, 40, 60, 0.25)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2f3a4f';
    ctx.fillText(banner.title, x, y - lineSize * 0.62, w - 24);
    ctx.font = `700 ${lineSize}px Nunito, Fredoka, system-ui, sans-serif`;
    ctx.fillStyle = '#5b6680';
    ctx.fillText(banner.line, x, y + titleSize * 0.55, w - 24);
    ctx.restore();
  }
}
