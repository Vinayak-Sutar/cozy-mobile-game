import type { Loop } from '../engine/loop';
import type { AudioEngine, SoundTheme } from '../feel/audio';
import type { GlowInk } from '../toys/glowInk';
import type { Toy } from '../toys/Toy';
import type { Watercolor } from '../toys/watercolor';
import { icons } from '../ui/icons';
import { openPause } from '../ui/pause';
import type { HomeScreen } from '../ui/screens/home';
import type { ToyboxScreen } from '../ui/screens/toybox';
import type { Sheet } from '../ui/sheet';
import { getTheme } from '../ui/theme';
import type { Prefs } from './prefs';
import type { Stage } from './stage';
import { store, type ToyId } from './storage';

export type Route = 'home' | 'toybox' | ToyId;

export interface RouterDeps {
  stage: Stage;
  loop: Loop;
  audio: AudioEngine;
  prefs: Prefs;
  sheet: Sheet;
  home: HomeScreen;
  toybox: ToyboxScreen;
  toyUi: HTMLElement;
  toySlot: HTMLElement;
  fade: HTMLElement;
  glCanvas: HTMLCanvasElement;
  toys: Record<ToyId, Toy>;
  backdrops: { glow: GlowInk; paint: Watercolor };
  openSettings(onClose?: () => void): void;
}

const FADE_MS = 420;

/** The menus' music and touch notes: a music-box lullaby in C. */
const MENU_SOUND: SoundTheme = {
  scale: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
  voice: 'kalimba',
  bed: 'lullaby',
  swish: { type: 'bandpass', low: 400, high: 1600, q: 0.7, gain: 0.03 },
};

/**
 * Moves between Home, the Toy box and the toys. On the menus a themed toy
 * runs live behind the buttons (unless Battery saver is on), so even the
 * title screen answers your finger.
 */
export class Router {
  current: Route | null = null;
  private busy = false;
  private backdropKey = '';
  private paused = false;

  constructor(private readonly deps: RouterDeps) {}

  get inToy(): boolean {
    return this.current !== null && this.current !== 'home' && this.current !== 'toybox';
  }

  get isPaused(): boolean {
    return this.paused;
  }

  async go(route: Route, instant = false): Promise<void> {
    if (route === this.current || this.busy) return;
    this.busy = true;
    const { fade } = this.deps;
    const wasMenu = this.current === 'home' || this.current === 'toybox';
    const isMenu = route === 'home' || route === 'toybox';
    // Menu-to-menu is a light slide; anything involving a toy gets a soft fade.
    const fadeOut = !instant && !(wasMenu && isMenu);

    if (fadeOut) {
      fade.classList.remove('clear');
      await wait(FADE_MS);
    }

    if (isMenu) this.showMenu(route);
    else this.showToy(route);
    this.current = route;
    this.paused = false;

    fade.classList.add('clear');
    if (fadeOut || instant) await wait(FADE_MS);
    this.busy = false;
  }

  /** Re-applies the menu backdrop after a theme or graphics change. */
  refreshBackdrop(): void {
    if (this.inToy || this.current === null) return;
    this.ensureBackdrop();
  }

  pause(): void {
    if (!this.inToy || this.paused) return;
    const { stage, loop, sheet, audio, toys } = this.deps;
    const toy = toys[this.current as ToyId];
    this.paused = true;
    stage.releasePointers();
    loop.stop();

    const toyActions = toy.pauseActions().map((action) => ({
      ...action,
      run: () => {
        sheet.dismiss();
        action.run();
        this.resume();
      },
    }));
    openPause(
      sheet,
      audio,
      [
        ...toyActions,
        {
          label: 'Settings',
          icon: icons.gear,
          run: () => {
            sheet.dismiss();
            this.paused = false;
            this.deps.openSettings(() => this.pause());
          },
        },
        { label: 'Toy box', icon: icons.toybox, run: () => this.leaveTo('toybox') },
        { label: 'Home', icon: icons.home, run: () => this.leaveTo('home') },
      ],
      () => this.resume(),
    );
  }

  /** Called when the app becomes visible again. */
  wake(): void {
    if (this.paused || this.deps.sheet.isOpen) return;
    if (this.inToy || this.deps.stage.toy) this.deps.loop.start();
  }

  private resume(): void {
    this.paused = false;
    if (this.inToy && !document.hidden) this.deps.loop.start();
  }

  private leaveTo(route: Route): void {
    this.deps.sheet.dismiss();
    this.paused = false;
    void this.go(route);
  }

  private showMenu(route: 'home' | 'toybox'): void {
    const { home, toybox, toyUi } = this.deps;
    toyUi.hidden = true;
    home.el.classList.toggle('away', route !== 'home');
    toybox.el.classList.toggle('away', route !== 'toybox');
    if (route === 'toybox') toybox.refresh();
    if (!this.isMenu(this.current)) this.ensureBackdrop(true);
  }

  private showToy(id: ToyId): void {
    const { home, toybox, toyUi, toySlot, stage, audio, loop, glCanvas, toys } = this.deps;
    const toy = toys[id];
    home.el.classList.add('away');
    toybox.el.classList.add('away');
    glCanvas.classList.remove('hidden');
    toyUi.hidden = false;
    stage.setToy(toy, toySlot);
    audio.setTheme(toy.sound);
    loop.start();
    this.backdropKey = '';
    store.data.lastToy = id;
    store.data.stats.plays[id] = (store.data.stats.plays[id] ?? 0) + 1;
    store.save();
  }

  /** Starts (or restyles) the live menu background, or shows the static art in Battery saver. */
  private ensureBackdrop(force = false): void {
    const { stage, loop, audio, glCanvas, prefs, backdrops } = this.deps;
    const theme = getTheme(prefs.s.theme);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const live = prefs.s.graphics !== 'saver' && !reducedMotion;
    const key = `${theme.id}:${live}`;
    audio.setTheme(MENU_SOUND);
    if (!force && key === this.backdropKey) return;
    this.backdropKey = key;
    // Hides the "swirl the background" hint when the background is a still picture.
    document.body.classList.toggle('static-bg', !live);

    if (!live) {
      stage.clearToy();
      loop.stop();
      glCanvas.classList.add('hidden');
      return;
    }
    const look = theme.backdrop;
    let toy: Toy;
    if (look.kind === 'glow') {
      backdrops.glow.setLook(look.top, look.bottom, look.hue, look.hueRange);
      toy = backdrops.glow;
    } else {
      backdrops.paint.setLook(look.paper, look.pigments);
      toy = backdrops.paint;
    }
    glCanvas.classList.remove('hidden');
    stage.setToy(toy);
    if (!document.hidden) loop.start();
  }

  private isMenu(route: Route | null): boolean {
    return route === 'home' || route === 'toybox';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
