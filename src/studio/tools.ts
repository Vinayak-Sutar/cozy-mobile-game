import type { ToolMode } from './brush/engine';

/** One tool's own brush, size and opacity (paint, smudge and erase each remember theirs). */
export interface ToolSettings {
  brush: string;
  /** Size in pixels on a canvas 2000 px across; scaled to each painting. */
  size: number;
  opacity: number;
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
}

const KEY = 'drift.studio.prefs';

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
