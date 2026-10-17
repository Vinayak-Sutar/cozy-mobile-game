import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { koiThumbnail, VARIETIES } from '../toys/koi/koi';
import { icons } from './icons';

const KOI_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 14c3-6 10-8 15-5l2-2.5-.5 4 .5 4-2-2.5c-5 3-12 2-15 2z" fill="#fdf7ef" stroke="#8a6a5a" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="9" cy="12" r="2.2" fill="#e5462c"/><circle cx="13.5" cy="11" r="1.6" fill="#e5462c"/>
  <circle cx="6.3" cy="12.4" r=".8" fill="#26262f"/>
</svg>`;

/** The koi varieties you've raised. */
export class KoiBook {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Koi book');
    this.pill.innerHTML = `${KOI_ICON}<span class="count"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Koi book</p>
        <button class="icon-btn album-close" aria-label="Close koi book">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    const raised = Object.keys(store.data.koi.raised).length;
    (this.pill.querySelector('.count') as HTMLElement).textContent = `${raised}/${VARIETIES.length}`;
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
    VARIETIES.forEach((variety, i) => {
      const count = store.data.koi.raised[variety.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card${count ? '' : ' unknown'}`;
      if (count) card.appendChild(koiThumbnail(variety, 64, i + 1));
      else {
        const empty = document.createElement('span');
        empty.className = 'fogged-thumb koi-unknown';
        card.appendChild(empty);
      }
      const label = document.createElement('span');
      label.textContent = count ? `${variety.name}${count > 1 ? ` ×${count}` : ''}` : '?';
      card.appendChild(label);
      grid.appendChild(card);
    });
  }
}
