import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { SCENES, sceneThumbnail } from '../toys/scenes';
import { icons } from './icons';

const WINDOW_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="3.5" y="3" width="17" height="18" rx="2.5" fill="#cfe6f7" stroke="#8a6238" stroke-width="1.6"/>
  <path d="M12 3v18M3.5 12h17" stroke="#8a6238" stroke-width="1.4"/>
  <circle cx="16.5" cy="7.5" r="1.8" fill="#ffd36b"/>
  <path d="M5 17l3.5-3.5 3 3" fill="none" stroke="#6aae62" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

/** The pictures you've found behind the foggy window. */
export class PictureBook {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Picture book');
    this.pill.innerHTML = `${WINDOW_ICON}<span class="count"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Picture book</p>
        <button class="icon-btn album-close" aria-label="Close picture book">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    const found = Object.keys(store.data.pictures.found).length;
    (this.pill.querySelector('.count') as HTMLElement).textContent = `${found}/${SCENES.length}`;
    this.pill.classList.remove('bump');
    void this.pill.offsetWidth;
    this.pill.classList.add('bump');
    if (this.panel.classList.contains('open')) this.renderGrid();
  }

  destroy(): void {
    this.pill.remove();
    this.panel.remove();
  }

  private toggle(open = !this.panel.classList.contains('open')): void {
    this.audio.ui(open ? 'open' : 'close');
    if (open) this.renderGrid();
    this.panel.classList.toggle('open', open);
  }

  private renderGrid(): void {
    const grid = this.panel.querySelector('.album-grid') as HTMLElement;
    grid.replaceChildren();
    for (const scene of SCENES) {
      const count = store.data.pictures.found[scene.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card picture-card${count ? '' : ' unknown'}`;
      if (count) card.appendChild(sceneThumbnail(scene, 60, 80));
      else {
        const fogged = document.createElement('span');
        fogged.className = 'fogged-thumb';
        card.appendChild(fogged);
      }
      const label = document.createElement('span');
      label.textContent = count ? scene.name.replace(/^An? /, '').replace(/!$/, '') : '?';
      card.appendChild(label);
      grid.appendChild(card);
    }
  }
}
