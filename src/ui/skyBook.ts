import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { CONSTELLATIONS, constellationThumbnail } from '../toys/constellations';
import { icons } from './icons';

const STAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.8l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="#ffd56a" stroke="#c9922e" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

/** The constellations you've lit, as little star maps. */
export class SkyBook {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Sky book');
    this.pill.innerHTML = `${STAR_ICON}<span class="count"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Sky book</p>
        <button class="icon-btn album-close" aria-label="Close sky book">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    const found = Object.keys(store.data.lanterns.found).length;
    (this.pill.querySelector('.count') as HTMLElement).textContent = `${found}/${CONSTELLATIONS.length}`;
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
    for (const c of CONSTELLATIONS) {
      const count = store.data.lanterns.found[c.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card${count ? '' : ' unknown'}`;
      if (count) card.appendChild(constellationThumbnail(c, 64));
      else {
        const empty = document.createElement('span');
        empty.className = 'fogged-thumb sky-unknown';
        card.appendChild(empty);
      }
      const label = document.createElement('span');
      label.textContent = count ? c.name.replace(/^An? /, '').replace(/!$/, '') : '?';
      card.appendChild(label);
      grid.appendChild(card);
    }
  }
}
