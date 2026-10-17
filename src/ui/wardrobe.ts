import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import { drawPenguin, WARDROBE, type Wear } from '../toys/penguin/characters';
import { icons } from './icons';

const HAT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M5 16a7 7 0 0 1 14 0z" fill="#e5462c"/><rect x="4" y="15" width="16" height="3.4" rx="1.4" fill="#ffffff"/>
  <circle cx="12" cy="7.6" r="2" fill="#ffffff"/>
</svg>`;

function preview(item: Wear, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#e4eff7';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 10);
  ctx.fill();
  drawPenguin(ctx, size / 2, size * 0.94, size * 0.78, { facing: 1, phase: 0, walk: 0, wear: [item], happy: true });
  return canvas;
}

/** Pebble's hats and scarves: buy them with fish, or get them as thank-you gifts. */
export class Wardrobe {
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
    private readonly onChange: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.className = 'seed-bag wardrobe-btn';
    this.button.setAttribute('aria-label', 'Wardrobe');
    this.button.innerHTML = `<span class="bag-icon">${HAT_ICON}</span><span class="fish-badge"></span><span class="map-new" aria-hidden="true"></span>`;
    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Wardrobe</p>
        <button class="icon-btn album-close" aria-label="Close wardrobe">${icons.close}</button>
      </div>
      <p class="book-note"></p>
      <div class="album-grid wear-grid"></div>`;
    container.append(this.button, this.panel);
    this.button.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  /** Call when fish change or a gift arrives (`fresh` puts a dot on the button). */
  refresh(fresh = false): void {
    (this.button.querySelector('.fish-badge') as HTMLElement).textContent = `🐟 ${store.data.penguin.fish}`;
    if (fresh) this.button.classList.add('has-new');
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
    const save = store.data.penguin;
    (this.panel.querySelector('.book-note') as HTMLElement).textContent = `You have ${save.fish} fish. Tap to buy or wear.`;
    const grid = this.panel.querySelector('.wear-grid') as HTMLElement;
    grid.replaceChildren();
    for (const item of WARDROBE) {
      const owned = save.owned.includes(item.id);
      const wearing = save.hat === item.id || save.neck === item.id;
      const card = document.createElement('button');
      card.className = `album-card wear-card${wearing ? ' wearing' : ''}${!owned && item.price === 0 ? ' unknown' : ''}`;
      card.appendChild(preview(item.id, 64));
      const label = document.createElement('span');
      label.textContent = item.name;
      card.appendChild(label);
      const note = document.createElement('small');
      note.className = 'album-trait';
      note.textContent = wearing ? 'Wearing' : owned ? 'Tap to wear' : item.price ? `🐟 ${item.price}` : 'A thank-you gift';
      card.appendChild(note);
      card.addEventListener('click', () => this.choose(item.id, item.price, item.slot));
      grid.appendChild(card);
    }
  }

  private choose(id: Wear, price: number, slot: 'hat' | 'neck'): void {
    const save = store.data.penguin;
    if (!save.owned.includes(id)) {
      if (!price || save.fish < price) {
        this.audio.ui('tap');
        return;
      }
      save.fish -= price;
      save.owned.push(id);
    }
    // Tapping what you're wearing takes it off.
    if (save[slot] === id) save[slot] = null;
    else save[slot] = id;
    store.save();
    this.audio.ui('select');
    this.onChange();
    this.refresh();
  }
}
