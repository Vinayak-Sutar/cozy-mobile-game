import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { CHICKS, type Chick, drawChick } from '../toys/penguin/characters';
import { PEBBLES } from '../toys/penguin/island';
import { icons } from './icons';

const CHICK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="13" r="8" fill="#9aa0ad"/><ellipse cx="13" cy="12.5" rx="5" ry="4.6" fill="#eef0f4"/>
  <circle cx="11" cy="11.5" r="1" fill="#26262f"/><circle cx="15" cy="11.5" r="1" fill="#26262f"/>
  <path d="M12.5 13.5l3 .5-3 .8z" fill="#f39a3c"/>
</svg>`;

function portrait(chick: Chick, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#dcebf5';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 10);
  ctx.fill();
  drawChick(ctx, chick, size / 2, size * 0.86, size * 0.72, { happy: true });
  return canvas;
}

/** The chicks you've found, who's home, and the shiny pebbles. */
export class ChickBook {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Chick book');
    this.pill.innerHTML = `${CHICK_ICON}<span class="count"></span>`;
    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Chick book</p>
        <button class="icon-btn album-close" aria-label="Close chick book">${icons.close}</button>
      </div>
      <p class="book-note"></p>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    const save = store.data.penguin;
    const home = CHICKS.length - Object.keys(save.lost).length;
    (this.pill.querySelector('.count') as HTMLElement).textContent = `${home}/${CHICKS.length}`;
    this.pill.classList.remove('bump');
    void this.pill.offsetWidth;
    this.pill.classList.add('bump');
    if (this.panel.classList.contains('open')) this.render();
  }

  destroy(): void {
    this.pill.remove();
    this.panel.remove();
  }

  private toggle(open = !this.panel.classList.contains('open')): void {
    this.audio.ui(open ? 'open' : 'close');
    if (open) this.render();
    this.panel.classList.toggle('open', open);
  }

  private render(): void {
    const save = store.data.penguin;
    const home = CHICKS.length - Object.keys(save.lost).length;
    (this.panel.querySelector('.book-note') as HTMLElement).textContent =
      `Home safe: ${home} of ${CHICKS.length} · Shiny pebbles: ${save.pebbles.length} of ${PEBBLES.length}`;
    const grid = this.panel.querySelector('.album-grid') as HTMLElement;
    grid.replaceChildren();
    for (const chick of CHICKS) {
      const found = save.found.includes(chick.id);
      const card = document.createElement('div');
      card.className = `album-card${found ? '' : ' unknown'}`;
      if (found) card.appendChild(portrait(chick, 64));
      else {
        const empty = document.createElement('span');
        empty.className = 'fogged-thumb chick-unknown';
        card.appendChild(empty);
      }
      const label = document.createElement('span');
      label.textContent = found ? chick.name : '?';
      card.appendChild(label);
      if (found) {
        const line = document.createElement('small');
        line.className = 'album-trait';
        line.textContent = save.lost[chick.id] !== undefined ? 'Out playing' : chick.line;
        card.appendChild(line);
      }
      grid.appendChild(card);
    }
  }
}
