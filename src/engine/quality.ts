import type { Gpu } from './gl';

export type Tier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: Tier;
  simRes: number;
  dyeRes: number;
  pressureIterations: number;
  bloom: boolean;
  sunrays: boolean;
  /** Cap on devicePixelRatio for the canvases. */
  pixelRatio: number;
  /** Particle budget for overlay effects (fireflies etc.). */
  particles: number;
}

const TIERS: Record<Tier, Omit<QualitySettings, 'tier'>> = {
  high: { simRes: 128, dyeRes: 1024, pressureIterations: 20, bloom: true, sunrays: true, pixelRatio: 2, particles: 28 },
  medium: { simRes: 128, dyeRes: 512, pressureIterations: 16, bloom: true, sunrays: false, pixelRatio: 1.5, particles: 20 },
  low: { simRes: 64, dyeRes: 256, pressureIterations: 10, bloom: false, sunrays: false, pixelRatio: 1, particles: 12 },
};

const ORDER: Tier[] = ['low', 'medium', 'high'];

/** Matches GPUs that struggle with full-screen float simulations. */
const WEAK_GPU = /Mali-[34]\d\d|Mali-T[67]\d\d|Adreno \(TM\) [345]\d\d|PowerVR SGX|PowerVR Rogue GE8[0-3]/i;

export function isTier(value: unknown): value is Tier {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** Picks a starting tier: explicit override, then last known good, then a guess from the device. */
export function initialTier(gpu: Gpu, saved: Tier | null): Tier {
  if (saved) return saved;
  if (!gpu.linearFiltering || WEAK_GPU.test(gpu.renderer)) return 'low';
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarsePointer ? 'medium' : 'high';
}

/**
 * Holds the active quality tier and steps it down when the frame rate sags.
 * It never steps back up on its own, so the picture doesn't flicker between tiers.
 */
export class Quality {
  settings: QualitySettings;
  onChange: ((settings: QualitySettings) => void) | null = null;
  fps = 60;
  private frames = 0;
  private elapsed = 0;
  private warmup = 0;
  private lastChange = 0;

  constructor(
    tier: Tier,
    private locked: boolean,
  ) {
    this.settings = { tier, ...TIERS[tier] };
  }

  /** Switches tier from Settings. A locked tier is never changed by the frame-rate governor. */
  setTier(tier: Tier, locked: boolean): void {
    this.settings = { tier, ...TIERS[tier] };
    this.locked = locked;
    this.resetMeasurement();
  }

  /** Ignore the first second after a toy starts (shader warm-up, resizes). */
  resetMeasurement(): void {
    this.warmup = 1;
    this.frames = 0;
    this.elapsed = 0;
  }

  /** Feed the real (unclamped) frame time in seconds. Returns true if the tier changed. */
  sample(rawDt: number, now: number): boolean {
    if (this.warmup > 0) {
      this.warmup -= rawDt;
      return false;
    }
    // Skip giant gaps (tab switches, breakpoints) rather than counting them as slow frames.
    if (rawDt > 0.25) return false;
    this.frames++;
    this.elapsed += rawDt;
    if (this.elapsed < 2) return false;

    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (this.locked || this.fps >= 42 || now - this.lastChange < 3000) return false;

    const index = ORDER.indexOf(this.settings.tier);
    if (index <= 0) return false;
    const tier = ORDER[index - 1];
    this.settings = { tier, ...TIERS[tier] };
    this.lastChange = now;
    this.warmup = 1;
    this.onChange?.(this.settings);
    return true;
  }
}
