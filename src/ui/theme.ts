import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/quicksand/latin-500.css';
import '@fontsource/quicksand/latin-700.css';
import type { ThemeId } from '../app/storage';

/** What the live menu background looks like for a theme. */
export type Backdrop =
  | { kind: 'glow'; top: string; bottom: string; hue: number; hueRange: number }
  | { kind: 'paint'; paper: string; pigments: string[] };

export interface ThemeDef {
  id: ThemeId;
  name: string;
  mood: string;
  /** Representative colours for the theme picker. */
  swatches: string[];
  /** Browser/status-bar colour. */
  meta: string;
  backdrop: Backdrop;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'moonlit',
    name: 'Moonlit lullaby',
    mood: 'Bedtime calm',
    swatches: ['#141533', '#8E7CC3', '#F6E7C1', '#7FD1C7', '#F4A6C1'],
    meta: '#141533',
    backdrop: { kind: 'glow', top: '#1d1f4a', bottom: '#0d0e24', hue: 0.62, hueRange: 0.14 },
  },
  {
    id: 'clay',
    name: 'Cotton candy clay',
    mood: 'Puffy and playful',
    swatches: ['#FFF6EC', '#FFB8A8', '#C9B6F2', '#A8E6CF', '#FFE29A'],
    meta: '#FFF6EC',
    backdrop: { kind: 'paint', paper: '#FFF6EC', pigments: ['#FFB8A8', '#C9B6F2', '#A8E6CF', '#A9D6F5', '#FFE29A'] },
  },
  {
    id: 'meadow',
    name: 'Storybook meadow',
    mood: 'Warm paper, cozy',
    swatches: ['#F4EBDC', '#B1C49E', '#8EC5D6', '#F2C14E', '#D98261'],
    meta: '#F4EBDC',
    backdrop: { kind: 'paint', paper: '#F4EBDC', pigments: ['#B1C49E', '#8EC5D6', '#F2C14E', '#D98261', '#6E9B7E'] },
  },
  {
    id: 'dusk',
    name: 'Dusk origami',
    mood: 'Sunset, grown-up',
    swatches: ['#5A3E6E', '#FFD6A5', '#FF9F8A', '#E07A8E', '#9B5D8C'],
    meta: '#4A3B6B',
    backdrop: { kind: 'glow', top: '#6a4a7e', bottom: '#2e2244', hue: 0.99, hueRange: 0.07 },
  },
];

export function getTheme(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Switches the CSS token set and the browser chrome colour. */
export function applyTheme(id: ThemeId): ThemeDef {
  const theme = getTheme(id);
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.meta);
  return theme;
}
