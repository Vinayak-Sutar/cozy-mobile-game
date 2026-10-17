import { isTier, type Tier } from '../engine/quality';

export type ToyId = 'glow' | 'paint' | 'brush' | 'pond';
export const TOY_IDS: ToyId[] = ['glow', 'paint', 'brush', 'pond'];

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

export interface SaveData {
  settings: Settings;
  brush: BrushSettings;
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
