import { isTier, type Tier } from '../engine/quality';

export type ToyId = 'glow' | 'paint' | 'brush' | 'pond' | 'water' | 'painter' | 'window' | 'lanterns' | 'boats' | 'koi';
export const TOY_IDS: ToyId[] = ['glow', 'paint', 'brush', 'pond', 'water', 'painter', 'window', 'lanterns', 'boats', 'koi'];

export type ThemeId = 'moonlit' | 'clay' | 'meadow' | 'dusk';
export const THEME_IDS: ThemeId[] = ['moonlit', 'clay', 'meadow', 'dusk'];

/** Auto = pick for the device and step down if slow; saver = low tier, no live menu backdrop; best = high tier. */
export type GraphicsMode = 'auto' | 'saver' | 'best';

export type BrushId = 'soft' | 'ink' | 'wash' | 'splatter' | 'water' | 'lift';
export type Wetness = 'dry' | 'damp' | 'wet';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  haptics: boolean;
  theme: ThemeId;
  graphics: GraphicsMode;
}

export interface BrushSettings {
  brush: BrushId;
  /** Index into the S/M/L sizes. */
  size: number;
  color: string;
  wetness: Wetness;
}

/** One planting spot in the garden bed. */
export interface GardenSlot {
  plant: string | null;
  pot: string | null;
  /** 0 = just planted, 1 = sprout, 2 = bud, 3 = in bloom. Rain moves it up. */
  growth: number;
}

export const GARDEN_SLOTS = 6;

/** Water the Garden: the bed as you left it, and every flower you've grown. */
export interface GardenProgress {
  slots: GardenSlot[];
  flowers: Record<string, number>;
}

const emptySlots = (): GardenSlot[] =>
  Array.from({ length: GARDEN_SLOTS }, () => ({ plant: null, pot: null, growth: 0 }));

/** Little Painter: how many wishes you've granted, and which colours you've made. */
export interface PainterProgress {
  granted: number;
  made: Record<string, number>;
}

/** Hidden Picture: which pictures you've found, and which window comes next. */
export interface PictureProgress {
  next: number;
  found: Record<string, number>;
}

/** Lantern Lights: which night comes next, and the constellations you've made. */
export interface LanternProgress {
  next: number;
  found: Record<string, number>;
}

/** Paper Boats: who rides next, how many trips each passenger has made, and progress per map. */
export interface BoatProgress {
  next: number;
  carried: Record<string, number>;
  /** The map you were last sailing on. */
  map: string;
  /** Passengers carried on each map (opens the next map). */
  trips: Record<string, number>;
}

/** One koi living in your pond. Stage 0 = baby, 1 = young, 2 = grown up. */
export interface KoiFish {
  id: number;
  variety: string;
  name: string;
  stage: number;
  /** Food eaten toward the next stage (babies and young koi). */
  eaten: number;
}

/** Feed the Koi: the koi in your pond, and every variety you've raised. */
export interface KoiProgress {
  fish: KoiFish[];
  raised: Record<string, number>;
  /** Which variety the next baby will be. */
  next: number;
  /** For giving every koi its own id (and spots). */
  born: number;
}

export interface SaveData {
  settings: Settings;
  brush: BrushSettings;
  garden: GardenProgress;
  painter: PainterProgress;
  pictures: PictureProgress;
  lanterns: LanternProgress;
  boats: BoatProgress;
  koi: KoiProgress;
  lastToy: ToyId | null;
  /** Last quality tier the device settled on in auto mode, so we start there next time. */
  tier: Tier | null;
  stats: { opens: number; firstOpen: number; plays: Partial<Record<ToyId, number>> };
}

const KEY = 'drift.save.v1';

function defaults(): SaveData {
  return {
    settings: {
      musicVolume: 0.7,
      sfxVolume: 0.85,
      musicMuted: false,
      sfxMuted: false,
      haptics: true,
      theme: 'moonlit',
      graphics: 'auto',
    },
    brush: { brush: 'soft', size: 1, color: 'rose', wetness: 'damp' },
    garden: { slots: emptySlots(), flowers: {} },
    painter: { granted: 0, made: {} },
    pictures: { next: 0, found: {} },
    lanterns: { next: 0, found: {} },
    boats: { next: 0, carried: {}, map: 'pond', trips: {} },
    koi: {
      fish: [
        { id: 1, variety: 'chagoi', name: 'Old Bronze', stage: 2, eaten: 0 },
        { id: 2, variety: 'kohaku', name: 'Mochi', stage: 0, eaten: 0 },
      ],
      raised: {},
      next: 1,
      born: 2,
    },
    lastToy: null,
    tier: null,
    stats: { opens: 0, firstOpen: Date.now(), plays: {} },
  };
}

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

function load(): SaveData {
  const data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return data;
    const saved = JSON.parse(raw) as Partial<SaveData> & { settings?: Partial<Settings> & { sound?: boolean } };
    const s = saved.settings;
    if (s) {
      // v0.1 had a single "sound" switch; carry it over to both buses.
      const legacyMuted = s.sound === false;
      data.settings.musicVolume = unit(s.musicVolume, data.settings.musicVolume);
      data.settings.sfxVolume = unit(s.sfxVolume, data.settings.sfxVolume);
      data.settings.musicMuted = typeof s.musicMuted === 'boolean' ? s.musicMuted : legacyMuted;
      data.settings.sfxMuted = typeof s.sfxMuted === 'boolean' ? s.sfxMuted : legacyMuted;
      data.settings.haptics = s.haptics !== false;
      data.settings.theme = oneOf(s.theme, THEME_IDS, data.settings.theme);
      data.settings.graphics = oneOf(s.graphics, ['auto', 'saver', 'best'] as const, data.settings.graphics);
    }
    const b = saved.brush;
    if (b) {
      data.brush.brush = oneOf(b.brush, ['soft', 'ink', 'wash', 'splatter', 'water', 'lift'] as const, data.brush.brush);
      data.brush.size = typeof b.size === 'number' ? Math.min(2, Math.max(0, Math.round(b.size))) : data.brush.size;
      data.brush.color = typeof b.color === 'string' ? b.color : data.brush.color;
      data.brush.wetness = oneOf(b.wetness, ['dry', 'damp', 'wet'] as const, data.brush.wetness);
    }
    const g = saved.garden;
    if (g) {
      if (Array.isArray(g.slots)) {
        g.slots.slice(0, GARDEN_SLOTS).forEach((slot, i) => {
          if (!slot || typeof slot !== 'object') return;
          data.garden.slots[i] = {
            plant: typeof slot.plant === 'string' ? slot.plant : null,
            pot: typeof slot.pot === 'string' ? slot.pot : null,
            growth: typeof slot.growth === 'number' ? Math.min(3, Math.max(0, slot.growth)) : 0,
          };
        });
      }
      if (g.flowers && typeof g.flowers === 'object') {
        for (const [id, count] of Object.entries(g.flowers)) {
          if (typeof count === 'number' && count > 0) data.garden.flowers[id] = Math.floor(count);
        }
      }
    }
    const pp = saved.painter;
    if (pp) {
      data.painter.granted = typeof pp.granted === 'number' && pp.granted > 0 ? Math.floor(pp.granted) : 0;
      if (pp.made && typeof pp.made === 'object') {
        for (const [id, count] of Object.entries(pp.made)) {
          if (typeof count === 'number' && count > 0) data.painter.made[id] = Math.floor(count);
        }
      }
    }
    const pics = saved.pictures;
    if (pics) {
      data.pictures.next = typeof pics.next === 'number' && pics.next >= 0 ? Math.floor(pics.next) : 0;
      if (pics.found && typeof pics.found === 'object') {
        for (const [id, count] of Object.entries(pics.found)) {
          if (typeof count === 'number' && count > 0) data.pictures.found[id] = Math.floor(count);
        }
      }
    }
    const lan = saved.lanterns;
    if (lan) {
      data.lanterns.next = typeof lan.next === 'number' && lan.next >= 0 ? Math.floor(lan.next) : 0;
      if (lan.found && typeof lan.found === 'object') {
        for (const [id, count] of Object.entries(lan.found)) {
          if (typeof count === 'number' && count > 0) data.lanterns.found[id] = Math.floor(count);
        }
      }
    }
    const boats = saved.boats;
    if (boats) {
      data.boats.next = typeof boats.next === 'number' && boats.next >= 0 ? Math.floor(boats.next) : 0;
      if (boats.carried && typeof boats.carried === 'object') {
        for (const [id, count] of Object.entries(boats.carried)) {
          if (typeof count === 'number' && count > 0) data.boats.carried[id] = Math.floor(count);
        }
      }
      if (typeof boats.map === 'string') data.boats.map = boats.map;
      if (boats.trips && typeof boats.trips === 'object') {
        for (const [id, count] of Object.entries(boats.trips)) {
          if (typeof count === 'number' && count > 0) data.boats.trips[id] = Math.floor(count);
        }
      }
    }
    const koi = saved.koi;
    if (koi) {
      if (Array.isArray(koi.fish)) {
        const fish = koi.fish.filter(
          (f): f is KoiFish => !!f && typeof f.id === 'number' && typeof f.variety === 'string' && typeof f.stage === 'number',
        );
        if (fish.length) {
          data.koi.fish = fish.map((f) => ({
            id: f.id,
            variety: f.variety,
            name: typeof f.name === 'string' ? f.name : 'Koi',
            stage: Math.min(2, Math.max(0, Math.floor(f.stage))),
            eaten: typeof f.eaten === 'number' ? Math.max(0, Math.floor(f.eaten)) : 0,
          }));
        }
      }
      if (koi.raised && typeof koi.raised === 'object') {
        for (const [id, count] of Object.entries(koi.raised)) {
          if (typeof count === 'number' && count > 0) data.koi.raised[id] = Math.floor(count);
        }
      }
      if (typeof koi.next === 'number' && koi.next >= 0) data.koi.next = Math.floor(koi.next);
      if (typeof koi.born === 'number' && koi.born >= 0) data.koi.born = Math.floor(koi.born);
    }
    if (saved.lastToy && TOY_IDS.includes(saved.lastToy)) data.lastToy = saved.lastToy;
    if (isTier(saved.tier)) data.tier = saved.tier;
    if (saved.stats) data.stats = { ...data.stats, ...saved.stats };
  } catch {
    // Private mode or corrupted data: start fresh.
  }
  return data;
}

/** Tiny persistent store. Everything still works if localStorage is unavailable. */
export const store = {
  data: load(),
  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked; settings just won't persist.
    }
  },
};
