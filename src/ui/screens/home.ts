import type { Prefs } from '../../app/prefs';
import type { Settings } from '../../app/storage';
import type { AudioEngine } from '../../feel/audio';
import { icons } from '../icons';

export interface HomeActions {
  play(): void;
  settings(): void;
}

/** Title screen: logo, a big Play button, and quick sound toggles. The fluid behind it is live. */
export class HomeScreen {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, prefs: Prefs, audio: AudioEngine, actions: HomeActions) {
    const el = document.createElement('section');
    el.className = 'screen home away';
    el.innerHTML = `
      <div class="top-bar">
        <span class="spacer"></span>
        <button class="icon-btn clay" data-toggle="music" aria-label="Music">${icons.music}<span class="slash">${icons.slash}</span></button>
        <button class="icon-btn clay" data-toggle="sfx" aria-label="Sounds">${icons.sound}<span class="slash">${icons.slash}</span></button>
        <button class="icon-btn clay" data-action="settings" aria-label="Settings">${icons.gear}</button>
      </div>
      <div class="home-center">
        <h1 class="logo">Drift</h1>
        <p class="tagline">a calm little toy box</p>
        <button class="pill-btn clay primary play-btn" data-action="play">${icons.play}<span>Play</span></button>
        <p class="home-hint">Swirl the background with your finger</p>
      </div>`;
    parent.appendChild(el);
    this.el = el;

    const musicToggle = el.querySelector('[data-toggle="music"]') as HTMLElement;
    const sfxToggle = el.querySelector('[data-toggle="sfx"]') as HTMLElement;
    musicToggle.addEventListener('click', () => {
      prefs.toggleMusic();
      audio.ui('tap');
    });
    sfxToggle.addEventListener('click', () => {
      prefs.toggleSfx();
      audio.ui('tap');
    });
    el.querySelector('[data-action="play"]')?.addEventListener('click', () => {
      audio.ui('select');
      actions.play();
    });
    el.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
      audio.ui('tap');
      actions.settings();
    });

    const sync = (s: Settings): void => {
      musicToggle.setAttribute('aria-pressed', String(!s.musicMuted && s.musicVolume > 0));
      sfxToggle.setAttribute('aria-pressed', String(!s.sfxMuted && s.sfxVolume > 0));
    };
    sync(prefs.s);
    prefs.subscribe(sync);
  }
}
