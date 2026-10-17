import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { drawFlower, SPECIES, type Species } from '../toys/flowers';
import { icons } from './icons';

const FLOWER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <g fill="#f7a8c4">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="12" cy="7" rx="3.2" ry="4.4" transform="rotate(${r} 12 11)"/>`).join('')}</g>
  <circle cx="12" cy="11" r="2.6" fill="#ffd36b"/>
  <path d="M12 14v8" stroke="#5ea85a" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * The flower album for Water the Garden: a counter in the corner (it bounces
 * when a flower blooms) that opens a page of every species, with the ones you
 * haven't grown yet shown as silhouettes.
 */
export class Herbarium {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Flower album');
    this.pill.innerHTML = `${FLOWER_ICON}<span class="count"></span>`;

    this.toast = document.createElement('div');
    this.toast.className = 'garden-toast';

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Flower album</p>
        <button class="icon-btn album-close" aria-label="Close album">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;

    container.append(this.pill, this.toast, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh(null);
  }

  /** Updates the count; pass the species when it's a brand-new discovery. */
  refresh(discovered: Species | null): void {
    const total = Object.values(store.data.garden.flowers).reduce((a, b) => a + b, 0);
    (this.pill.querySelector('.count') as HTMLElement).textContent = String(total);
    this.pill.classList.remove('bump');
    void this.pill.offsetWidth;
    this.pill.classList.add('bump');
    if (discovered) {
      this.toast.textContent = `New flower: ${discovered.name}`;
      this.toast.classList.add('show');
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2600);
    }
    if (this.panel.classList.contains('open')) this.renderGrid();
  }

  destroy(): void {
    window.clearTimeout(this.toastTimer);
    this.pill.remove();
    this.toast.remove();
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
    const owned = store.data.garden.flowers;
    for (const species of SPECIES) {
      const count = owned[species.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card${count ? '' : ' unknown'}`;
      const canvas = document.createElement('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = 64 * dpr;
      canvas.height = 72 * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.translate(32, 68);
        // Undiscovered flowers are drawn as a soft grey silhouette.
        const look = count ? species : { ...species, petal: '#c9c2d6', heart: '#b3abc2' };
        drawFlower(ctx, look, 44, 15, 1, 1, 0);
      }
      const label = document.createElement('span');
      label.textContent = count ? `${species.name} x${count}` : '?';
      card.append(canvas, label);
      grid.appendChild(card);
    }
  }
}
