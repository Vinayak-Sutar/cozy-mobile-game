import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { isUnlocked, MAPS, type MapId, UNLOCK_TRIPS } from '../toys/boats/maps';
import { mapThumbnail } from '../toys/boats/scenery';
import { icons } from './icons';

const MAP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3 6.5l5.5-2.5 7 2.5 5.5-2.5v13.5l-5.5 2.5-7-2.5-5.5 2.5z" fill="#f4ecd8" stroke="#8a7a6a" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M8.5 4v13.5M15.5 6.5v13.5" stroke="#8a7a6a" stroke-width="1.1"/>
  <path d="M5 13c2-1 3 1 5 0s2.5-3 5-2 3 0 4-1" fill="none" stroke="#5aa9b8" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="17.5" cy="9" r="1.4" fill="#e8534a"/>
</svg>`;

const LOCK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;

/** The map button and the list of places you can sail. */
export class BoatPlaces {
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private current: MapId = 'pond';

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
    private readonly onPick: (id: MapId) => void,
  ) {
    this.button = document.createElement('button');
    this.button.className = 'seed-bag map-btn';
    this.button.setAttribute('aria-label', 'Places');
    this.button.innerHTML = `<span class="bag-icon">${MAP_ICON}</span><span class="map-new" aria-hidden="true"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf places';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Places to sail</p>
        <button class="icon-btn album-close" aria-label="Close places">${icons.close}</button>
      </div>
      <div class="place-list"></div>`;
    container.append(this.button, this.panel);
    this.button.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
  }

  /** Call when the map changes or a trip is made; `fresh` marks a map that just opened. */
  refresh(current: MapId, fresh = false): void {
    this.current = current;
    if (fresh) {
      this.button.classList.add('has-new');
      this.button.classList.remove('bump');
      void this.button.offsetWidth;
      this.button.classList.add('bump');
    }
    if (this.panel.classList.contains('open')) this.render();
  }

  destroy(): void {
    this.button.remove();
    this.panel.remove();
  }

  private toggle(open = !this.panel.classList.contains('open')): void {
    this.audio.ui(open ? 'open' : 'close');
    if (open) {
      this.render();
      this.button.classList.remove('has-new');
    }
    this.panel.classList.toggle('open', open);
  }

  private render(): void {
    const list = this.panel.querySelector('.place-list') as HTMLElement;
    list.replaceChildren();
    const trips = store.data.boats.trips;
    MAPS.forEach((map, i) => {
      const open = isUnlocked(map.id, trips);
      const card = document.createElement('button');
      card.className = `place-card${open ? '' : ' locked'}${map.id === this.current ? ' current' : ''}`;
      card.appendChild(mapThumbnail(map, 76, 76));
      const text = document.createElement('span');
      text.className = 'place-text';
      const name = document.createElement('strong');
      name.textContent = map.name;
      const line = document.createElement('span');
      if (open) {
        line.textContent = map.tagline;
      } else {
        const before = MAPS[i - 1];
        const done = Math.min(UNLOCK_TRIPS, trips[before.id] ?? 0);
        line.innerHTML = `<i class="lock">${LOCK_ICON}</i> Carry ${UNLOCK_TRIPS} friends at ${before.name} <b class="dots">${'●'.repeat(done)}${'○'.repeat(UNLOCK_TRIPS - done)}</b>`;
      }
      text.append(name, line);
      card.appendChild(text);
      card.disabled = !open;
      card.addEventListener('click', () => {
        if (!open) return;
        this.audio.ui('select');
        this.panel.classList.remove('open');
        if (map.id !== this.current) this.onPick(map.id);
      });
      list.appendChild(card);
    });
  }
}
