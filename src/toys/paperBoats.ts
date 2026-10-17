import { store } from '../app/storage';
import type { RGB, SimConfig } from '../engine/fluid';
import type { Program } from '../engine/gl';
import { WindField } from '../engine/wind';
import type { SoundTheme } from '../feel/audio';
import type { Pointer } from '../input/pointers';
import { BoatLog } from '../ui/boatLog';
import { BoatPlaces } from '../ui/boatPlaces';
import { clamp, rand } from '../util/color';
import { lineFor, MOOD, type Moment, PERSONALITIES } from './boats/dialogue';
import { drawLandmark, type PlaceId } from './boats/landmarks';
import { dockSpots, isUnlocked, MAPS, mapById, type MapDef, type MapId, PIER, riverFlow, waterDistance } from './boats/maps';
import { drawCritter, PASSENGERS, type Passenger } from './boats/passengers';
import { landColor, paintScenery, paintShoreMask } from './boats/scenery';
import { type Body, drawWhirlpools, Floes, Gusts, keepInWater, RiverStreaks, whirlCurrent } from './boats/twists';
import displaySource from './shaders/paperBoats.frag?raw';
import { Toy } from './Toy';

/** Foam and ripples live in the dye's red channel. */
const FOAM: RGB = [0.16, 0.16, 0.16];
const WIND_EVERY = 2;
const PAPER = ['#ffffff', '#ffe9a8', '#cde9ff', '#ffd3e0', '#d8f2c9', '#e9dcff', '#ffe0c2', '#d0f0ec'];
/** How quickly a boat takes on the speed of the water under it (per second). */
const FOLLOW = 3;
/** Water speed to boat speed: a good swipe moves the boat about a third of the screen. */
const CARRY = 0.75;
/** Boat size, in map units (1 unit = the screen's short side). */
const BOAT_W = 0.2;
const LANDMARK_SIZE = 0.17;
/** How hard a full gust pushes a sail, in map units per second. */
const GUST = 0.34;
const BOARD_SECONDS = 1.3;
const DOCK_SECONDS = 0.7;
const LAND_SECONDS = 2.6;
const LEAVE_SECONDS = 0.9;
/** Seconds without a touch before a finger shows how to push the boat. */
const HINT_AFTER = 5;
const HINT_CYCLE = 1.8;
const BANNER_SECONDS = 3.6;
/** Letters per second as a speech bubble fills in. */
const REVEAL = 30;
/** Which lines win when two want to be said at once. */
const PRIORITY: Record<Moment, number> = { board: 5, arrive: 5, wrong: 4, tap: 3, twist: 3, bump: 2, fast: 2, idle: 1 };
const VOWELS: Record<string, number> = { a: 0, e: 2, i: 4, o: -2, u: -3, y: 1 };

type Phase = 'boarding' | 'sailing' | 'docking' | 'landing' | 'leaving';

/** A pier, in world pixels. */
interface Dock {
  x: number;
  y: number;
  nx: number;
  ny: number;
  place: PlaceId | null;
  berthX: number;
  berthY: number;
  landX: number;
  landY: number;
  standX: number;
  standY: number;
}

interface Heart {
  x: number;
  y: number;
  vx: number;
  age: number;
  size: number;
}

interface Floater extends Body {
  angle: number;
  spin: number;
  color: string;
}

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
}

interface Banner {
  title: string;
  line: string;
  start: number;
}

/** A passenger saying something, in a bubble that fills in letter by letter. */
interface Speech {
  text: string;
  moment: Moment;
  start: number;
  duration: number;
  /** Said standing on the shore (after arriving), not from the boat. */
  onShore: boolean;
  /** A little picture of the place they're talking about. */
  icon: PlaceId | null;
  /** Letters already "spoken" (for the babble). */
  spoken: number;
  lines: string[] | null;
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * Paper Boats: a little animal rides a paper boat, and a bubble shows where
 * it wants to go. Swipe the water to make a current and the boat floats along
 * with it; tap for a ripple. Bring it to the right pier and the passenger hops
 * off happy and goes in your boat log.
 *
 * Each map is bigger than the screen and the camera follows the boat. The
 * fluid only covers the screen: as the camera moves, the fluid is shifted by
 * whole texels so the water stays put under the world. Every map has a twist:
 * a flowing river, gusts of wind, drifting ice or whirlpools.
 */
export class PaperBoats extends Toy {
  readonly id = 'boats' as const;
  override readonly light = true;
  override readonly usesOverlay = true;
  // No ghost finger: it would push the boat for you. A drawn hint shows the move instead.
  override readonly quietIdle = true;

  readonly simConfig: SimConfig = {
    curl: 3,
    velocityDissipation: 0.9,
    densityDissipation: 0.9,
    pressure: 0.8,
    splatRadius: 0.22,
    splatForce: 2600,
  };

  get sound(): SoundTheme {
    return this.map.sound;
  }

  private map: MapDef = MAPS[0];
  private unit = 1;
  private display: Program | null = null;
  private wind: WindField | null = null;
  private readonly windAt: [number, number] = [0, 0];
  private readonly flowAt: [number, number] = [0, 0];
  private readonly extra: [number, number] = [0, 0];
  private readonly water: [number, number] = [0, 0];
  private frame = 0;
  private log: BoatLog | null = null;
  private places: BoatPlaces | null = null;
  private scenery: HTMLCanvasElement | null = null;
  private sceneryScale = 1;
  private shore: WebGLTexture | null = null;
  private docks: Dock[] = [];

  /** World pixels at the screen's top-left, and at the fluid's top-left (it moves in whole texels). */
  private camX = 0;
  private camY = 0;
  private simX = 0;
  private simY = 0;

  private gusts: Gusts | null = null;
  private floes: Floes | null = null;
  private streaks: RiverStreaks | null = null;
  private floaters: Floater[] = [];
  private specks: Speck[] = [];
  private banner: Banner | null = null;
  private fadeAt = -10;

  private phase: Phase = 'boarding';
  private phaseStart = 0;
  private passenger: Passenger = PASSENGERS[0];
  private destination: PlaceId = 'house';
  private lastDestination: PlaceId | null = null;
  private paper = PAPER[0];
  private bx = 0;
  private by = 0;
  private vx = 0;
  private vy = 0;
  /** -1..1: which way the boat faces; passes through 0 as it turns. */
  private facing = 1;
  private facingTarget = 1;
  private lastTouch = 0;
  private sailingSince = 0;
  private shakeAt = -10;
  private waveAt = -10;
  private lastBump = 0;
  private unlocked: MapDef | null = null;
  private hearts: Heart[] = [];
  private speech: Speech | null = null;
  private lastSpoke = -10;
  private lastIdleLine = -10;
  private lastFastLine = -10;
  private lastTwistLine = -10;
  private boardSaid = false;
  private arriveSaid = false;
  private gustWasBlowing = false;

  strokeColor(): RGB {
    return FOAM;
  }

  mountUi(container: HTMLElement): void {
    this.log = new BoatLog(container, this.env.audio);
    this.places = new BoatPlaces(container, this.env.audio, (id) => this.switchMap(id));
    this.places.refresh(this.map.id);
  }

  unmountUi(): void {
    this.log?.destroy();
    this.log = null;
    this.places?.destroy();
    this.places = null;
  }

  protected override onEnter(): void {
    this.display = this.env.gpu.program(displaySource);
    this.wind = new WindField(this.env.gpu);
    const saved = mapById(store.data.boats.map);
    this.loadMap(isUnlocked(saved.id, store.data.boats.trips) ? saved : MAPS[0], true);
  }

  override exit(): void {
    this.wind?.dispose();
    this.wind = null;
    if (this.shore) this.env.gpu.gl.deleteTexture(this.shore);
    this.shore = null;
    this.scenery = null;
    this.env.audio.setWind(0);
  }

  override onResize(): void {
    const old = this.unit;
    this.layout();
    const k = this.unit / old;
    if (k !== 1 && Number.isFinite(k)) {
      this.bx *= k;
      this.by *= k;
      this.vx *= k;
      this.vy *= k;
      for (const f of this.floaters) {
        f.x *= k;
        f.y *= k;
        f.r *= k;
      }
      this.floes?.rescale(k);
      this.streaks?.rescale(k);
      this.camX *= k;
      this.camY *= k;
    }
    if (this.phase === 'boarding') {
      this.bx = this.docks[0].berthX;
      this.by = this.docks[0].berthY;
    }
    this.updateCamera(0, true);
  }

  override intro(): void {}

  override ambient(): void {}

  /** Screen pixels to fluid space, through the camera. */
  protected override uv(x: number, y: number): [number, number] {
    return this.simUv(x + this.camX, y + this.camY);
  }

  override pointerDown(pointer: Pointer): void {
    this.lastTouch = this.time;
    const wx = pointer.x + this.camX;
    const wy = pointer.y + this.camY;
    const W = BOAT_W * this.unit;
    // Tapping the boat: the passenger waves hello.
    if (this.phase === 'sailing' && Math.hypot(wx - this.bx, wy - (this.by - W * 0.25)) < W * 0.55) {
      this.waveAt = this.time;
      this.env.haptics.tap(0.2);
      this.say('tap');
      return;
    }
    // Anywhere else: a ripple that pushes the water outward.
    const [u, v] = this.uv(pointer.x, pointer.y);
    this.drop(u, v, FOAM, 0.7);
  }

  override pointerMove(pointer: Pointer, x0: number, y0: number, dt: number): void {
    this.lastTouch = this.time;
    this.stroke(pointer, x0, y0, pointer.x, pointer.y, dt, { pigment: 0.6, radius: 1.2, push: 1 });
  }

  override update(dt: number): void {
    super.update(dt);
    const { sim, view, audio } = this.env;
    if (this.wind && ++this.frame % WIND_EVERY === 0) this.wind.update(sim.velocity.read);
    const inPhase = this.time - this.phaseStart;

    if (this.gusts) {
      this.gusts.update(dt, view.width, view.height);
      if (this.frame % 6 === 0) audio.setWind(this.gusts.strength);
    }

    if (this.phase === 'boarding') {
      if (inPhase >= 1.0 && !this.boardSaid) {
        this.boardSaid = true;
        this.say('board');
      }
      if (inPhase >= BOARD_SECONDS) {
        this.setPhase('sailing');
        this.sailingSince = this.time;
        audio.chime(0.5, 0.3);
      }
    } else if (this.phase === 'sailing') {
      this.sail(dt);
      this.chatter();
    } else if (this.phase === 'docking') {
      const dock = this.targetDock();
      const k = 1 - Math.exp(-dt * 7);
      this.bx += (dock.berthX - this.bx) * k;
      this.by += (dock.berthY - this.by) * k;
      this.vx = 0;
      this.vy = 0;
      this.turnTowards(dt);
      if (inPhase >= DOCK_SECONDS) {
        this.setPhase('landing');
        this.arrive();
      }
    } else if (this.phase === 'landing') {
      // A little stream of hearts once they're standing on the shore.
      if (inPhase > 1.0 && inPhase < 2.0 && Math.floor(inPhase / 0.16) !== Math.floor((inPhase - dt) / 0.16)) this.addHeart();
      if (inPhase >= 1.0 && !this.arriveSaid) {
        this.arriveSaid = true;
        this.say('arrive', true);
      }
      if (this.unlocked && inPhase > 1.4) {
        this.banner = { title: 'A new place to sail!', line: `${this.unlocked.name} is open. Tap the map to go there.`, start: this.time };
        this.places?.refresh(this.map.id, true);
        audio.chime(0.5, 0.9);
        this.unlocked = null;
      }
      if (inPhase >= LAND_SECONDS + 0.8) this.setPhase('leaving');
    } else if (this.phase === 'leaving') {
      this.by += BOAT_W * this.unit * 0.1 * dt;
      if (inPhase >= LEAVE_SECONDS) this.startTrip();
    }

    this.floes?.update(dt, (x, y, out) => this.currentAt(x, y, out, 0.3));
    this.streaks?.update(dt, this.camX, this.camY, view.width, view.height);
    this.updateFloaters(dt);
    this.updateSpecks(dt);
    this.updateHearts(dt);
    this.updateSpeech();
    this.updateCamera(dt);
  }

  render(): void {
    const { gpu, sim, view } = this.env;
    const gl = gpu.gl;
    const display = this.display;
    if (!display || !this.shore) return;
    const { look, size } = this.map;
    const u = this.unit;
    gl.disable(gl.BLEND);
    display.bind();
    gl.uniform1i(display.u('uTexture'), sim.dye.read.attach(0));
    gl.uniform1i(display.u('uVelocity'), sim.velocity.read.attach(1));
    gl.uniform1i(display.u('uShore'), gpu.bindTexture(this.shore, 2));
    gl.uniform2f(display.u('uSimShift'), (this.camX - this.simX) / view.width, -(this.camY - this.simY) / view.height);
    gl.uniform2f(display.u('uCamera'), this.camX, this.camY);
    gl.uniform2f(display.u('uView'), view.width, view.height);
    gl.uniform2f(display.u('uWorld'), size[0] * u, size[1] * u);
    gl.uniform1f(display.u('uUnit'), u);
    gl.uniform1f(display.u('uTime'), this.time);
    gl.uniform3f(display.u('uDeep'), ...look.deep);
    gl.uniform3f(display.u('uShallow'), ...look.shallow);
    gl.uniform3f(display.u('uFoam'), ...look.foam);
    gl.uniform1f(display.u('uCaustic'), look.caustic);
    gl.uniform1f(display.u('uNight'), look.night ? 1 : 0);
    gl.uniform1f(display.u('uWave'), look.wave);
    gpu.blit(null);
  }

  override drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.env.view;
    const u = this.unit;
    const t = this.time;
    const inPhase = t - this.phaseStart;
    const W = this.map.size[0] * u;
    const H = this.map.size[1] * u;
    const night = this.map.look.night;

    // Beyond the edge of a map that's narrower than the screen: more land.
    ctx.fillStyle = landColor(this.map.ground);
    if (this.camX < 0) {
      ctx.fillRect(0, 0, -this.camX, height);
      ctx.fillRect(W - this.camX, 0, width - (W - this.camX), height);
    }
    if (this.camY < 0) {
      ctx.fillRect(0, 0, width, -this.camY);
      ctx.fillRect(0, H - this.camY, width, height - (H - this.camY));
    }

    ctx.save();
    ctx.translate(-this.camX, -this.camY);

    // In the water: floating things, river streaks and whirlpools (under the piers).
    for (const f of this.floaters) this.drawFloater(ctx, f, t);
    this.streaks?.draw(ctx);
    if (this.map.whirlpools) drawWhirlpools(ctx, this.map.whirlpools, u, t);

    // The land, cut from the big painted map.
    if (this.scenery) {
      const s = this.sceneryScale;
      const sx = Math.max(0, this.camX);
      const sy = Math.max(0, this.camY);
      const sw = Math.min(W, this.camX + width) - sx;
      const sh = Math.min(H, this.camY + height) - sy;
      if (sw > 0 && sh > 0) ctx.drawImage(this.scenery, sx * s, sy * s, sw * s, sh * s, sx, sy, sw, sh);
    }

    const target = this.targetDock();
    for (const dock of this.docks) {
      if (!dock.place || !this.onScreen(dock.landX, dock.landY, u * 0.3)) continue;
      const isTarget = dock === target && (this.phase === 'sailing' || this.phase === 'boarding');
      const s = u * LANDMARK_SIZE * (isTarget ? 1 + 0.05 * Math.sin(t * 4) : 1);
      if (night) ctx.filter = 'brightness(0.7) saturate(0.85)';
      drawLandmark(ctx, dock.place, dock.landX, dock.landY, s);
      ctx.filter = 'none';
      if (night) this.glow(ctx, dock.landX, dock.landY - s * 0.55, s * 0.9, 'rgba(255, 214, 140, 0.35)');
    }
    this.floes?.draw(ctx);
    if (this.phase === 'sailing' || this.phase === 'boarding') this.drawBeacon(ctx, target, t);

    // The boat fades in while its passenger gets on, and away once it's empty.
    let alpha = 1;
    if (this.phase === 'boarding') alpha = clamp(inPhase / 0.4, 0, 1);
    else if (this.phase === 'leaving') alpha = 1 - clamp(inPhase / LEAVE_SECONDS, 0, 1);
    if (night) this.glow(ctx, this.bx, this.by - u * 0.05, u * 0.32 * alpha, 'rgba(255, 210, 130, 0.35)');
    const riding = this.phase === 'sailing' || this.phase === 'docking' || (this.phase === 'boarding' && inPhase > 0.9);
    this.drawBoat(ctx, t, alpha, riding);
    if (this.phase === 'boarding' && inPhase <= 0.9) this.drawBoarding(ctx, inPhase);
    if (this.phase === 'landing' || this.phase === 'leaving') this.drawLanding(ctx, t);
    for (const heart of this.hearts) this.drawHeart(ctx, heart);
    this.drawSpeech(ctx, t);

    if (this.phase === 'sailing') {
      const sinceTouch = t - Math.max(this.lastTouch, this.sailingSince);
      const firstTrip = Object.keys(store.data.boats.carried).length === 0;
      const wait = firstTrip ? 1.5 : HINT_AFTER;
      if (sinceTouch > wait) this.drawHint(ctx, sinceTouch - wait);
    }
    ctx.restore();

    // On the screen: wind, snow, fireflies, the arrow to an off-screen pier, and banners.
    this.gusts?.drawScreen(ctx, t);
    this.drawSpecks(ctx, t);
    if (this.phase === 'sailing' || this.phase === 'boarding') this.drawArrow(ctx, target, t);
    this.drawBanner(ctx, t);
    const fade = 1 - clamp((t - this.fadeAt) / 0.6, 0, 1);
    if (fade > 0) {
      ctx.fillStyle = night ? `rgba(4, 8, 24, ${fade})` : `rgba(255, 255, 255, ${fade})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // ---------- Maps ----------

  private switchMap(id: MapId): void {
    if (id === this.map.id || !isUnlocked(id, store.data.boats.trips)) return;
    this.loadMap(mapById(id), false);
  }

  private loadMap(map: MapDef, first: boolean): void {
    const { audio, sim } = this.env;
    this.map = map;
    store.data.boats.map = map.id;
    store.save();
    this.layout();
    this.shore = this.env.gpu.uploadCanvas(paintShoreMask(map), this.shore);
    sim.clear();
    const u = this.unit;
    this.gusts = map.twist === 'wind' ? new Gusts() : null;
    const avoid = this.docks.map((d) => [d.berthX / u, d.berthY / u] as [number, number]);
    this.floes = map.twist === 'ice' ? new Floes(map, u, map.floes ?? 6, avoid) : null;
    this.streaks = map.twist === 'river' ? new RiverStreaks(map, u) : null;
    this.scatterFloaters();
    this.scatterSpecks();
    this.lastDestination = null;
    this.startTrip();
    this.updateCamera(0, true);
    this.banner = { title: map.name, line: map.tagline, start: this.time };
    this.places?.refresh(map.id);
    if (!first) {
      audio.setTheme(map.sound);
      audio.setWind(0);
      this.fadeAt = this.time;
    }
  }

  private layout(): void {
    const { width, height } = this.env.view;
    const map = this.map;
    const u = Math.min(width, height);
    this.unit = u;
    this.docks = map.docks.map((d) => {
      const s = dockSpots(d);
      return {
        x: d.x * u,
        y: d.y * u,
        nx: d.nx,
        ny: d.ny,
        place: d.place,
        berthX: s.berth[0] * u,
        berthY: s.berth[1] * u,
        landX: s.landmark[0] * u,
        landY: s.landmark[1] * u,
        standX: s.stand[0] * u,
        standY: s.stand[1] * u,
      };
    });
    // The painted map can be big: keep it under ~6 megapixels and 4096 px a side.
    const [w, h] = map.size;
    this.sceneryScale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(6e6 / (w * h * u * u)), 4096 / (Math.max(w, h) * u));
    this.scenery = paintScenery(map, u, this.sceneryScale);
  }

  // ---------- Trips ----------

  private startTrip(): void {
    const boats = store.data.boats;
    this.passenger = PASSENGERS[boats.next % PASSENGERS.length];
    this.paper = PAPER[boats.next % PAPER.length];
    const places = this.docks.filter((d) => d.place && d.place !== this.lastDestination).map((d) => d.place as PlaceId);
    this.destination = places[Math.floor(Math.random() * places.length)];
    this.lastDestination = this.destination;
    const start = this.docks[0];
    this.bx = start.berthX;
    this.by = start.berthY;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.facingTarget = 1;
    this.speech = null;
    this.boardSaid = false;
    this.arriveSaid = false;
    this.lastIdleLine = this.time;
    this.setPhase('boarding');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseStart = this.time;
  }

  private targetDock(): Dock {
    return this.docks.find((d) => d.place === this.destination) ?? this.docks[1];
  }

  private arrive(): void {
    const { audio, haptics } = this.env;
    const boats = store.data.boats;
    const index = MAPS.indexOf(this.map);
    const next = MAPS[index + 1];
    const nextWasOpen = next ? isUnlocked(next.id, boats.trips) : true;
    boats.carried[this.passenger.id] = (boats.carried[this.passenger.id] ?? 0) + 1;
    boats.trips[this.map.id] = (boats.trips[this.map.id] ?? 0) + 1;
    boats.next = (PASSENGERS.indexOf(this.passenger) + 1) % PASSENGERS.length;
    store.save();
    if (next && !nextWasOpen && isUnlocked(next.id, boats.trips)) this.unlocked = next;
    this.log?.refresh();
    this.places?.refresh(this.map.id);
    audio.celebrate();
    haptics.tap(0.8);
  }

  /** Water current plus the map's twist at a world point, in px/s. `sail` is how much wind catches it. */
  private currentAt(x: number, y: number, out: [number, number], sail: number): void {
    this.waterAt(x, y, out);
    this.extraCurrent(x, y, this.extra, sail);
    out[0] += this.extra[0];
    out[1] += this.extra[1];
  }

  /** The stirred water under a world point, in px/s (zero off-screen, where there's no fluid). */
  private waterAt(x: number, y: number, out: [number, number]): void {
    const [u, v] = this.simUv(x, y);
    if (!this.wind || u < 0 || u > 1 || v < 0 || v > 1) {
      out[0] = 0;
      out[1] = 0;
      return;
    }
    this.wind.sample(u, v, this.windAt);
    const texelToPx = this.env.view.width / this.env.sim.velocity.width;
    out[0] = this.windAt[0] * texelToPx * CARRY;
    out[1] = -this.windAt[1] * texelToPx * CARRY;
  }

  /** The map's own current at a world point (river, whirlpools, gusts), in px/s. */
  private extraCurrent(x: number, y: number, out: [number, number], sail: number): void {
    const u = this.unit;
    out[0] = 0;
    out[1] = 0;
    if (this.map.twist === 'river') {
      riverFlow(this.map, x / u, y / u, this.flowAt);
      out[0] += this.flowAt[0];
      out[1] += this.flowAt[1];
    }
    if (this.map.whirlpools) whirlCurrent(this.map.whirlpools, x / u, y / u, out);
    if (this.gusts) {
      out[0] += this.gusts.dirX * this.gusts.strength * GUST * sail;
      out[1] += this.gusts.dirY * this.gusts.strength * GUST * sail;
    }
    out[0] *= u;
    out[1] *= u;
  }

  /** The boat drifts with the water under it, bumping softly off the shore and the ice. */
  private sail(dt: number): void {
    const u = this.unit;
    const W = BOAT_W * u;

    // Average the current over the hull, so small eddies nudge it rather than jerk it.
    let wx = 0;
    let wy = 0;
    const reach = W * 0.3;
    const offsets: [number, number][] = [
      [0, 0],
      [reach, 0],
      [-reach, 0],
      [0, reach * 0.6],
      [0, -reach * 0.6],
    ];
    for (const [ox, oy] of offsets) {
      this.waterAt(this.bx + ox, this.by + oy, this.water);
      wx += this.water[0];
      wy += this.water[1];
    }
    this.extraCurrent(this.bx, this.by, this.extra, 1);
    wx = wx / offsets.length + this.extra[0];
    wy = wy / offsets.length + this.extra[1];
    const k = 1 - Math.exp(-dt * FOLLOW);
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;
    const speed = Math.hypot(this.vx, this.vy);
    const top = u * 1.4;
    if (speed > top) {
      this.vx *= top / speed;
      this.vy *= top / speed;
    }
    this.bx += this.vx * dt;
    this.by += this.vy * dt;

    const boat: Body = { x: this.bx, y: this.by, vx: this.vx, vy: this.vy, r: W * 0.4 };
    const shore = keepInWater(this.map, u, boat, 0.35);
    const ice = this.floes?.collideBoat(boat) ?? 0;
    this.bx = boat.x;
    this.by = boat.y;
    this.vx = boat.vx;
    this.vy = boat.vy;
    if (Math.max(shore, ice) > u * 0.12) this.bump(shore > 0, ice > shore);
    this.turnTowards(dt);

    // A little wake of foam behind a moving boat.
    if (speed > u * 0.12 && Math.random() < dt * 30) {
      const [su, sv] = this.simUv(this.bx - (this.vx / speed) * W * 0.45, this.by + W * 0.05);
      this.env.sim.splatDye(su, sv, [0.05, 0.05, 0.05], 0.25);
    }

    const target = this.targetDock();
    if (Math.hypot(this.bx - target.berthX, this.by - target.berthY) < u * 0.11) {
      this.setPhase('docking');
      this.env.audio.chime((target.x - this.camX) / this.env.view.width, 0.7);
      this.env.haptics.tap(0.4);
    }
  }

  /** A soft bump. At the wrong pier, the passenger shakes their head: not here! */
  private bump(shore: boolean, ice: boolean): void {
    if (this.time - this.lastBump < 0.4) return;
    this.lastBump = this.time;
    this.env.haptics.tap(0.25);
    this.env.audio.ui('tap');
    if (ice) {
      if (this.time - this.lastTwistLine > 10) {
        this.lastTwistLine = this.time;
        this.say('twist');
      } else if (Math.random() < 0.5) this.say('bump');
      return;
    }
    if (!shore) return;
    const u = this.unit;
    const wrong = this.docks.some(
      (d) => d.place && d.place !== this.destination && Math.hypot(this.bx - d.berthX, this.by - d.berthY) < u * 0.3,
    );
    if (wrong) {
      this.shakeAt = this.time;
      this.say('wrong');
    } else if (Math.random() < 0.7) {
      this.say('bump');
    }
  }

  // ---------- Talking ----------

  /** Lines that come up during a ride: waiting, going fast, and each map's twist. */
  private chatter(): void {
    const t = this.time;
    const u = this.unit;
    const sinceTouch = t - Math.max(this.lastTouch, this.sailingSince);
    if (sinceTouch > 8 && t - this.lastIdleLine > 14) {
      this.lastIdleLine = t;
      this.say('idle');
    }
    if (Math.hypot(this.vx, this.vy) > u * 0.6 && t - this.lastFastLine > 9) {
      this.lastFastLine = t;
      this.say('fast');
    }
    if (t - this.lastTwistLine < 12) return;
    let twist = false;
    if (this.map.twist === 'river') {
      riverFlow(this.map, this.bx / u, this.by / u, this.flowAt);
      twist = t - this.sailingSince > 3 && Math.hypot(this.flowAt[0], this.flowAt[1]) > 0.1;
    } else if (this.gusts) {
      const blowing = this.gusts.blowing;
      twist = blowing && !this.gustWasBlowing;
      this.gustWasBlowing = blowing;
    } else if (this.map.whirlpools) {
      twist = this.map.whirlpools.some((p) => Math.hypot(this.bx / u - p.x, this.by / u - p.y) < p.r * 1.1);
    }
    if (twist && Math.random() < 0.8) {
      this.lastTwistLine = t;
      this.say('twist');
    }
  }

  /** The passenger says something about this moment, if nothing more important is being said. */
  private say(moment: Moment, onShore = false): void {
    const t = this.time;
    const current = this.speech;
    const priority = PRIORITY[moment];
    if (current && t - current.start < current.duration && PRIORITY[current.moment] > priority) return;
    // Small remarks need a little quiet first, so nobody chatters.
    if (priority <= 2 && t - this.lastSpoke < 3.5) return;
    let text = lineFor(this.passenger.id, moment, this.destination, this.map.twist);
    // The first time someone rides, they say who they are.
    if (moment === 'board' && !store.data.boats.carried[this.passenger.id]) {
      text = `Hi, I'm ${PERSONALITIES[this.passenger.id]?.name ?? 'new here'}! ${text}`;
    }
    this.speech = {
      text,
      moment,
      start: t,
      duration: text.length / REVEAL + 1.8,
      onShore,
      icon: moment === 'board' || moment === 'wrong' ? this.destination : null,
      spoken: 0,
      lines: null,
    };
    this.lastSpoke = t;
  }

  /** Babbles a little blip for every other letter as the bubble fills in, higher when happy. */
  private updateSpeech(): void {
    const speech = this.speech;
    if (!speech) return;
    const age = this.time - speech.start;
    if (age > speech.duration) {
      this.speech = null;
      return;
    }
    const voice = PERSONALITIES[this.passenger.id]?.voice ?? 62;
    const mood = MOOD[speech.moment];
    const lift = mood === 'happy' ? 3 : mood === 'cross' ? -3 : 0;
    const x = speech.onShore ? this.targetDock().standX : this.bx;
    const pan = clamp((x - this.camX) / this.env.view.width, 0, 1) * 1.2 - 0.6;
    const shown = Math.min(speech.text.length, Math.floor(age * REVEAL));
    while (speech.spoken < shown) {
      const ch = speech.text[speech.spoken].toLowerCase();
      speech.spoken++;
      if (speech.spoken % 2 !== 0 || ch < 'a' || ch > 'z') continue;
      const offset = VOWELS[ch] ?? (ch.charCodeAt(0) % 5) - 2;
      this.env.audio.babble(voice + lift + offset, pan);
    }
  }

  private turnTowards(dt: number): void {
    if (this.phase === 'docking') {
      const dock = this.targetDock();
      // Piers to the side: face the land. Others: keep the way it was going.
      if (Math.abs(dock.nx) > 0.3) this.facingTarget = -Math.sign(dock.nx);
    } else if (Math.abs(this.vx) > this.unit * 0.05) {
      this.facingTarget = Math.sign(this.vx);
    }
    this.facing += (this.facingTarget - this.facing) * (1 - Math.exp(-dt * 5));
  }

  // ---------- Camera ----------

  private updateCamera(dt: number, snap = false): void {
    const { width, height } = this.env.view;
    const { sim } = this.env;
    const u = this.unit;
    let fx: number;
    let fy: number;
    if (this.phase === 'sailing') {
      // Look a little ahead of where the boat is going.
      let lx = this.vx * 0.35;
      let ly = this.vy * 0.35;
      const m = Math.hypot(lx, ly);
      if (m > u * 0.3) {
        lx *= (u * 0.3) / m;
        ly *= (u * 0.3) / m;
      }
      fx = this.bx + lx;
      fy = this.by + ly;
    } else if (this.phase === 'boarding') {
      fx = this.docks[0].berthX;
      fy = this.docks[0].berthY;
    } else {
      const dock = this.targetDock();
      fx = (dock.berthX + dock.landX) / 2;
      fy = (dock.berthY + dock.landY) / 2;
    }
    const W = this.map.size[0] * u;
    const H = this.map.size[1] * u;
    const tx = W <= width ? (W - width) / 2 : clamp(fx - width / 2, 0, W - width);
    const ty = H <= height ? (H - height) / 2 : clamp(fy - height / 2, 0, H - height);
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (snap) {
      this.simX = this.camX;
      this.simY = this.camY;
      return;
    }
    // Slide the fluid along in whole texels, so the water stays put under the world.
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

  /** World pixels to fluid space. */
  private simUv(x: number, y: number): [number, number] {
    const { width, height } = this.env.view;
    return [(x - this.simX) / width, 1 - (y - this.simY) / height];
  }

  private onScreen(x: number, y: number, margin: number): boolean {
    const { width, height } = this.env.view;
    return x > this.camX - margin && x < this.camX + width + margin && y > this.camY - margin && y < this.camY + height + margin;
  }

  // ---------- Floating things ----------

  private scatterFloaters(): void {
    const map = this.map;
    const u = this.unit;
    const [w, h] = map.size;
    this.floaters = [];
    if (map.floater === 'none') return;
    const colors =
      map.floater === 'leaves'
        ? ['#8fcf6a', '#b7dd7a', '#f2c46b', '#e99a7a']
        : map.floater === 'petals'
          ? ['#8ff7e1', '#ffb3e6', '#fff2a6']
          : ['#ffffff'];
    const count = Math.round(w * h * 4);
    for (let tries = 0; tries < 300 && this.floaters.length < count; tries++) {
      const x = rand(0, w);
      const y = rand(0, h);
      if (waterDistance(map, x, y) > -0.06) continue;
      this.floaters.push({
        x: x * u,
        y: y * u,
        vx: 0,
        vy: 0,
        r: u * rand(0.016, 0.026),
        angle: rand(0, Math.PI * 2),
        spin: rand(-0.4, 0.4),
        color: colors[this.floaters.length % colors.length],
      });
    }
  }

  /** Leaves (and bubbles, and petals) follow the current, so you can see where the water goes. */
  private updateFloaters(dt: number): void {
    const map = this.map;
    const u = this.unit;
    const k = 1 - Math.exp(-dt * 4);
    for (const f of this.floaters) {
      this.currentAt(f.x, f.y, this.water, 0.5);
      f.vx += (this.water[0] - f.vx) * k;
      f.vy += (this.water[1] - f.vy) * k;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.angle += (f.spin + f.vx * 0.004) * dt;
      keepInWater(map, u, f, 0.3);
      // Down the river and round again.
      if (map.twist === 'river' && f.y > (map.size[1] - 0.25) * u) {
        for (let tries = 0; tries < 30; tries++) {
          const x = rand(0, map.size[0]);
          const y = rand(0, 1);
          if (waterDistance(map, x, y) < -0.06) {
            f.x = x * u;
            f.y = y * u;
            break;
          }
        }
      }
    }
  }

  /** Snowflakes over the frozen lake, fireflies over the lagoon (screen space). */
  private scatterSpecks(): void {
    const { width, height } = this.env.view;
    const kind = this.map.ground;
    const count = kind === 'snow' ? 46 : kind === 'night' ? 16 : 0;
    this.specks = Array.from({ length: count }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      vx: rand(-10, 10),
      vy: kind === 'snow' ? rand(18, 40) : rand(-8, 8),
      phase: rand(0, Math.PI * 2),
      size: kind === 'snow' ? rand(1.3, 3.2) : rand(2, 3.4),
    }));
  }

  private updateSpecks(dt: number): void {
    const { width, height } = this.env.view;
    const snow = this.map.ground === 'snow';
    for (const s of this.specks) {
      s.phase += dt;
      if (snow) {
        s.x += (s.vx + Math.sin(s.phase * 1.3) * 12) * dt;
        s.y += s.vy * dt;
      } else {
        s.vx += Math.sin(s.phase * 0.9 + s.size) * 14 * dt;
        s.vy += Math.cos(s.phase * 0.7 + s.size * 2) * 14 * dt;
        s.vx *= 0.98;
        s.vy *= 0.98;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      if (s.y > height + 10) s.y = -10;
      if (s.y < -10) s.y = height + 10;
      if (s.x > width + 10) s.x = -10;
      if (s.x < -10) s.x = width + 10;
    }
  }

  private updateHearts(dt: number): void {
    for (const h of this.hearts) {
      h.age += dt;
      h.y -= 40 * dt;
      h.x += h.vx * dt;
    }
    this.hearts = this.hearts.filter((h) => h.age < 1.6);
  }

  private addHeart(): void {
    const dock = this.targetDock();
    const pr = this.passengerSize();
    this.hearts.push({ x: dock.standX + rand(-pr, pr), y: dock.standY - pr * 2.6, vx: rand(-12, 12), age: 0, size: pr * rand(0.35, 0.55) });
  }

  // ---------- Drawing ----------

  private passengerSize(): number {
    return this.unit * 0.04;
  }

  /** Where the passenger's head is while riding. */
  private seat(): [number, number] {
    const W = BOAT_W * this.unit;
    return [this.bx + this.facing * W * 0.18, this.by - W * 0.75 * 0.3];
  }

  private drawBoat(ctx: CanvasRenderingContext2D, t: number, alpha: number, riding: boolean): void {
    if (alpha <= 0) return;
    const u = this.unit;
    const W = BOAT_W * u;
    const h = W * 0.75;
    const x = this.bx;
    const y = this.by + Math.sin(t * 2.3) * h * 0.03;
    const rock = Math.sin(t * 1.9) * 0.05 + clamp(this.vx / (u * 1.5), -0.12, 0.12);
    const flip = Math.abs(this.facing) < 0.12 ? 0.12 * Math.sign(this.facing || 1) : this.facing;
    const gust = this.gusts ? this.gusts.dirX * this.gusts.strength : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    // Its shadow on the water.
    ctx.fillStyle = 'rgba(20, 70, 80, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.24, W * 0.5, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    const local = (draw: () => void, lean = 0): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rock + lean);
      ctx.scale(flip, 1);
      draw();
      ctx.restore();
    };
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(80, 70, 60, 0.4)';

    // The folded sail, toward the back; it leans in a gust.
    local(() => {
      ctx.fillStyle = shade(this.paper, 0.93);
      ctx.beginPath();
      ctx.moveTo(-W * 0.4, -h * 0.1);
      ctx.lineTo(-W * 0.1, -h * 0.95);
      ctx.lineTo(W * 0.2, -h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-W * 0.1, -h * 0.95);
      ctx.lineTo(-W * 0.08, -h * 0.1);
      ctx.stroke();
    }, gust * 0.25);

    if (riding) {
      const [sx, sy] = this.seat();
      const pr = this.passengerSize();
      const shake = t - this.shakeAt < 0.7 ? Math.sin((t - this.shakeAt) * 28) * pr * 0.18 : 0;
      const waving = t - this.waveAt < 0.8;
      const hop = waving ? Math.abs(Math.sin((t - this.waveAt) * 8)) * pr * 0.4 : 0;
      const target = this.targetDock();
      const look = Math.atan2(target.berthY - sy, target.berthX - sx);
      drawCritter(ctx, this.passenger, sx + shake, sy - hop + Math.sin(t * 2.3) * h * 0.03, pr, {
        happy: waving,
        blink: Math.sin(t * 0.9 + 1) > 0.985,
        look,
      });
    }

    // The hull, with the water lapping at its bottom.
    local(() => {
      const hull = (): void => {
        ctx.beginPath();
        ctx.moveTo(-W * 0.5, -h * 0.1);
        ctx.lineTo(W * 0.5, -h * 0.1);
        ctx.lineTo(W * 0.3, h * 0.22);
        ctx.lineTo(-W * 0.3, h * 0.22);
        ctx.closePath();
      };
      ctx.fillStyle = this.paper;
      hull();
      ctx.fill();
      ctx.save();
      hull();
      ctx.clip();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.beginPath();
      ctx.moveTo(-W * 0.5, -h * 0.1);
      ctx.lineTo(0, h * 0.22);
      ctx.lineTo(-W * 0.3, h * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(70, 150, 160, 0.35)';
      ctx.fillRect(-W * 0.5, h * 0.12, W, h * 0.12);
      ctx.restore();
      hull();
      ctx.stroke();
    });

    // A little ripple ring around the hull.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.22, W * (0.42 + 0.03 * Math.sin(t * 3)), h * 0.06, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    const talking = this.speech && !this.speech.onShore;
    if (riding && this.phase !== 'docking' && !talking) this.drawWish(ctx, t, alpha);
  }

  /** A speech bubble with a little picture of where the passenger wants to go. */
  private drawWish(ctx: CanvasRenderingContext2D, t: number, alpha: number): void {
    const { width } = this.env.view;
    const u = this.unit;
    const [sx, sy] = this.seat();
    const pr = this.passengerSize();
    const nagging = t - this.shakeAt < 0.9;
    const grow = this.phase === 'boarding' ? clamp((t - this.phaseStart - 0.9) / 0.3, 0, 1) : 1;
    const s = u * 0.06 * (nagging ? 1.15 : 1) * grow;
    if (s <= 0) return;
    const side = sx - this.camX > width * 0.6 ? -1 : 1;
    const x = clamp(sx + side * pr * 2.2, this.camX + s + 8, this.camX + width - s - 8);
    const y = Math.max(this.camY + 76 + s, sy - pr * 2.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(60, 50, 70, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - side * s * 0.3, y + s * 0.8);
    ctx.lineTo(sx + side * pr * 0.6, sy - pr * 1.1);
    ctx.lineTo(x - side * s * 0.75, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawLandmark(ctx, this.destination, x, y + s * 0.6, s * 1.25);
    ctx.restore();
  }

  /** A soft, pulsing ring at the pier the passenger wants. */
  private drawBeacon(ctx: CanvasRenderingContext2D, dock: Dock, t: number): void {
    const u = this.unit;
    const pulse = (t * 0.8) % 1;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    for (const k of [pulse, (pulse + 0.5) % 1]) {
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.beginPath();
      ctx.arc(dock.berthX, dock.berthY, u * (0.04 + k * 0.06), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** When the pier is off the screen, a bubble at the edge points the way. */
  private drawArrow(ctx: CanvasRenderingContext2D, dock: Dock, t: number): void {
    const { width, height } = this.env.view;
    const tx = dock.berthX - this.camX;
    const ty = dock.berthY - this.camY;
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
    if (dock.place) drawLandmark(ctx, dock.place, x, y + r * 0.55, r * 1.25);
  }

  /** The passenger walks out to the start pier and hops in. */
  private drawBoarding(ctx: CanvasRenderingContext2D, inPhase: number): void {
    const start = this.docks[0];
    const u = this.unit;
    const pr = this.passengerSize();
    const fromX = start.x;
    const fromY = start.y + u * 0.02 - pr * 1.77;
    const [toX, toY] = this.seat();
    const k = clamp((inPhase - 0.3) / 0.6, 0, 1);
    const e = easeInOut(k);
    const x = fromX + (toX - fromX) * e;
    const y = fromY + (toY - fromY) * e - Math.sin(k * Math.PI) * u * 0.06;
    ctx.save();
    ctx.globalAlpha = clamp(inPhase / 0.25, 0, 1);
    drawCritter(ctx, this.passenger, x, y, pr, { happy: k > 0 && k < 1 }, true);
    ctx.restore();
  }

  /** The passenger hops onto the pier, then onto the shore, and is happy. */
  private drawLanding(ctx: CanvasRenderingContext2D, t: number): void {
    const dock = this.targetDock();
    const u = this.unit;
    const pr = this.passengerSize();
    const [seatX, seatY] = this.seat();
    const pierX = dock.x + dock.nx * PIER * u * 0.5;
    const pierY = dock.y + dock.ny * PIER * u * 0.5 - pr * 1.6;
    const standX = dock.standX;
    const standY = dock.standY - pr * 1.77;
    const inPhase = this.phase === 'landing' ? t - this.phaseStart : LAND_SECONDS + (t - this.phaseStart);
    const hop = (k: number, x0: number, y0: number, x1: number, y1: number): [number, number] => {
      const e = easeInOut(k);
      return [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e - Math.sin(k * Math.PI) * u * 0.05];
    };
    let x: number;
    let y: number;
    if (inPhase < 0.5) [x, y] = hop(inPhase / 0.5, seatX, seatY, pierX, pierY);
    else if (inPhase < 1.0) [x, y] = hop((inPhase - 0.5) / 0.5, pierX, pierY, standX, standY);
    else {
      x = standX;
      y = standY - Math.abs(Math.sin((inPhase - 1) * 7)) * pr * 0.35;
    }
    const fade = this.phase === 'leaving' ? 1 - clamp((t - this.phaseStart) / LEAVE_SECONDS, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    drawCritter(ctx, this.passenger, x, y, pr, { happy: inPhase > 0.9 }, true);
    ctx.restore();
  }

  /** A speech bubble that pops up over the passenger and fills in as they "talk". */
  private drawSpeech(ctx: CanvasRenderingContext2D, t: number): void {
    const speech = this.speech;
    if (!speech) return;
    const { width } = this.env.view;
    const u = this.unit;
    const pr = this.passengerSize();
    const age = t - speech.start;
    let ax: number;
    let ay: number;
    if (speech.onShore) {
      const dock = this.targetDock();
      ax = dock.standX;
      ay = dock.standY - pr * 3.1;
    } else {
      const [sx, sy] = this.seat();
      ax = sx;
      ay = sy - pr * 1.2;
    }
    const size = Math.round(clamp(u * 0.04, 13, 20));
    ctx.save();
    ctx.font = `700 ${size}px Nunito, Fredoka, system-ui, sans-serif`;
    const icon = speech.icon ? size * 1.9 : 0;
    speech.lines ??= wrapText(ctx, speech.text, Math.min(width * 0.68, u * 0.68) - icon);
    const lineHeight = size * 1.25;
    const textW = Math.max(...speech.lines.map((l) => ctx.measureText(l).width));
    const pad = size * 0.7;
    const w = textW + pad * 2 + icon;
    const h = Math.max(speech.lines.length * lineHeight, icon * 0.9) + pad * 1.3;
    const x = clamp(ax - w / 2, this.camX + 8, this.camX + width - w - 8);
    const y = Math.max(this.camY + 70, ay - h - pr * 0.8);
    const pop = easeOutBack(Math.min(1, age / 0.22));
    ctx.globalAlpha = clamp((speech.duration - age) / 0.3, 0, 1);
    ctx.translate(ax, y + h);
    ctx.scale(pop, pop);
    ctx.translate(-ax, -(y + h));
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(20, 40, 60, 0.22)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(18, h / 2));
    ctx.fill();
    ctx.shadowBlur = 0;
    const tail = clamp(ax, x + 18, x + w - 18);
    ctx.beginPath();
    ctx.moveTo(tail - 8, y + h - 1);
    ctx.lineTo(ax, Math.max(ay, y + h + 4));
    ctx.lineTo(tail + 8, y + h - 1);
    ctx.closePath();
    ctx.fill();
    if (speech.icon) drawLandmark(ctx, speech.icon, x + pad + icon * 0.4, y + h / 2 + icon * 0.4, icon * 0.85);
    // The words fill in letter by letter, in time with the babble.
    ctx.fillStyle = '#2f3a4f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let left = Math.floor(age * REVEAL);
    speech.lines.forEach((line, i) => {
      if (left > 0) ctx.fillText(line.slice(0, left), x + pad + icon, y + pad * 0.65 + lineHeight * (i + 0.5));
      left -= line.length + 1;
    });
    ctx.restore();
  }

  /** A finger swiping from behind the boat toward the pier it wants: push the water this way. */
  private drawHint(ctx: CanvasRenderingContext2D, shown: number): void {
    const u = this.unit;
    const target = this.targetDock();
    let dx = target.berthX - this.bx;
    let dy = target.berthY - this.by;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const k = (shown % HINT_CYCLE) / HINT_CYCLE;
    const move = easeInOut(clamp(k / 0.7, 0, 1));
    const x0 = this.bx - dx * u * 0.24;
    const y0 = this.by - dy * u * 0.24;
    const x1 = this.bx + dx * u * 0.1;
    const y1 = this.by + dy * u * 0.1;
    const x = x0 + (x1 - x0) * move;
    const y = y0 + (y1 - y0) * move;
    const alpha = Math.min(1, shown * 2) * Math.sin(Math.PI * clamp(k / 0.85, 0, 1));
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = u * 0.02;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = 'rgba(40, 70, 80, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, u * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** The map's name and what's special about it, or news of a new place. */
  private drawBanner(ctx: CanvasRenderingContext2D, t: number): void {
    const banner = this.banner;
    if (!banner) return;
    const age = t - banner.start;
    if (age > BANNER_SECONDS) {
      this.banner = null;
      return;
    }
    const { width, height } = this.env.view;
    const k = Math.min(1, age / 0.35, (BANNER_SECONDS - age) / 0.5);
    const u = this.unit;
    const titleSize = Math.round(u * 0.058);
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
    // Out of the way of the boat and passenger: at the top, or at the bottom when they're up there.
    const busyTop = (this.phase === 'sailing' || this.phase === 'boarding' ? this.by : this.targetDock().landY) - this.camY < height * 0.45;
    const y = busyTop ? height - 120 - h / 2 + (1 - k) * 14 : 96 + h / 2 + (1 - k) * -14;
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

  private drawFloater(ctx: CanvasRenderingContext2D, f: Floater, t: number): void {
    const kind = this.map.floater;
    if (!this.onScreen(f.x, f.y, f.r * 2)) return;
    ctx.save();
    if (kind === 'bubbles') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x + f.r * 0.9, f.y + f.r * 0.3, f.r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'petals') {
      const tw = 0.6 + 0.4 * Math.sin(t * 2 + f.angle * 3);
      this.glow(ctx, f.x, f.y, f.r * 3, hexAlpha(f.color, 0.35 * tw));
      ctx.fillStyle = f.color;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, f.r * 0.7, f.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.fillStyle = 'rgba(20, 70, 80, 0.15)';
      ctx.beginPath();
      ctx.ellipse(2, 3, f.r, f.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.r, f.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60, 90, 40, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-f.r * 0.8, 0);
      ctx.lineTo(f.r * 0.8, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpecks(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.specks.length === 0) return;
    const snow = this.map.ground === 'snow';
    ctx.save();
    for (const s of this.specks) {
      if (snow) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const blink = Math.max(0, Math.sin(t * 1.7 + s.phase * 3 + s.size * 5));
        this.glow(ctx, s.x, s.y, s.size * 7, `rgba(220, 255, 150, ${0.45 * blink})`);
        ctx.fillStyle = `rgba(250, 255, 210, ${blink})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawHeart(ctx: CanvasRenderingContext2D, h: Heart): void {
    const s = h.size;
    ctx.save();
    ctx.globalAlpha = 1 - h.age / 1.6;
    ctx.fillStyle = '#ff7a9a';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + s * 0.9);
    ctx.bezierCurveTo(h.x - s * 1.6, h.y - s * 0.2, h.x - s * 0.5, h.y - s * 1.2, h.x, h.y - s * 0.35);
    ctx.bezierCurveTo(h.x + s * 0.5, h.y - s * 1.2, h.x + s * 1.6, h.y - s * 0.2, h.x, h.y + s * 0.9);
    ctx.fill();
    ctx.restore();
  }

  /** A soft additive glow (lamps, fireflies, the boat's lantern at night). */
  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    if (r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

const easeOutBack = (x: number): number => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/** Breaks text into lines no wider than `max` (in the context's current font). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Darkens a "#rrggbb" colour a little (k < 1). */
function shade(color: string, k: number): string {
  const v = parseInt(color.slice(1), 16);
  const ch = (shift: number): number => Math.round(((v >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** "#rrggbb" with an alpha. */
function hexAlpha(color: string, alpha: number): string {
  const v = parseInt(color.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}
