export type FrameCallback = (dt: number, rawDt: number, now: number) => void;

/**
 * requestAnimationFrame loop. `dt` is clamped to one 60 Hz step so the
 * simulation slows gracefully on slow frames instead of exploding; `rawDt` is
 * the real elapsed time for animations and FPS measurement.
 */
export class Loop {
  private handle = 0;
  private last = 0;
  private running = false;

  constructor(private readonly frame: FrameCallback) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const rawDt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    this.frame(Math.min(rawDt, 1 / 60), rawDt, now);
    this.handle = requestAnimationFrame(this.tick);
  };
}
