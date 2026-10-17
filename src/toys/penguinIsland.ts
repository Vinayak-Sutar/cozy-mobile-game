import { store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { ChickBook } from '../ui/chickBook';
import { Wardrobe } from '../ui/wardrobe';
import { clamp, rand } from '../util/color';
import { drawLandmark } from './boats/landmarks';
import { waterDistance } from './boats/maps';
import { drawProp, paintShoreMask } from './boats/scenery';
import { type Carry, CHICKS, type Chick, drawCarry, drawChick, drawFish, drawGlide, drawPebble, drawPenguin, type Wear } from './penguin/characters';
import {
  CHICK_SPOTS,
  FISHING_HOLES,
  HOME,
  ISLAND_H,
  ISLAND_W,
  MITTEN,
  OBSTACLES,
  PEBBLES,
  paintIsland,
  SCENE,
  START,
  slopeAt,
  type Terrain,
  terrainAt,
  VILLAGERS,
} from './penguin/island';
import { Talk } from './penguin/talk';
import displaySource from './shaders/paperBoats.frag?raw';
import { Toy } from './Toy';

/** Pebble's height, and a chick's, in units of the screen's short side. */
const PEBBLE = 0.125;
const CHICK = 0.062;
const BODY_R = 0.035;
/** Waddling speed, and how fast a belly-glide can start, in units per second. */
const WALK = 0.27;
const GLIDE_MIN = 0.45;
const GLIDE_MAX = 1.15;
/** How quickly a glide slows on each ground (per second), and how well feet grip it. */
const FRICTION: Record<Terrain, number> = { snow: 1.5, ice: 0.06, powder: 4.5 };
const GRIP: Record<Terrain, number> = { snow: 10, ice: 1.3, powder: 7 };
const WALK_SPEED: Record<Terrain, number> = { snow: 1, ice: 0.8, powder: 0.5 };
/** Drag this far (units) for full walking speed. */
const JOYSTICK = 0.12;
/** A release faster than this (units per second) is a flick. */
const FLICK = 0.9;
const CHICK_GAP = 0.075;
const BANNER_SECONDS = 3.8;

type Mode = 'stand' | 'glide';
type ChickState = 'lost' | 'follow' | 'homeward' | 'home';

interface ChickBody {
  chick: Chick;
  state: ChickState;
  x: number;
  y: number;
  hop: number;
  facing: number;
  nextPeep: number;
  homeAt: number;
}

interface Touch {
  pointer: Pointer;
  x0: number;
  y0: number;
  start: number;
  moved: boolean;
  history: [number, number, number][];
}

interface Fish {
  hole: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  born: number;
}

interface Mark {
  x: number;
  y: number;
  angle: number;
  age: number;
  kind: 'step' | 'groove' | 'spray';
  side: number;
}

interface Pop {
  x: number;
  y: number;
  age: number;
  kind: 'heart' | 'sparkle' | 'plus';
}

interface Banner {
  title: string;
  line: string;
  start: number;
}

type VillagerId = keyof typeof VILLAGERS;

const ISLANDERS: Record<VillagerId, { name: string; voice: number; wear: Wear[]; body: string }> = {
  grandpa: { name: 'Grandpa Waddle', voice: 47, wear: ['glasses', 'scarf'], body: '#3a3f52' },
  skipper: { name: 'Skipper', voice: 54, wear: ['captain'], body: '#2c3344' },
  auntie: { name: 'Auntie Flo', voice: 66, wear: ['bow'], body: '#353a4e' },
};

const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Penguin Island: help Pebble the penguin find the lost chicks on a snowy
 * island and bring them home. Drag to waddle; flick to belly-glide (fast on
 * ice, slow in powder, quicker downhill). Found chicks follow in a line.
 * Fish pop out of fishing holes; islanders ask for little favours; shiny
 * pebbles hide in nooks; fish buy hats and scarves.
 */
export class PenguinIsland extends Toy {
  readonly id = 'penguin' as const;
  override readonly light = true;
  override readonly usesOverlay = true;
  override readonly quietIdle = true;

  readonly simConfig: SimConfig = {
    curl: 3,
    velocityDissipation: 0.9,
    densityDissipation: 0.9,
    pressure: 0.8,
    splatRadius: 0.22,
    splatForce: 2400,
  };

  readonly sound: SoundTheme = {
    scale: [64, 66, 68, 71, 73, 76, 78, 80, 83, 85],
    voice: 'bell',
    bed: 'lullaby',
    swish: { type: 'highpass', low: 900, high: 2600, q: 0.7, gain: 0.035 },
  };

  private display: Program | null = null;
  private scenery: HTMLCanvasElement | null = null;
  private sceneryScale = 1;
  private shore: WebGLTexture | null = null;
  private unit = 1;
  private camX = 0;
  private camY = 0;
  private simX = 0;
  private simY = 0;
  private book: ChickBook | null = null;
  private wardrobe: Wardrobe | null = null;
  private readonly talk = new Talk();

  // Pebble.
  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private mode: Mode = 'stand';
  private slowFor = 0;
  private facing = 1;
  private back = false;
  private phase = 0;
  private walk = 0;
  private flapAt = -10;
  private glideAngle = 0;
  private carrying: Carry[] = [];
  private trail: [number, number][] = [];
  private touch: Touch | null = null;
  private lastTouch = 0;
  private lastStep = 0;
  private lastSplash = -10;

  private chicks: ChickBody[] = [];
  private fish: Fish[] = [];
  private nextFish: number[] = [];
  private marks: Mark[] = [];
  private pops: Pop[] = [];
  private flakes: { x: number; y: number; vy: number; phase: number; size: number }[] = [];
  private banner: Banner | null = null;
  private lastProgress = 0;
  private talkedAt: Record<string, number> = {};
  private wanderAt = -1;
  private readonly slope: [number, number] = [0, 0];

  strokeColor(): RGB {
    return [0.12, 0.12, 0.12];
  }

  mountUi(container: HTMLElement): void {
    this.book = new ChickBook(container, this.env.audio);
    this.wardrobe = new Wardrobe(container, this.env.audio, () => this.env.audio.chime(0.5, 0.8));
  }

  unmountUi(): void {
    this.book?.destroy();
    this.book = null;
    this.wardrobe?.destroy();
    this.wardrobe = null;
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.layout();
    this.shore = this.env.gpu.uploadCanvas(paintShoreMask(SCENE), this.shore);
    const u = this.unit;
    this.px = START[0] * u;
    this.py = START[1] * u;
    this.vx = 0;
    this.vy = 0;
    this.mode = 'stand';
    this.trail = [];
    this.marks = [];
    this.pops = [];
    this.fish = [];
    this.carrying = [];
    this.talk.clear();
    this.nextFish = FISHING_HOLES.map(() => rand(1, 4));
    this.wanderAt = -1;
    this.placeChicks();
    this.scatterFlakes();
    this.updateCamera(0, true);
    const first = store.data.penguin.found.length === 0;
    this.banner = first
      ? { title: 'Help Pebble find the lost chicks!', line: 'Drag to waddle. Flick to slide on your tummy!', start: 0 }
      : { title: 'Penguin Island', line: `${Object.keys(store.data.penguin.lost).length} chicks are still out playing.`, start: 0 };
  }

  override exit(): void {
    if (this.shore) this.env.gpu.gl.deleteTexture(this.shore);
    this.shore = null;
    this.scenery = null;
  }

  override onResize(): void {
    const old = this.unit;
    this.layout();
    const k = this.unit / old;
    if (k !== 1 && Number.isFinite(k)) {
      this.px *= k;
      this.py *= k;
      this.vx *= k;
      this.vy *= k;
      for (const c of this.chicks) {
        c.x *= k;
        c.y *= k;
      }
      this.trail = this.trail.map(([x, y]) => [x * k, y * k]);
      for (const f of this.fish) {
        f.x *= k;
        f.y *= k;
        f.fromX *= k;
        f.fromY *= k;
      }
      this.marks = [];
    }
    this.updateCamera(0, true);
  }

  override intro(): void {}

  override ambient(): void {}

  protected override uv(x: number, y: number): [number, number] {
    const { width, height } = this.env.view;
    return [(x + this.camX - this.simX) / width, 1 - (y + this.camY - this.simY) / height];
  }

  // ---------- Controls ----------

  override pointerDown(pointer: Pointer): void {
    this.lastTouch = this.time;
    if (this.touch) return;
    this.touch = { pointer, x0: pointer.x, y0: pointer.y, start: this.time, moved: false, history: [[pointer.x, pointer.y, this.time]] };
  }

  override pointerMove(pointer: Pointer): void {
    this.lastTouch = this.time;
    const touch = this.touch;
    if (!touch || touch.pointer !== pointer) return;
    touch.history.push([pointer.x, pointer.y, this.time]);
    while (touch.history.length > 2 && this.time - touch.history[0][2] > 0.12) touch.history.shift();
    if (Math.hypot(pointer.x - touch.x0, pointer.y - touch.y0) > this.unit * 0.03) touch.moved = true;
  }

  override pointerUp(pointer: Pointer): void {
    const touch = this.touch;
    if (!touch || touch.pointer !== pointer) return;
    this.touch = null;
    const u = this.unit;
    // How fast the finger was moving as it let go.
    const [x0, y0, t0] = touch.history[0];
    const dt = Math.max(1 / 60, this.time - t0);
    const fvx = (pointer.x - x0) / dt / u;
    const fvy = (pointer.y - y0) / dt / u;
    const speed = Math.hypot(fvx, fvy);
    if (speed > FLICK && Math.hypot(pointer.x - x0, pointer.y - y0) > u * 0.02) {
      this.glide(Math.atan2(fvy, fvx), clamp(speed * 0.55, GLIDE_MIN, GLIDE_MAX));
    } else if (!touch.moved && this.time - touch.start < 0.3) {
      this.tap();
    }
  }

  private glide(angle: number, speed: number): void {
    const u = this.unit;
    const wasGliding = this.mode === 'glide';
    this.mode = 'glide';
    this.slowFor = 0;
    // A new flick while gliding adds a push in the new direction rather than resetting.
    const keep = wasGliding ? 0.5 : 0;
    this.vx = this.vx * keep + Math.cos(angle) * speed * u;
    this.vy = this.vy * keep + Math.sin(angle) * speed * u;
    this.glideAngle = Math.atan2(this.vy, this.vx);
    this.env.audio.whoosh(speed / GLIDE_MAX, this.panAt(this.px));
    this.env.haptics.tap(0.15);
    if (speed > 0.85 && !this.talk.busy(this.time) && Math.random() < 0.35) this.say('pebble', rand(0, 1) < 0.5 ? 'Wheee!' : 'Whoosh!');
  }

  /** A tap stands him up if he's gliding, or makes him flap hello. */
  private tap(): void {
    if (this.mode === 'glide') {
      this.mode = 'stand';
      this.vx *= 0.3;
      this.vy *= 0.3;
    } else {
      this.flapAt = this.time;
      this.env.audio.babble(66, this.panAt(this.px));
    }
  }

  // ---------- Update ----------

  override update(dt: number): void {
    super.update(dt);
    const t = this.time;
    this.movePebble(dt);
    this.updateChicks(dt);
    this.updateFish(dt);
    this.updateFinds();
    this.updateIslanders();
    for (const m of this.marks) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < (m.kind === 'spray' ? 0.6 : 7));
    for (const p of this.pops) {
      p.age += dt;
      p.y -= this.unit * 0.12 * dt;
    }
    this.pops = this.pops.filter((p) => p.age < 1.2);
    this.updateFlakes(dt);
    if (this.wanderAt > 0 && t > this.wanderAt) this.wanderOff();
    const speaker = this.talk.speaker;
    this.talk.update(t, this.env.audio, speaker ? this.panAt(this.speakerPos(speaker)[0]) : 0);
    this.updateCamera(dt);
  }

  private movePebble(dt: number): void {
    const u = this.unit;
    const terrain = terrainAt(this.px / u, this.py / u);
    // The joystick: how far the finger has been dragged from where it touched down.
    let jx = 0;
    let jy = 0;
    if (this.touch?.moved) {
      jx = (this.touch.pointer.x - this.touch.x0) / (JOYSTICK * u);
      jy = (this.touch.pointer.y - this.touch.y0) / (JOYSTICK * u);
      const m = Math.hypot(jx, jy);
      if (m > 1) {
        jx /= m;
        jy /= m;
      }
    }
    slopeAt(this.px / u, this.py / u, this.slope);

    if (this.mode === 'stand') {
      const tx = jx * WALK * u * WALK_SPEED[terrain] + this.slope[0] * u * 0.08;
      const ty = jy * WALK * u * WALK_SPEED[terrain] + this.slope[1] * u * 0.08;
      const k = 1 - Math.exp(-dt * GRIP[terrain]);
      this.vx += (tx - this.vx) * k;
      this.vy += (ty - this.vy) * k;
    } else {
      const decay = Math.exp(-dt * FRICTION[terrain]);
      this.vx = this.vx * decay + this.slope[0] * u * 0.9 * dt;
      this.vy = this.vy * decay + this.slope[1] * u * 0.9 * dt;
      // Dragging while sliding steers gently.
      if (Math.hypot(jx, jy) > 0.25) {
        const speed = Math.hypot(this.vx, this.vy);
        const a = Math.atan2(this.vy, this.vx);
        const turn = clamp(angleDiff(Math.atan2(jy, jx), a), -1.4 * dt, 1.4 * dt);
        this.vx = Math.cos(a + turn) * speed;
        this.vy = Math.sin(a + turn) * speed;
      }
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > u * 0.05) this.glideAngle = Math.atan2(this.vy, this.vx);
      this.slowFor = speed < u * 0.06 ? this.slowFor + dt : 0;
      if (this.slowFor > 0.25) {
        this.mode = 'stand';
        this.flapAt = this.time;
      }
    }

    const oldX = this.px;
    const oldY = this.py;
    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.collide();

    // Which way he faces, and the waddle.
    const speed = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > u * 0.03) this.facing += (Math.sign(this.vx) - this.facing) * (1 - Math.exp(-dt * 10));
    this.back = this.mode === 'stand' && this.vy < -Math.abs(this.vx) * 1.2 && speed > u * 0.05;
    this.walk = this.mode === 'stand' ? clamp(speed / (WALK * u), 0, 1) : 0;
    const before = this.phase;
    this.phase += dt * (4 + 9 * this.walk);

    // Footprints while walking, a groove and snow spray while sliding.
    const moved = Math.hypot(this.px - oldX, this.py - oldY);
    if (this.mode === 'stand' && this.walk > 0.2 && Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI) && terrain !== 'ice') {
      this.lastStep = -this.lastStep || 1;
      const a = Math.atan2(this.vy, this.vx);
      this.marks.push({ x: this.px - Math.sin(a) * u * 0.012 * this.lastStep, y: this.py + Math.cos(a) * u * 0.012 * this.lastStep, angle: a, age: 0, kind: 'step', side: this.lastStep });
    }
    if (this.mode === 'glide' && moved > 0) {
      let last: Mark | undefined;
      for (let i = this.marks.length - 1; i >= 0 && !last; i--) if (this.marks[i].kind === 'groove') last = this.marks[i];
      if (!last || Math.hypot(last.x - this.px, last.y - this.py) > u * 0.015) {
        this.marks.push({ x: this.px, y: this.py, angle: this.glideAngle, age: 0, kind: 'groove', side: 0 });
      }
      if (terrain !== 'ice' && speed > u * 0.3 && Math.random() < dt * 40) {
        this.marks.push({ x: this.px - Math.cos(this.glideAngle) * u * 0.05 + rand(-1, 1) * u * 0.02, y: this.py - Math.sin(this.glideAngle) * u * 0.05 + rand(-1, 1) * u * 0.02, angle: 0, age: 0, kind: 'spray', side: 0 });
      }
    }
    if (this.marks.length > 260) this.marks.splice(0, this.marks.length - 260);

    // A trail of where he's been, for the chicks to follow.
    const lastTrail = this.trail[this.trail.length - 1];
    if (!lastTrail || Math.hypot(lastTrail[0] - this.px, lastTrail[1] - this.py) > u * 0.012) {
      this.trail.push([this.px, this.py]);
      if (this.trail.length > 400) this.trail.shift();
    }
  }

  /** Bumps off rocks, trees and igloos, and stays out of the sea. */
  private collide(): void {
    const u = this.unit;
    const r = BODY_R * u;
    const bounce = this.mode === 'glide' ? 0.55 : 0;
    for (const o of OBSTACLES) {
      const ox = o.x * u;
      const oy = o.y * u;
      const dx = this.px - ox;
      const dy = this.py - oy;
      const d = Math.hypot(dx, dy);
      const min = o.r * u + r;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      this.px = ox + nx * min;
      this.py = oy + ny * min;
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        this.vx -= (1 + bounce) * vn * nx;
        this.vy -= (1 + bounce) * vn * ny;
        if (-vn > u * 0.3) {
          this.env.haptics.tap(0.2);
          this.env.audio.ui('tap');
        }
      }
    }
    // The shore: push back onto land, with a splash if he hit the water fast.
    const x = this.px / u;
    const y = this.py / u;
    const d = waterDistance(SCENE, x, y);
    if (d < BODY_R) {
      const e = 0.01;
      let gx = waterDistance(SCENE, x + e, y) - waterDistance(SCENE, x - e, y);
      let gy = waterDistance(SCENE, x, y + e) - waterDistance(SCENE, x, y - e);
      const len = Math.hypot(gx, gy) || 1;
      gx /= len;
      gy /= len;
      this.px += gx * (BODY_R - d) * u;
      this.py += gy * (BODY_R - d) * u;
      const vn = this.vx * gx + this.vy * gy;
      if (vn < 0) {
        this.vx -= (1 + bounce * 0.7) * vn * gx;
        this.vy -= (1 + bounce * 0.7) * vn * gy;
        if (-vn > u * 0.25 && this.time - this.lastSplash > 0.8) this.splash(this.px - gx * u * 0.06, this.py - gy * u * 0.06, -vn / u);
      }
    }
    this.px = clamp(this.px, r, ISLAND_W * u - r);
    this.py = clamp(this.py, r, ISLAND_H * u - r);
  }

  private splash(x: number, y: number, speed: number): void {
    this.lastSplash = this.time;
    const [su, sv] = this.uv(x - this.camX, y - this.camY);
    this.drop(su, sv, [0.25, 0.25, 0.25], clamp(speed, 0.3, 1));
    this.env.audio.plop(this.panAt(x), 0.8);
    this.env.haptics.tap(0.3);
    if (!this.talk.busy(this.time)) this.say('pebble', Math.random() < 0.5 ? 'Brr! Cold!' : 'Eek! Splashy!');
  }

  // ---------- Chicks ----------

  private placeChicks(): void {
    const u = this.unit;
    const save = store.data.penguin;
    this.chicks = CHICKS.map((chick) => {
      const spot = save.lost[chick.id];
      const lost = spot !== undefined;
      const [sx, sy] = lost ? CHICK_SPOTS[spot % CHICK_SPOTS.length] : [HOME.x, HOME.y];
      return { chick, state: lost ? 'lost' : 'home', x: sx * u, y: sy * u, hop: 0, facing: 1, nextPeep: rand(1, 4), homeAt: 0 } as ChickBody;
    });
    if (Object.keys(save.lost).length === 0) this.wanderAt = this.time + 8;
  }

  private updateChicks(dt: number): void {
    const u = this.unit;
    const t = this.time;
    let index = 0;
    for (const c of this.chicks) {
      if (c.state === 'lost') {
        c.hop = Math.abs(Math.sin(t * 3 + c.x)) * 0.4;
        if (t > c.nextPeep) {
          c.nextPeep = t + rand(2.5, 5);
          if (this.onScreen(c.x, c.y, 0)) this.env.audio.babble(rand(84, 89), this.panAt(c.x));
        }
      } else if (c.state === 'follow') {
        // Follow along Pebble's trail, each a little further back.
        const target = this.trailPoint((index + 1) * CHICK_GAP * u);
        index++;
        const dx = target[0] - c.x;
        const dy = target[1] - c.y;
        const d = Math.hypot(dx, dy);
        const step = Math.min(d, (d * 6 + u * 0.05) * dt);
        if (d > 0.5) {
          c.x += (dx / d) * step;
          c.y += (dy / d) * step;
          if (Math.abs(dx) > 0.5) c.facing = Math.sign(dx);
        }
        c.hop = this.mode === 'glide' ? 0 : Math.abs(Math.sin(t * 12 + index)) * clamp(d / (u * 0.03), 0, 1);
      } else if (c.state === 'homeward') {
        // Hop to the igloo door, then pop inside.
        if (t < c.homeAt) continue;
        const dx = HOME.x * u - c.x;
        const dy = (HOME.y - 0.02) * u - c.y;
        const d = Math.hypot(dx, dy);
        c.hop = Math.abs(Math.sin(t * 12));
        if (d < u * 0.03) {
          c.state = 'home';
          this.pops.push({ x: c.x, y: c.y - u * 0.08, age: 0, kind: 'heart' });
          this.env.audio.babble(rand(86, 90), this.panAt(c.x));
          if (!this.chicks.some((o) => o.state === 'homeward')) this.allHome();
        } else {
          c.x += (dx / d) * Math.min(d, u * 0.35 * dt);
          c.y += (dy / d) * Math.min(d, u * 0.35 * dt);
        }
      }
    }
    // Followers reaching home go inside, one after another.
    const followers = this.chicks.filter((c) => c.state === 'follow');
    if (followers.length && Math.hypot(this.px - HOME.x * u, this.py - (HOME.y - 0.05) * u) < u * 0.24) {
      followers.forEach((c, i) => {
        c.state = 'homeward';
        c.homeAt = t + i * 0.35;
      });
      this.lastProgress = t;
    }
  }

  /** A point on Pebble's trail, `back` pixels behind him. */
  private trailPoint(back: number): [number, number] {
    let left = back;
    let [x, y] = [this.px, this.py];
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const [tx, ty] = this.trail[i];
      const d = Math.hypot(tx - x, ty - y);
      if (d >= left) {
        const k = left / d;
        return [x + (tx - x) * k, y + (ty - y) * k];
      }
      left -= d;
      x = tx;
      y = ty;
    }
    return [x, y];
  }

  /** The chicks that just went in are home: celebrate, and save. */
  private allHome(): void {
    const save = store.data.penguin;
    const arrived = this.chicks.filter((c) => c.state === 'home' && save.lost[c.chick.id] !== undefined);
    for (const c of arrived) delete save.lost[c.chick.id];
    store.save();
    this.book?.refresh();
    this.env.audio.celebrate();
    this.env.haptics.tap(0.8);
    const names = arrived.map((c) => c.chick.name);
    const remaining = Object.keys(save.lost).length;
    if (remaining === 0) {
      this.banner = { title: 'All the chicks are home!', line: 'Pebble is the best big brother.', start: this.time };
      this.wanderAt = this.time + 30;
    } else {
      const who = names.length === 1 ? `${names[0]} is home!` : `${names.length} chicks are home!`;
      this.banner = { title: who, line: `${remaining} still out playing.`, start: this.time };
    }
    for (let i = 0; i < 8; i++) this.pops.push({ x: HOME.x * this.unit + rand(-1, 1) * this.unit * 0.12, y: (HOME.y - 0.15) * this.unit, age: rand(-0.4, 0), kind: 'sparkle' });
  }

  /** Once they're all home, a few sneak out to play again. */
  private wanderOff(): void {
    this.wanderAt = -1;
    const save = store.data.penguin;
    const home = this.chicks.filter((c) => c.state === 'home');
    const spots = CHICK_SPOTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const u = this.unit;
    home
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .forEach((c, i) => {
        const spot = spots[i];
        save.lost[c.chick.id] = spot;
        c.state = 'lost';
        c.x = CHICK_SPOTS[spot][0] * u;
        c.y = CHICK_SPOTS[spot][1] * u;
      });
    store.save();
    this.book?.refresh();
    this.banner = { title: 'Uh oh!', line: 'Three chicks sneaked out to play again.', start: this.time };
    this.lastProgress = this.time;
  }

  // ---------- Fish, pebbles, the mitten ----------

  private updateFish(dt: number): void {
    const u = this.unit;
    FISHING_HOLES.forEach(([hx, hy], i) => {
      this.nextFish[i] -= dt;
      if (this.nextFish[i] > 0 || this.fish.some((f) => f.hole === i)) return;
      this.nextFish[i] = rand(6, 11);
      const a = rand(0, Math.PI * 2);
      const lx = hx + Math.cos(a) * 0.08;
      const ly = hy + Math.sin(a) * 0.06;
      if (waterDistance(SCENE, lx, ly) < 0.04) return;
      this.fish.push({ hole: i, x: lx * u, y: ly * u, fromX: hx * u, fromY: hy * u, born: this.time });
      if (this.onScreen(hx * u, hy * u, 0)) this.env.audio.plop(this.panAt(hx * u), 1.2);
    });
  }

  private updateFinds(): void {
    const u = this.unit;
    const t = this.time;
    const save = store.data.penguin;
    const reach = u * 0.075;
    // Fish (once they've landed).
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      if (t - f.born < 0.6 || Math.hypot(f.x - this.px, f.y - this.py) > reach) continue;
      this.fish.splice(i, 1);
      save.fish += 1;
      store.save();
      this.wardrobe?.refresh();
      this.pops.push({ x: f.x, y: f.y - u * 0.04, age: 0, kind: 'plus' });
      this.env.audio.chime(this.panAt(f.x) + 0.5, 0.75);
    }
    // Shiny pebbles.
    PEBBLES.forEach(([x, y], i) => {
      if (save.pebbles.includes(i) || Math.hypot(x * u - this.px, y * u - this.py) > reach) return;
      save.pebbles.push(i);
      store.save();
      this.book?.refresh();
      this.pops.push({ x: x * u, y: y * u - u * 0.04, age: 0, kind: 'sparkle' });
      this.env.audio.chime(this.panAt(x * u) + 0.5, 0.95);
      this.say('pebble', `Ooh, a shiny pebble! (${save.pebbles.length}/${PEBBLES.length})`);
    });
    // Lost chicks.
    for (const c of this.chicks) {
      if (c.state !== 'lost' || Math.hypot(c.x - this.px, c.y - this.py) > u * 0.1) continue;
      c.state = 'follow';
      if (!save.found.includes(c.chick.id)) save.found.push(c.chick.id);
      store.save();
      this.book?.refresh();
      this.lastProgress = t;
      this.pops.push({ x: c.x, y: c.y - u * 0.07, age: 0, kind: 'heart' });
      this.env.audio.chime(this.panAt(c.x) + 0.5, 0.9);
      this.env.haptics.tap(0.4);
      this.say(c.chick.id, ['Peep! You found me!', 'Peep peep! Take me home!', 'Yay! Big brother!'][Math.floor(Math.random() * 3)]);
    }
    // Auntie Flo's mitten.
    if ((save.quests.auntie ?? 0) < 2 && !this.carrying.includes('mitten') && Math.hypot(MITTEN[0] * u - this.px, MITTEN[1] * u - this.py) < reach) {
      this.carrying.push('mitten');
      this.env.audio.chime(this.panAt(this.px) + 0.5, 0.8);
      this.say('pebble', "A pink mitten! I bet it's Auntie Flo's.");
    }
  }

  // ---------- Islanders ----------

  private updateIslanders(): void {
    const u = this.unit;
    const t = this.time;
    const save = store.data.penguin;
    for (const id of Object.keys(VILLAGERS) as VillagerId[]) {
      const v = VILLAGERS[id];
      if (Math.hypot(v.x * u - this.px, v.y * u - this.py) > u * 0.2) continue;
      if (t - (this.talkedAt[id] ?? -10) < 7 || this.talk.busy(t)) continue;
      this.talkedAt[id] = t;
      this.say(id, this.islanderLine(id));
    }
    void save;
  }

  /** What an islander says when Pebble comes by, moving their request along. */
  private islanderLine(id: VillagerId): string {
    const save = store.data.penguin;
    const quests = save.quests;
    const give = (item: Wear): void => {
      if (!save.owned.includes(item)) save.owned.push(item);
      this.env.audio.celebrate();
      this.env.haptics.tap(0.6);
      for (let i = 0; i < 6; i++) this.pops.push({ x: this.px + rand(-1, 1) * this.unit * 0.06, y: this.py - this.unit * 0.12, age: rand(-0.3, 0), kind: 'sparkle' });
      this.wardrobe?.refresh(true);
    };
    if (id === 'grandpa') {
      const step = quests.grandpa ?? 0;
      if (step === 0 && save.fish >= 3) {
        save.fish -= 3;
        quests.grandpa = 1;
        give('scarf');
        store.save();
        return 'Mmm, three fish! Thank you. Here, have my spare scarf.';
      }
      if (step === 0) return 'Brr... could you bring me 3 fish? My tummy is rumbling!';
      return ['That scarf suits you, little one!', 'Mind the ice field. Slippery!', 'Bring those chicks home safe!'][Math.floor(Math.random() * 3)];
    }
    if (id === 'skipper') {
      const step = quests.skipper ?? 0;
      if (step === 0) {
        quests.skipper = 1;
        this.carrying.push('letter');
        store.save();
        return 'Ahoy, Pebble! Take this letter to Auntie Flo, by the west cliffs.';
      }
      if (step === 1) {
        if (!this.carrying.includes('letter')) this.carrying.push('letter');
        return "The letter's for Auntie Flo, out west. Off you slide!";
      }
      return ['Ahoy! Fine day for sliding!', 'I can see every chick from up here. Almost.', 'Fair winds, little captain!'][Math.floor(Math.random() * 3)];
    }
    // Auntie Flo.
    if (this.carrying.includes('letter')) {
      this.carrying = this.carrying.filter((c) => c !== 'letter');
      quests.skipper = 2;
      give('bobble');
      store.save();
      return 'A letter from Skipper! How lovely. Have this bobble hat, dear.';
    }
    if (this.carrying.includes('mitten')) {
      this.carrying = this.carrying.filter((c) => c !== 'mitten');
      quests.auntie = 2;
      give('earmuffs');
      store.save();
      return 'My mitten! You found it! Take these earmuffs, sweetie.';
    }
    if ((quests.auntie ?? 0) < 2) {
      quests.auntie = 1;
      store.save();
      return 'Oh dear, I dropped my mitten on the frozen pond. Could you find it?';
    }
    return ['Stay warm, Pebble!', "I'm knitting the chicks tiny socks.", 'Have you tried sliding on the big ice field?'][Math.floor(Math.random() * 3)];
  }

  private say(speaker: string, text: string): void {
    const voice = speaker === 'pebble' ? 64 : speaker in ISLANDERS ? ISLANDERS[speaker as VillagerId].voice : 84;
    this.talk.say(this.time, speaker, text, voice);
  }

  /** Where a speaker's head is (world pixels). */
  private speakerPos(speaker: string): [number, number] {
    const u = this.unit;
    if (speaker in VILLAGERS) {
      const v = VILLAGERS[speaker as VillagerId];
      return [v.x * u, (v.y - PEBBLE * 1.05) * u];
    }
    const chick = this.chicks.find((c) => c.chick.id === speaker);
    if (chick) return [chick.x, chick.y - CHICK * u];
    return [this.px, this.py - PEBBLE * u * (this.mode === 'glide' ? 0.4 : 1.05)];
  }

  // ---------- Camera ----------

  private updateCamera(dt: number, snap = false): void {
    const { width, height } = this.env.view;
    const { sim } = this.env;
    const u = this.unit;
    let lx = this.vx * 0.3;
    let ly = this.vy * 0.3;
    const m = Math.hypot(lx, ly);
    if (m > u * 0.3) {
      lx *= (u * 0.3) / m;
      ly *= (u * 0.3) / m;
    }
    const W = ISLAND_W * u;
    const H = ISLAND_H * u;
    const tx = W <= width ? (W - width) / 2 : clamp(this.px + lx - width / 2, 0, W - width);
    const ty = H <= height ? (H - height) / 2 : clamp(this.py + ly - height / 2, 0, H - height);
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (snap) {
      this.simX = this.camX;
      this.simY = this.camY;
      return;
    }
    const cols = sim.velocity.width;
    const rows = sim.velocity.height;
    const texelX = width / cols;
    const texelY = height / rows;
    const sx = Math.round((this.camX - this.simX) / texelX);
    const sy = Math.round((this.camY - this.simY) / texelY);
    if (sx !== 0 || sy !== 0) {
      sim.shift(sx / cols, -sy / rows);
      this.simX += sx * texelX;
      this.simY += sy * texelY;
    }
  }

  private onScreen(x: number, y: number, margin: number): boolean {
    const { width, height } = this.env.view;
    return x > this.camX - margin && x < this.camX + width + margin && y > this.camY - margin && y < this.camY + height + margin;
  }

  private panAt(x: number): number {
    return clamp((x - this.camX) / this.env.view.width, 0, 1) * 1.2 - 0.6;
  }

  private layout(): void {
    const { width, height } = this.env.view;
    this.unit = Math.min(width, height);
    const u = this.unit;
    this.sceneryScale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(6e6 / (ISLAND_W * ISLAND_H * u * u)), 4096 / (ISLAND_H * u));
    this.scenery = paintIsland(u, this.sceneryScale);
  }

  // ---------- Drawing ----------

  render(): void {
    const { gpu, sim, view } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display || !this.shore) return;
    const u = this.unit;
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uVelocity'), sim.velocity.read.attach(1));
    gl.uniform1i(display.u('uShore'), gpu.bindTexture(this.shore, 2));
    gl.uniform2f(display.u('uSimShift'), (this.camX - this.simX) / view.width, -(this.camY - this.simY) / view.height);
    gl.uniform2f(display.u('uCamera'), this.camX, this.camY);
    gl.uniform2f(display.u('uView'), view.width, view.height);
    gl.uniform2f(display.u('uWorld'), ISLAND_W * u, ISLAND_H * u);
    gl.uniform1f(display.u('uUnit'), u);
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform3f(display.u('uDeep'), 0.14, 0.33, 0.52);
    gl.uniform3f(display.u('uShallow'), 0.55, 0.78, 0.9);
    gl.uniform3f(display.u('uFoam'), 0.95, 0.98, 1);
    gl.uniform1f(display.u('uCaustic'), 0.1);
    gl.uniform1f(display.u('uNight'), 0);
    gl.uniform1f(display.u('uWave'), 0.4);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const u = this.unit;
    const t = this.time;
    const save = store.data.penguin;
    ctx.save();
    ctx.translate(-this.camX, -this.camY);

    if (this.scenery) {
      const s = this.sceneryScale;
      const W = ISLAND_W * u;
      const H = ISLAND_H * u;
      const sx = Math.max(0, this.camX);
      const sy = Math.max(0, this.camY);
      const sw = Math.min(W, this.camX + width) - sx;
      const sh = Math.min(H, this.camY + height) - sy;
      if (sw > 0 && sh > 0) ctx.drawImage(this.scenery, sx * s, sy * s, sw * s, sh * s, sx, sy, sw, sh);
    }
    this.drawMarks(ctx);

    // Things lying on the ground.
    for (const f of this.fish) {
      const k = clamp((t - f.born) / 0.6, 0, 1);
      const x = f.fromX + (f.x - f.fromX) * k;
      const y = f.fromY + (f.y - f.fromY) * k - Math.sin(k * Math.PI) * u * 0.12;
      drawFish(ctx, x, y, u * 0.045, k < 1 ? -1.2 + k * 2.4 : Math.sin(t * 9 + f.hole) * 0.25);
    }
    PEBBLES.forEach(([x, y], i) => {
      if (!save.pebbles.includes(i) && this.onScreen(x * u, y * u, u * 0.1)) drawPebble(ctx, x * u, y * u, u * 0.03, t);
    });
    if ((save.quests.auntie ?? 0) < 2 && !this.carrying.includes('mitten')) drawCarry(ctx, 'mitten', MITTEN[0] * u, MITTEN[1] * u, u * 0.05);

    // Everything standing up, drawn back to front.
    const things: { y: number; draw: () => void }[] = [];
    for (const o of OBSTACLES) {
      if (o.kind === 'rock' || !this.onScreen(o.x * u, o.y * u, u * 0.3)) continue;
      const x = o.x * u;
      const y = o.y * u + o.r * u * 0.6;
      if (o.kind === 'pine') things.push({ y, draw: () => drawProp(ctx, 'snow', x, y, (o.size ?? 0.13) * u, 0.5) });
      else if (o.kind === 'igloo') things.push({ y, draw: () => drawLandmark(ctx, 'igloo', x, y, u * (o.r > 0.12 ? 0.32 : 0.26)) });
      else if (o.kind === 'lighthouse') things.push({ y, draw: () => drawLandmark(ctx, 'lighthouse', x, y, u * 0.38) });
      else if (o.kind === 'snowman') things.push({ y, draw: () => drawLandmark(ctx, 'snowman', x, y, u * 0.17) });
    }
    for (const id of Object.keys(VILLAGERS) as VillagerId[]) {
      const v = VILLAGERS[id];
      const look = ISLANDERS[id];
      const x = v.x * u;
      const y = v.y * u;
      const facing = Math.sign(this.px - x) || 1;
      things.push({ y, draw: () => drawPenguin(ctx, x, y, PEBBLE * u * 1.05, { facing, phase: t * 2, walk: 0, wear: look.wear, body: look.body, happy: this.talk.speaker === id }) });
    }
    for (const c of this.chicks) {
      if (c.state === 'home' || !this.onScreen(c.x, c.y, u * 0.2)) continue;
      const gliding = c.state === 'follow' && this.mode === 'glide';
      things.push({
        y: c.y,
        draw: () =>
          drawChick(ctx, c.chick, c.x, c.y, CHICK * u, {
            hop: c.hop,
            facing: c.facing,
            glide: gliding ? this.glideAngle : undefined,
            sad: c.state === 'lost',
            happy: c.state !== 'lost',
          }),
      });
    }
    const wear = [save.hat, save.neck].filter((w): w is Wear => !!w);
    things.push({
      y: this.py,
      draw: () => {
        if (this.mode === 'glide') {
          drawGlide(ctx, this.px, this.py - PEBBLE * u * 0.15, PEBBLE * u * 0.8, this.glideAngle, t, wear);
          this.carrying.forEach((item, i) => drawCarry(ctx, item, this.px + (i - (this.carrying.length - 1) / 2) * u * 0.04, this.py - PEBBLE * u * 0.6, u * 0.035));
        } else {
          const flap = t - this.flapAt < 0.6 ? Math.sin((t - this.flapAt) * 25) * 0.6 : 0;
          drawPenguin(ctx, this.px, this.py, PEBBLE * u, {
            facing: this.facing,
            back: this.back,
            phase: this.phase,
            walk: this.walk,
            flap,
            happy: t - this.flapAt < 0.6 || this.talk.speaker === 'pebble',
            wear,
            carry: this.carrying,
          });
        }
      },
    });
    things.sort((a, b) => a.y - b.y);
    for (const thing of things) thing.draw();

    for (const p of this.pops) this.drawPop(ctx, p);
    const speaker = this.talk.speaker;
    if (speaker) {
      const [ax, ay] = this.speakerPos(speaker);
      this.talk.draw(ctx, t, ax, ay, u, this.camX, this.camX + width, this.camY + 76);
    }
    ctx.restore();

    this.drawFlakes(ctx);
    this.drawArrow(ctx, t);
    this.drawHint(ctx, t);
    this.drawBanner(ctx, t);
  }

  private drawMarks(ctx: CanvasRenderingContext2D): void {
    const u = this.unit;
    ctx.save();
    let groove: Mark | null = null;
    for (const m of this.marks) {
      const fade = 1 - m.age / (m.kind === 'spray' ? 0.6 : 7);
      if (m.kind === 'step') {
        ctx.fillStyle = `rgba(150, 180, 210, ${0.45 * fade})`;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, u * 0.008, u * 0.012, m.angle + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (m.kind === 'groove') {
        if (groove && Math.hypot(groove.x - m.x, groove.y - m.y) < u * 0.05) {
          ctx.strokeStyle = `rgba(160, 190, 220, ${0.4 * fade})`;
          ctx.lineWidth = u * 0.035;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(groove.x, groove.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }
        groove = m;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y - (1 - fade) * u * 0.03, u * (0.008 + (1 - fade) * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawPop(ctx: CanvasRenderingContext2D, p: Pop): void {
    if (p.age < 0) return;
    const u = this.unit;
    const k = p.age / 1.2;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (p.kind === 'heart') {
      const s = u * 0.018;
      ctx.fillStyle = '#ff7a9a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + s * 0.9);
      ctx.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.5, p.y - s * 1.2, p.x, p.y - s * 0.35);
      ctx.bezierCurveTo(p.x + s * 0.5, p.y - s * 1.2, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s * 0.9);
      ctx.fill();
    } else if (p.kind === 'plus') {
      ctx.font = `800 ${Math.round(u * 0.04)}px Nunito, Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2f5d8a';
      ctx.fillText('+1', p.x, p.y);
    } else {
      const s = u * 0.02 * (1 - k * 0.5);
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

  /** Points the way to the current goal when it's off the screen. */
  private drawArrow(ctx: CanvasRenderingContext2D, t: number): void {
    const goal = this.goal();
    if (!goal) return;
    const { width, height } = this.env.view;
    const u = this.unit;
    const tx = goal.x - this.camX;
    const ty = goal.y - this.camY;
    const left = 44;
    const right = width - 44;
    const top = 104;
    const bottom = height - 110;
    if (tx > left && tx < right && ty > top && ty < bottom) return;
    const cx = width / 2;
    const cy = height / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const kx = dx === 0 ? Infinity : ((dx > 0 ? right : left) - cx) / dx;
    const ky = dy === 0 ? Infinity : ((dy > 0 ? bottom : top) - cy) / dy;
    const k = Math.min(kx, ky);
    const x = cx + dx * k;
    const y = cy + dy * k;
    const a = Math.atan2(dy, dx);
    const r = 26 * (1 + 0.06 * Math.sin(t * 4));
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(20, 40, 60, 0.3)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55);
    ctx.lineTo(x + Math.cos(a + 0.55) * r * 0.9, y + Math.sin(a + 0.55) * r * 0.9);
    ctx.lineTo(x + Math.cos(a - 0.55) * r * 0.9, y + Math.sin(a - 0.55) * r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (goal.kind === 'home') drawLandmark(ctx, 'igloo', x, y + r * 0.45, r * 1.2);
    else if (goal.kind === 'chick' && goal.chick) drawChick(ctx, goal.chick, x, y + r * 0.5, r * 1.1, { happy: true });
    else drawPenguin(ctx, x, y + r * 0.6, r * 1.15, { facing: 1, phase: 0, walk: 0, wear: goal.wear });
    void u;
  }

  /** Where Pebble should head: home with chicks in tow, to an islander with a delivery, or (after a while) a lost chick. */
  private goal(): { x: number; y: number; kind: 'home' | 'chick' | 'islander'; chick?: Chick; wear?: Wear[] } | null {
    const u = this.unit;
    if (this.carrying.length) {
      const v = VILLAGERS.auntie;
      return { x: v.x * u, y: v.y * u, kind: 'islander', wear: ISLANDERS.auntie.wear };
    }
    if (this.chicks.some((c) => c.state === 'follow')) return { x: HOME.x * u, y: (HOME.y - 0.08) * u, kind: 'home' };
    if (this.time - Math.max(this.lastProgress, 0) < 15) return null;
    let best: ChickBody | null = null;
    let bestD = Infinity;
    for (const c of this.chicks) {
      if (c.state !== 'lost') continue;
      const d = Math.hypot(c.x - this.px, c.y - this.py);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { x: best.x, y: best.y, kind: 'chick', chick: best.chick } : null;
  }

  /** After a quiet spell, a ghost finger shows the two moves: drag to waddle, flick to slide. */
  private drawHint(ctx: CanvasRenderingContext2D, t: number): void {
    const first = store.data.penguin.found.length === 0;
    const idle = t - this.lastTouch - (first ? 2.5 : 8);
    if (idle < 0) return;
    const u = this.unit;
    const x0 = this.px - this.camX;
    const y0 = this.py - this.camY + u * 0.2;
    const cycle = idle % 3.2;
    const drag = cycle < 1.8;
    const k = drag ? cycle / 1.8 : (cycle - 1.8) / 1.4;
    const fx = drag ? x0 - u * 0.05 + k * u * 0.14 : x0 + u * 0.09 - Math.min(1, k * 3) * u * 0.18;
    const fy = drag ? y0 : y0 - Math.min(1, k * 3) * u * 0.14;
    ctx.save();
    ctx.globalAlpha = Math.min(1, idle * 2) * Math.sin(Math.PI * Math.min(1, k * 1.1));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(40, 70, 100, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, u * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `800 ${Math.round(u * 0.038)}px Nunito, Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2f3a4f';
    ctx.fillText(drag ? 'drag to waddle' : 'flick to slide!', fx, fy + u * 0.08);
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
    const { width, height } = this.env.view;
    const u = this.unit;
    const k = Math.min(1, age / 0.35, (BANNER_SECONDS - age) / 0.5);
    const titleSize = Math.round(u * 0.054);
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
    // Out of Pebble's way: at the top, or the bottom when he's up there.
    const high = this.py - this.camY < height * 0.45;
    const y = high ? height - 120 - h / 2 : 96 + h / 2;
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

  private scatterFlakes(): void {
    const { width, height } = this.env.view;
    this.flakes = Array.from({ length: 40 }, () => ({ x: rand(0, width), y: rand(0, height), vy: rand(16, 36), phase: rand(0, 6), size: rand(1.2, 3) }));
  }

  private updateFlakes(dt: number): void {
    const { width, height } = this.env.view;
    for (const f of this.flakes) {
      f.phase += dt;
      f.y += f.vy * dt;
      f.x += Math.sin(f.phase * 1.2) * 10 * dt;
      if (f.y > height + 5) {
        f.y = -5;
        f.x = rand(0, width);
      }
    }
  }

  private drawFlakes(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const f of this.flakes) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
