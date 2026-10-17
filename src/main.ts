import './styles.css';
import { Prefs } from './app/prefs';
import { Router } from './app/router';
import { Stage } from './app/stage';
import { store, type GraphicsMode } from './app/storage';
import { FluidSim } from './engine/fluid';
import { Gpu } from './engine/gl';
import { Loop } from './engine/loop';
import { initialTier, isTier, Quality, type Tier } from './engine/quality';
import { AudioEngine } from './feel/audio';
import { Haptics } from './feel/haptics';
import { BrushPaint } from './toys/brushPaint';
import { GlowInk } from './toys/glowInk';
import { HiddenPicture } from './toys/hiddenPicture';
import { LittlePainter } from './toys/littlePainter';
import { MagicGarden } from './toys/magicGarden';
import { WaterGarden } from './toys/waterGarden';
import { Watercolor } from './toys/watercolor';
import { HoldButton } from './ui/holdButton';
import { icons } from './ui/icons';
import { HomeScreen } from './ui/screens/home';
import { ToyboxScreen } from './ui/screens/toybox';
import { openSettings } from './ui/settings';
import { Sheet } from './ui/sheet';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function boot(): void {
  const params = new URLSearchParams(location.search);
  const glCanvas = $<HTMLCanvasElement>('gl');
  const overlayCanvas = $<HTMLCanvasElement>('overlay');
  const fade = $('fade');

  const gpu = Gpu.create(glCanvas);
  if (!gpu) {
    $('unsupported').hidden = false;
    fade.classList.add('clear');
    return;
  }

  // ?quality=low|medium|high pins a tier for testing. Otherwise the Graphics
  // setting decides: Battery saver / Best pin a tier, Auto adapts to the device.
  const forced = params.get('quality');
  const tierFor = (mode: GraphicsMode): [Tier, boolean] => {
    if (isTier(forced)) return [forced, true];
    if (mode === 'saver') return ['low', true];
    if (mode === 'best') return ['high', true];
    return [initialTier(gpu, store.data.tier), false];
  };
  const quality = new Quality(...tierFor(store.data.settings.graphics));
  quality.onChange = (settings) => {
    store.data.tier = settings.tier;
    store.save();
  };

  const s = store.data.settings;
  const sim = new FluidSim(gpu, quality.settings);
  const audio = new AudioEngine(s.musicMuted ? 0 : s.musicVolume, s.sfxMuted ? 0 : s.sfxVolume);
  const haptics = new Haptics(s.haptics);
  const prefs = new Prefs(audio, haptics);
  const stage = new Stage({ gpu, sim, quality, audio, haptics, glCanvas, overlayCanvas });
  const loop = new Loop((dt, rawDt, now) => stage.frame(dt, rawDt, now));
  const toys = {
    glow: new GlowInk(),
    paint: new Watercolor(),
    brush: new BrushPaint(),
    pond: new MagicGarden(),
    water: new WaterGarden(),
    painter: new LittlePainter(),
    window: new HiddenPicture(),
  };
  const backdrops = { glow: new GlowInk(), paint: new Watercolor() };

  const sheet = new Sheet($('sheets'), audio);
  const settings = (onClose?: () => void): void => openSettings(sheet, prefs, audio, haptics, onClose);

  // `router` is assigned below; these callbacks only run after boot finishes.
  let router: Router;
  const screens = $('screens');
  const home = new HomeScreen(screens, prefs, audio, {
    play: () => void router.go('toybox'),
    settings: () => settings(),
  });
  const toybox = new ToyboxScreen(screens, audio, {
    back: () => void router.go('home'),
    settings: () => settings(),
    open: (id) => void router.go(id),
  });

  const toyUi = $('toy-ui');
  new HoldButton(toyUi, icons.pause, 'Hold to pause', () => router.pause());
  const toySlot = document.createElement('div');
  toySlot.style.display = 'contents';
  toyUi.appendChild(toySlot);

  router = new Router({
    stage,
    loop,
    audio,
    prefs,
    sheet,
    home,
    toybox,
    toyUi,
    toySlot,
    fade,
    glCanvas,
    toys,
    backdrops,
    openSettings: settings,
  });

  prefs.onTheme = () => router.refreshBackdrop();
  prefs.onGraphics = (mode) => {
    quality.setTier(...tierFor(mode));
    if (stage.toy) stage.applyQuality();
    router.refreshBackdrop();
  };

  // Browsers only allow sound and fullscreen inside a user gesture. For touch,
  // Chrome counts the *end* of a tap as the gesture, not pointerdown, so listen
  // to both and keep trying until it sticks (Android also drops fullscreen when
  // you switch apps, so the next tap brings it back).
  const onGesture = (): void => {
    audio.unlock();
    enterFullscreen();
    void keepAwake.request();
  };
  for (const type of ['pointerdown', 'pointerup', 'touchend'] as const) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
      audio.suspend();
      // The app may be closed from the background: keep progress (e.g. the garden).
      store.save();
      return;
    }
    audio.resume();
    router.wake();
    void keepAwake.request();
  });

  store.data.stats.opens += 1;
  store.save();

  void router.go('home', true);

  if (params.has('debug')) {
    startDebugOverlay(gpu, quality, sim);
    // Handles for poking at the app from the console (e.g. stepping frames by hand).
    Object.assign(window, { drift: { stage, loop, router, quality, sim, prefs, toys, sheet } });
  }
}

let fullscreenPending = false;

/** Immersive fullscreen on phones, unless already running as an installed app. */
function enterFullscreen(): void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const installed = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  const root = document.documentElement;
  if (!coarse || installed || fullscreenPending || document.fullscreenElement || !root.requestFullscreen) return;
  fullscreenPending = true;
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .catch(() => {
      // Not a gesture yet, or not allowed here (iOS Safari, iframes): the next tap tries again.
    })
    .finally(() => {
      fullscreenPending = false;
    });
}

/** Keeps the screen on while playing. Needs HTTPS (or localhost); silently skipped otherwise. */
const keepAwake = {
  sentinel: null as WakeLockSentinel | null,
  async request(): Promise<void> {
    if (this.sentinel || !('wakeLock' in navigator) || document.hidden) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      this.sentinel = null;
    }
  },
};

function startDebugOverlay(gpu: Gpu, quality: Quality, sim: FluidSim): void {
  const el = document.createElement('div');
  el.id = 'debug';
  document.getElementById('app')?.appendChild(el);
  const update = (): void => {
    const s = quality.settings;
    el.textContent = [
      `fps    ${quality.fps.toFixed(0)}`,
      `tier   ${s.tier}`,
      `sim    ${sim.velocity.width}x${sim.velocity.height}`,
      `dye    ${sim.dye.width}x${sim.dye.height}`,
      `canvas ${gpu.width}x${gpu.height}`,
      `gl     ${gpu.isWebGL2 ? 'webgl2' : 'webgl1'}${gpu.linearFiltering ? '' : ' (no linear)'}`,
    ].join('\n');
  };
  update();
  window.setInterval(update, 500);
}

boot();
