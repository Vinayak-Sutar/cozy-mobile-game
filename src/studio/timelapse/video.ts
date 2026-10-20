/**
 * Makes the time-lapse video: plays the recorded frames into a small canvas
 * and records it with MediaRecorder. MP4 (H.264) where the browser can, so
 * it shares to more apps; WebM otherwise. Recording happens in real time,
 * so a 30-second video takes about 30 seconds to make.
 */

export type VideoLength = 'full' | 'short';

export interface Video {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

function bestType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function videoSupported(): boolean {
  return bestType() !== null;
}

/** How long the video will be, in seconds, for `frames` frames. */
export function videoSeconds(frames: number, length: VideoLength): number {
  if (length === 'short') return 30;
  // The full replay plays 24 frames a second, then holds the finished picture.
  return Math.max(4, frames / 24) + 2.5;
}

export interface MakeOptions {
  length: VideoLength;
  onProgress(fraction: number): void;
  signal?: AbortSignal;
}

/** Null if it was cancelled. */
export async function makeVideo(frames: Blob[], options: MakeOptions): Promise<Video | null> {
  const type = bestType();
  if (!type) throw new Error('Video recording is not supported here');
  if (!frames.length) throw new Error('No frames');

  const first = await createImageBitmap(frames[0]);
  // Even sizes keep video encoders happy.
  const w = first.width - (first.width % 2);
  const h = first.height - (first.height % 2);
  first.close();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // Some browsers only send frames from a canvas that's on the page.
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;pointer-events:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas unavailable');

  const total = videoSeconds(frames.length, options.length) * 1000;
  const hold = options.length === 'short' ? 3000 : 2500;
  const play = total - hold;
  // Frames are sent by hand (requestFrame) on every tick: a canvas that doesn't
  // change sends nothing by itself, which would cut the held ending short.
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  // Decode a few frames ahead so drawing never waits.
  const decoded = new Map<number, Promise<ImageBitmap>>();
  const decode = (i: number): Promise<ImageBitmap> => {
    let p = decoded.get(i);
    if (!p) {
      p = createImageBitmap(frames[i]);
      decoded.set(i, p);
    }
    return p;
  };
  let shown = -1;
  let current: ImageBitmap | null = null;
  const show = async (i: number): Promise<void> => {
    if (i !== shown) {
      current = await decode(i);
      shown = i;
    }
    if (current) ctx.drawImage(current, 0, 0, w, h);
    track.requestFrame?.();
    for (let k = i + 1; k <= Math.min(frames.length - 1, i + 4); k++) void decode(k);
    // Let go of frames already shown.
    for (const [k, b] of decoded) {
      if (k < shown) {
        decoded.delete(k);
        void b.then((bm) => bm.close());
      }
    }
  };

  await show(0);
  recorder.start(1000);
  const start = performance.now();
  let cancelled = false;
  try {
    for (;;) {
      if (options.signal?.aborted) {
        cancelled = true;
        break;
      }
      const t = performance.now() - start;
      if (t >= total) break;
      const index = Math.min(frames.length - 1, Math.floor((t / play) * frames.length));
      await show(index);
      options.onProgress(Math.min(1, t / total));
      // Timers keep going (slowly) if the screen is hidden; animation frames would stop.
      await new Promise((r) => setTimeout(r, 1000 / 30));
    }
  } finally {
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    for (const b of decoded.values()) void b.then((bm) => bm.close());
    canvas.remove();
  }
  if (cancelled) return null;
  options.onProgress(1);
  const mime = type.split(';')[0];
  return { blob: new Blob(chunks, { type: mime }), ext: mime === 'video/mp4' ? 'mp4' : 'webm' };
}
