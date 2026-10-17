import type { AudioEngine } from '../feel/audio';
import { icons } from './icons';

/**
 * Bottom sheet used for Settings and Pause. One open at a time; tapping the
 * dimmed background, the close button or Escape closes it.
 */
export class Sheet {
  private readonly scrim: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    root.innerHTML = `
      <div class="sheet-scrim"></div>
      <section class="sheet-panel" role="dialog" aria-modal="true">
        <header class="sheet-head">
          <h2 class="sheet-title"></h2>
          <button class="icon-btn clay sheet-close" aria-label="Close">${icons.close}</button>
        </header>
        <div class="sheet-body"></div>
      </section>`;
    this.scrim = root.querySelector('.sheet-scrim') as HTMLElement;
    this.panel = root.querySelector('.sheet-panel') as HTMLElement;
    this.title = root.querySelector('.sheet-title') as HTMLElement;
    this.body = root.querySelector('.sheet-body') as HTMLElement;
    this.scrim.addEventListener('click', () => this.close());
    root.querySelector('.sheet-close')?.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  open(title: string, content: HTMLElement, onClose?: () => void): void {
    this.title.textContent = title;
    this.panel.setAttribute('aria-label', title);
    this.body.replaceChildren(content);
    this.body.scrollTop = 0;
    this.onClose = onClose ?? null;
    this.root.classList.add('open');
    this.audio.ui('open');
  }

  /** Closes without running the onClose callback (used when swapping one sheet for another). */
  dismiss(): void {
    this.onClose = null;
    this.root.classList.remove('open');
  }

  close(): void {
    if (!this.isOpen) return;
    const callback = this.onClose;
    this.onClose = null;
    this.root.classList.remove('open');
    this.audio.ui('close');
    callback?.();
  }
}
