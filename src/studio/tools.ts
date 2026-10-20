import type { ToolMode } from './brush/engine';
import { type Brush, completeBrush, setCustomBrushes } from './brush/presets';
import type { SymmetryMode } from './brush/symmetry';

/** One tool's own brush, size and opacity (paint, smudge and erase each remember theirs). */
export interface ToolSettings {
  brush: string;
  /** Size in pixels on a canvas 2000 px across; scaled to each painting. */
  size: number;
  opacity: number;
}

export interface SymmetrySettings {
  mode: SymmetryMode;
  /** Copies around the centre, for radial and kaleidoscope. */
  count: number;
  /** The centre, as a fraction of the painting's width and height. */
  cx: number;
  cy: number;
}

/** Glow studio settings. */
export interface GlowSettings {
  /** Each stroke a new colour, instead of the picked one. */
  rainbow: boolean;
  /** 0..1 slider positions. */
  size: number;
  brightness: number;
  /** How much the light curls (0..1). */
  swirl: number;
  /** How long it keeps drifting after you lift (0..1). */
  flow: number;
  /** Light slowly fades, like Drift's Glow; off keeps your picture. */
  fade: boolean;
  background: string;
  symmetry: { mode: SymmetryMode; count: number };
  tab: string;
}

export interface StudioPrefs {
  mode: ToolMode;
  tools: Record<ToolMode, ToolSettings>;
  color: string;
  previous: string;
  recent: string[];
  myPalette: string[];
  library: string;
  colorTab: string;
  brushSet: string;
  /** Each brush remembers its own size and opacity, per tool ("paint:pencil-hb"). */
  brushSizes: Record<string, { size: number; opacity: number }>;
  penOnly: boolean;
  seenHelp: boolean;
  symmetry: SymmetrySettings;
  /** Hold at the end of a stroke to snap it to a line, circle or shape. */
  quickShape: boolean;
  /** Tidies wobbly lines when you lift (0 off .. 1 strong). */
  predictive: number;
  /** Fill bucket: how different a colour can be and still get filled (0..1). */
  fillTolerance: number;
  /** Fill what you see on all layers, or only this layer's paint. */
  fillSample: 'all' | 'layer';
  toolsTab: string;
  glow: GlowSettings;
  /** Record a time-lapse while painting. */
  timelapse: boolean;
  /** One-time tips already shown. */
  seenTips: string[];
}

const KEY = 'drift.studio.prefs';
const BRUSHES_KEY = 'drift.studio.brushes';

function defaults(): StudioPrefs {
  return {
    mode: 'paint',
    tools: {
      paint: { brush: 'round', size: 30, opacity: 1 },
      smudge: { brush: 'round', size: 44, opacity: 0.8 },
      erase: { brush: 'round', size: 40, opacity: 1 },
    },
    color: '#2e5aa8',
    previous: '#d8572a',
    recent: [],
    myPalette: [],
    library: 'watercolor',
    colorTab: 'disc',
    brushSet: 'Paint',
    brushSizes: {},
    penOnly: false,
    seenHelp: false,
    symmetry: { mode: 'off', count: 6, cx: 0.5, cy: 0.5 },
    quickShape: true,
    predictive: 0,
    fillTolerance: 0.25,
    fillSample: 'all',
    toolsTab: 'symmetry',
    glow: {
      rainbow: true,
      size: 0.45,
      brightness: 0.55,
      swirl: 0.45,
      flow: 0.55,
      fade: false,
      background: 'night',
      symmetry: { mode: 'off', count: 6 },
      tab: 'light',
    },
    timelapse: true,
    seenTips: [],
  };
}

export function loadPrefs(): StudioPrefs {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<StudioPrefs>;
    return {
      ...base,
      ...saved,
      tools: { ...base.tools, ...(saved.tools ?? {}) },
      recent: Array.isArray(saved.recent) ? saved.recent.slice(0, 10) : [],
      myPalette: Array.isArray(saved.myPalette) ? saved.myPalette.slice(0, 60) : [],
      brushSizes: saved.brushSizes && typeof saved.brushSizes === 'object' ? saved.brushSizes : {},
      symmetry: { ...base.symmetry, ...(saved.symmetry ?? {}) },
      glow: { ...base.glow, ...(saved.glow ?? {}), symmetry: { ...base.glow.symmetry, ...(saved.glow?.symmetry ?? {}) } },
      seenTips: Array.isArray(saved.seenTips) ? saved.seenTips : [],
    };
  } catch {
    return base;
  }
}

export function savePrefs(prefs: StudioPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: settings just won't stick.
  }
}

/** Remembers a colour you used, newest first, no repeats. */
export function pushRecent(prefs: StudioPrefs, color: string): void {
  prefs.recent = [color, ...prefs.recent.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 10);
}

/** Your own brushes (My brushes), loaded into the brush list. */
export function loadCustomBrushes(): void {
  try {
    const raw = localStorage.getItem(BRUSHES_KEY);
    const list = raw ? (JSON.parse(raw) as Brush[]) : [];
    setCustomBrushes(Array.isArray(list) ? list.filter((b) => b && b.id && b.name).map((b) => completeBrush(b)) : []);
  } catch {
    setCustomBrushes([]);
  }
}

/** Saves My brushes; false if the browser's storage is full or blocked. */
export function saveCustomBrushes(list: Brush[]): boolean {
  setCustomBrushes(list);
  try {
    localStorage.setItem(BRUSHES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
