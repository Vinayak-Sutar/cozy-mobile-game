import type { Prefs } from '../app/prefs';
import type { GraphicsMode, Settings } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { icons } from './icons';
import type { Sheet } from './sheet';
import { THEMES } from './theme';

const GRAPHICS: { id: GraphicsMode; label: string }[] = [
  { id: 'saver', label: 'Battery saver' },
  { id: 'auto', label: 'Auto' },
  { id: 'best', label: 'Best' },
];

/** Opens the Settings sheet. Every control applies instantly through Prefs. */
export function openSettings(sheet: Sheet, prefs: Prefs, audio: AudioEngine, haptics: Haptics, onClose?: () => void): void {
  const root = document.createElement('div');
  root.innerHTML = `
    <p class="section-label">Sound</p>
    <div class="setting-row">
      <span class="row-icon">${icons.music}</span>
      <span class="row-label">Music</span>
      <input class="slider row-grow" type="range" min="0" max="100" step="1" data-volume="music" aria-label="Music volume" />
    </div>
    <div class="setting-row">
      <span class="row-icon">${icons.sound}</span>
      <span class="row-label">Sounds</span>
      <input class="slider row-grow" type="range" min="0" max="100" step="1" data-volume="sfx" aria-label="Sound effects volume" />
    </div>
    ${
      haptics.supported
        ? `<div class="setting-row">
            <span class="row-icon">${icons.vibrate}</span>
            <span class="row-label row-grow">Vibration</span>
            <button class="switch" role="switch" data-haptics aria-label="Vibration"></button>
          </div>`
        : ''
    }
    <p class="section-label">Theme</p>
    <div class="theme-grid" role="radiogroup" aria-label="Theme">
      ${THEMES.map(
        (t) => `
        <button class="theme-card" role="radio" data-theme-id="${t.id}">
          <span class="theme-preview" style="background:${t.swatches[0]}">
            ${t.swatches
              .slice(1)
              .map((c) => `<span style="background:${c}"></span>`)
              .join('')}
          </span>
          <span class="theme-name">${t.name}</span>
          <span class="theme-mood">${t.mood}</span>
        </button>`,
      ).join('')}
    </div>
    <p class="section-label">Graphics</p>
    <div class="segmented" role="radiogroup" aria-label="Graphics quality">
      ${GRAPHICS.map((g) => `<button role="radio" data-graphics="${g.id}">${g.label}</button>`).join('')}
    </div>
    <p class="section-label">About</p>
    <p class="about">
      Drift v0.2: a calm, touch-reactive toy box.<br />
      The fluid engine is adapted from Pavel Dobryakov's WebGL Fluid Simulation (MIT licence).
      All sounds are made live in code.
    </p>`;

  const music = root.querySelector('[data-volume="music"]') as HTMLInputElement;
  const sfx = root.querySelector('[data-volume="sfx"]') as HTMLInputElement;
  const hapticSwitch = root.querySelector('[data-haptics]') as HTMLButtonElement | null;

  const sync = (s: Settings): void => {
    setSlider(music, s.musicMuted ? 0 : s.musicVolume);
    setSlider(sfx, s.sfxMuted ? 0 : s.sfxVolume);
    hapticSwitch?.setAttribute('aria-checked', String(s.haptics));
    for (const card of root.querySelectorAll<HTMLElement>('[data-theme-id]')) {
      card.setAttribute('aria-checked', String(card.dataset.themeId === s.theme));
    }
    for (const button of root.querySelectorAll<HTMLElement>('[data-graphics]')) {
      button.setAttribute('aria-checked', String(button.dataset.graphics === s.graphics));
    }
  };

  music.addEventListener('input', () => prefs.setMusicVolume(Number(music.value) / 100));
  sfx.addEventListener('input', () => {
    prefs.setSfxVolume(Number(sfx.value) / 100);
    // Let people hear the level they're choosing.
    audio.previewNote(Number(sfx.value) / 100);
  });
  hapticSwitch?.addEventListener('click', () => prefs.setHaptics(!prefs.s.haptics));
  for (const card of root.querySelectorAll<HTMLElement>('[data-theme-id]')) {
    card.addEventListener('click', () => {
      audio.ui('select');
      prefs.setTheme(card.dataset.themeId as Settings['theme']);
    });
  }
  for (const button of root.querySelectorAll<HTMLElement>('[data-graphics]')) {
    button.addEventListener('click', () => {
      audio.ui('tap');
      prefs.setGraphics(button.dataset.graphics as GraphicsMode);
    });
  }

  sync(prefs.s);
  const unsubscribe = prefs.subscribe(sync);
  sheet.open('Settings', root, () => {
    unsubscribe();
    onClose?.();
  });
}

function setSlider(input: HTMLInputElement, value: number): void {
  const percent = Math.round(value * 100);
  if (document.activeElement !== input) input.value = String(percent);
  input.style.setProperty('--fill', `${input.value}%`);
}
