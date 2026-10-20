import { deleteFrames, getFrames } from '../doc/library';
import { fileName, shareOrSave } from '../export';
import type { TimelapseRecorder } from '../timelapse/recorder';
import { makeVideo, type Video, type VideoLength, videoSeconds, videoSupported } from '../timelapse/video';

export interface TimelapseOptions {
  paintingId: string;
  name: string;
  recorder: TimelapseRecorder;
  toast(text: string, ms?: number): void;
}

/**
 * The Time-lapse part of the share sheet: choose the full replay or a
 * 30-second short, make the video, watch it, then share or save it.
 */
export class TimelapsePanel {
  readonly el: HTMLElement;
  private length: VideoLength = 'short';
  private abort: AbortController | null = null;
  private url: string | null = null;
  private video: Video | null = null;

  constructor(private readonly options: TimelapseOptions) {
    this.el = document.createElement('div');
    void this.render();
  }

  private note(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'st-note';
    p.textContent = text;
    return p;
  }

  private chip(label: string, run: () => void, className = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `st-chip-btn ${className}`;
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }

  private async render(): Promise<void> {
    const { recorder } = this.options;
    if (!videoSupported()) {
      this.el.replaceChildren(this.note("This browser can't make videos. Try Chrome on Android, or a recent Safari."));
      return;
    }
    await recorder.flush();
    const frames = recorder.frames;
    if (!recorder.enabled && frames === 0) {
      this.el.replaceChildren(this.note('Time-lapse recording is off for this painting (turn it on in ⋯).'));
      return;
    }
    if (frames < 3) {
      this.el.replaceChildren(this.note('Paint a little more first: the time-lapse records your painting as it grows, a picture after each change.'));
      return;
    }
    const seg = document.createElement('div');
    seg.className = 'st-seg';
    const options: [VideoLength, string][] = [
      ['short', '30 seconds'],
      ['full', `Full (${Math.round(videoSeconds(frames, 'full'))} s)`],
    ];
    for (const [id, label] of options) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = this.length === id ? 'active' : '';
      b.addEventListener('click', () => {
        this.length = id;
        void this.render();
      });
      seg.appendChild(b);
    }
    const row = document.createElement('div');
    row.className = 'st-row';
    row.innerHTML = '<label>Length</label>';
    row.appendChild(seg);
    const actions = document.createElement('div');
    actions.className = 'st-actions';
    actions.append(
      this.chip('Make video', () => void this.make(), 'primary'),
      this.chip('Start recording again', () => void this.restart()),
    );
    this.el.replaceChildren(
      this.note(`${frames} moments recorded so far. The 30-second short is made for sharing; the full replay shows every step.`),
      row,
      actions,
    );
  }

  private async make(): Promise<void> {
    const { paintingId, name, recorder, toast } = this.options;
    await recorder.flush();
    const frames = await getFrames(paintingId);
    if (frames.length < 2) return;
    this.abort = new AbortController();
    const bar = document.createElement('div');
    bar.className = 'st-progress';
    const fill = document.createElement('div');
    bar.appendChild(fill);
    const status = this.note('Making your video… keep this screen open.');
    const cancel = this.chip('Cancel', () => this.abort?.abort());
    this.el.replaceChildren(status, bar, cancel);
    try {
      const video = await makeVideo(frames, {
        length: this.length,
        signal: this.abort.signal,
        onProgress: (k) => (fill.style.width = `${Math.round(k * 100)}%`),
      });
      if (!video) {
        await this.render();
        return;
      }
      this.video = video;
      this.showResult(name);
    } catch {
      toast('Could not make the video this time', 2400);
      await this.render();
    } finally {
      this.abort = null;
    }
  }

  private showResult(name: string): void {
    const video = this.video;
    if (!video) return;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(video.blob);
    const player = document.createElement('video');
    player.className = 'st-video';
    player.src = this.url;
    player.controls = true;
    player.loop = true;
    player.muted = true;
    player.playsInline = true;
    void player.play().catch(() => {});
    const size = `${(video.blob.size / 1e6).toFixed(1)} MB ${video.ext.toUpperCase()}`;
    const actions = document.createElement('div');
    actions.className = 'st-actions';
    actions.append(
      this.chip('Share or save video', async () => {
        const result = await shareOrSave(video.blob, fileName(`${name} time-lapse`, video.ext)).catch(() => 'failed' as const);
        if (result === 'shared') this.options.toast('Shared');
        else if (result === 'saved') this.options.toast('Saved to your downloads');
        else if (result === 'failed') this.options.toast('Could not share the video');
      }, 'primary'),
      this.chip('Make another', () => void this.render()),
    );
    this.el.replaceChildren(player, this.note(size), actions);
  }

  private async restart(): Promise<void> {
    if (!window.confirm('Forget the time-lapse so far and start recording from now?')) return;
    await deleteFrames(this.options.paintingId);
    this.options.recorder.reset();
    this.options.toast('Time-lapse starts again from here');
    await this.render();
  }

  /** The sheet closed: stop any video being made and let go of the file. */
  dispose(): void {
    this.abort?.abort();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
