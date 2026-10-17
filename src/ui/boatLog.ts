import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { PERSONALITIES } from '../toys/boats/dialogue';
import { PASSENGERS, passengerThumbnail } from '../toys/boats/passengers';
import { icons } from './icons';

const BOAT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M11 4.5l-4.5 9h9z" fill="#f4efe6" stroke="#8a7a6a" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M2.5 13.5h19l-3.5 5.5h-12z" fill="#ffffff" stroke="#8a7a6a" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M3 21c2 -1 4 1 6 0s4 -1 6 0 4 1 6 0" fill="none" stroke="#5aa9b8" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

/** Everyone you've carried across the pond. */
export class BoatLog {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Boat log');
    this.pill.innerHTML = `${BOAT_ICON}<span class="count"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Boat log</p>
        <button class="icon-btn album-close" aria-label="Close boat log">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    const carried = Object.keys(store.data.boats.carried).length;
    (this.pill.querySelector('.count') as HTMLElement).textContent = `${carried}/${PASSENGERS.length}`;
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
    for (const p of PASSENGERS) {
      const trips = store.data.boats.carried[p.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card${trips ? '' : ' unknown'}`;
      if (trips) card.appendChild(passengerThumbnail(p, 64));
      else {
        const empty = document.createElement('span');
        empty.className = 'fogged-thumb boat-unknown';
        card.appendChild(empty);
      }
      // Friends you've carried show their name and what they're like.
      const who = PERSONALITIES[p.id];
      const label = document.createElement('span');
      label.textContent = trips ? `${who?.name ?? p.name}${trips > 1 ? ` ×${trips}` : ''}` : '?';
      card.appendChild(label);
      if (trips && who) {
        const trait = document.createElement('small');
        trait.className = 'album-trait';
        trait.textContent = who.trait;
        card.appendChild(trait);
      }
      grid.appendChild(card);
    }
  }
}
