/** Where vibration actually comes from. Swap in Capacitor Haptics for the native app. */
export interface HapticsBackend {
  readonly supported: boolean;
  impact(strength: number): void;
}

const webBackend: HapticsBackend = {
  supported: typeof navigator !== 'undefined' && 'vibrate' in navigator,
  impact(strength: number) {
    // Short pulses read as a soft "tick" rather than a buzz.
    navigator.vibrate?.(Math.round(5 + strength * 12));
  },
};

export class Haptics {
  private last = 0;

  constructor(
    public enabled: boolean,
    private readonly backend: HapticsBackend = webBackend,
  ) {}

  get supported(): boolean {
    return this.backend.supported;
  }

  /** A light tick, 0..1. Rate-limited so fast scribbles don't turn into a buzz. */
  tap(strength: number): void {
    if (!this.enabled || !this.backend.supported) return;
    const now = performance.now();
    if (now - this.last < 70) return;
    this.last = now;
    try {
      this.backend.impact(Math.min(1, Math.max(0, strength)));
    } catch {
      // Vibration can throw before the first user gesture; ignore.
    }
  }
}
