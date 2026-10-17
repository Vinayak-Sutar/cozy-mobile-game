import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { applyTheme } from '../ui/theme';
import { store, type GraphicsMode, type Settings, type ThemeId } from './storage';

type Listener = (settings: Settings) => void;

/**
 * The one place settings change. It applies each change straight away (audio,
 * vibration, theme, graphics), saves it, and tells anything showing settings
 * (home quick toggles, the settings sheet) to refresh.
 */
export class Prefs {
  private listeners = new Set<Listener>();
  onGraphics: ((mode: GraphicsMode) => void) | null = null;
  onTheme: ((theme: ThemeId) => void) | null = null;

  constructor(
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
  ) {
    applyTheme(this.s.theme);
    this.applyAudio();
    haptics.enabled = this.s.haptics;
  }

  get s(): Settings {
    return store.data.settings;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMusicVolume(volume: number): void {
    this.update({ musicVolume: volume, musicMuted: volume <= 0 });
  }

  setSfxVolume(volume: number): void {
    this.update({ sfxVolume: volume, sfxMuted: volume <= 0 });
  }

  toggleMusic(): void {
    const unmuting = this.s.musicMuted || this.s.musicVolume <= 0;
    this.update({ musicMuted: !unmuting, musicVolume: unmuting && this.s.musicVolume <= 0 ? 0.6 : this.s.musicVolume });
  }

  toggleSfx(): void {
    const unmuting = this.s.sfxMuted || this.s.sfxVolume <= 0;
    this.update({ sfxMuted: !unmuting, sfxVolume: unmuting && this.s.sfxVolume <= 0 ? 0.7 : this.s.sfxVolume });
  }

  setHaptics(on: boolean): void {
    this.update({ haptics: on });
    if (on) this.haptics.tap(0.8);
  }

  setTheme(theme: ThemeId): void {
    if (theme === this.s.theme) return;
    this.update({ theme });
    applyTheme(theme);
    this.onTheme?.(theme);
  }

  setGraphics(mode: GraphicsMode): void {
    if (mode === this.s.graphics) return;
    this.update({ graphics: mode });
    this.onGraphics?.(mode);
  }

  get musicOn(): boolean {
    return !this.s.musicMuted && this.s.musicVolume > 0;
  }

  get sfxOn(): boolean {
    return !this.s.sfxMuted && this.s.sfxVolume > 0;
  }

  private update(patch: Partial<Settings>): void {
    Object.assign(store.data.settings, patch);
    store.save();
    this.applyAudio();
    this.haptics.enabled = this.s.haptics;
    for (const listener of this.listeners) listener(this.s);
  }

  private applyAudio(): void {
    this.audio.setVolumes(this.musicOn ? this.s.musicVolume : 0, this.sfxOn ? this.s.sfxVolume : 0);
  }
}
