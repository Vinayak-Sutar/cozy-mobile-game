import { addFrame, canvasBlob, frameInfo } from '../doc/library';

/** Frames are recorded this size on their long side: small to store, and safe for video on Android. */
export const FRAME_SIZE = 720;
/** At most one frame this often (ms), however fast the strokes come. */
const MIN_GAP = 700;

/**
 * Records the painting as it grows: a small picture after each change,
 * kept with the painting, from which the time-lapse video is made.
 * Very long paintings record every second or fourth change, so the
 * frames stay a sensible size.
 */
export class TimelapseRecorder {
  private seq = 0;
  private count = 0;
  private changes = 0;
  private pending = false;
  private busy = false;
  private last = 0;
  private timer = 0;
  private ready: Promise<void>;
  enabled = true;

  constructor(
    private readonly paintingId: string,
    /** The picture as it is now, at frame size. */
    private readonly picture: () => HTMLCanvasElement,
    /** False while a stroke is under way: frames wait, so painting stays smooth. */
    private readonly idle: () => boolean = () => true,
  ) {
    this.ready = frameInfo(paintingId)
      .then((info) => {
        this.count = info.count;
        this.seq = info.last + 1;
      })
      .catch(() => {
        this.enabled = false;
      });
  }

  get frames(): number {
    return this.count;
  }

  /** Something changed on the painting. */
  changed(): void {
    if (!this.enabled) return;
    this.changes++;
    const every = this.count < 900 ? 1 : this.count < 1800 ? 2 : 4;
    if (this.changes % every) return;
    this.pending = true;
    window.clearTimeout(this.timer);
    const wait = Math.max(120, MIN_GAP - (performance.now() - this.last));
    this.timer = window.setTimeout(() => void this.capture(), wait);
  }

  /** Records any change that's still waiting (when leaving or hiding the app). */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (this.pending) await this.capture();
  }

  private async capture(): Promise<void> {
    if (!this.pending || !this.enabled) return;
    if (this.busy || !this.idle()) {
      this.timer = window.setTimeout(() => void this.capture(), 250);
      return;
    }
    this.busy = true;
    this.pending = false;
    this.last = performance.now();
    try {
      await this.ready;
      const blob = await canvasBlob(this.picture(), 'image/jpeg', 0.82);
      await addFrame(this.paintingId, this.seq, blob);
      this.seq++;
      this.count++;
    } catch {
      // Out of space or storage blocked: the painting matters more than the replay.
      this.enabled = false;
    } finally {
      this.busy = false;
    }
  }

  /** Starts the frame count again (after the frames were deleted). */
  reset(): void {
    this.seq = 0;
    this.count = 0;
    this.changes = 0;
    this.pending = false;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
  }
}
