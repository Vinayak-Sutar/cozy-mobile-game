import { store } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { PRIMARIES, recipeAbsorption, shade, WISHES, type PrimaryId } from '../toys/mixing';
import { toCss } from '../util/color';
import { brushIcons, icons } from './icons';

export type PainterTool = PrimaryId | 'sponge';

/** Three big paint jars and a sponge along the bottom. */
export class PaintPots {
  private readonly bar: HTMLElement;

  constructor(
    container: HTMLElement,
    private tool: PainterTool,
    onPick: (tool: PainterTool) => void,
    audio: AudioEngine,
    haptics: Haptics,
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'paint-pots';
    this.bar.setAttribute('role', 'radiogroup');
    this.bar.setAttribute('aria-label', 'Paints');
    this.bar.innerHTML = `
      ${PRIMARIES.map(
        (p) => `<button class="pot-btn" role="radio" data-tool="${p.id}" aria-label="${p.name} paint">
          <span class="jar"><span class="jar-paint" style="background:${p.hex}"></span></span>
        </button>`,
      ).join('')}
      <span class="bar-divider"></span>
      <button class="pot-btn sponge" role="radio" data-tool="sponge" aria-label="Sponge">${brushIcons.lift}</button>`;
    container.appendChild(this.bar);
    this.bar.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
      if (!button) return;
      this.tool = button.dataset.tool as PainterTool;
      audio.ui('select');
      haptics.tap(0.35);
      onPick(this.tool);
      this.render();
    });
    this.render();
  }

  destroy(): void {
    this.bar.remove();
  }

  private render(): void {
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-checked', String(b.dataset.tool === this.tool));
    }
  }
}

const PALETTE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.6 1.6-2.6H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z" fill="#fbeedd" stroke="#8a6238" stroke-width="1.3"/>
  <circle cx="7.5" cy="11" r="1.7" fill="#e2434f"/><circle cx="10" cy="7" r="1.7" fill="#f6cf3c"/>
  <circle cx="15" cy="7.5" r="1.7" fill="#3d7bd4"/><circle cx="8.5" cy="15.5" r="1.7" fill="#4f9d3a"/>
</svg>`;

/** The colours you've mixed for Pip: a counter that opens a page of swatches. */
export class ColorBook {
  private readonly pill: HTMLButtonElement;
  private readonly panel: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
  ) {
    this.pill = document.createElement('button');
    this.pill.className = 'garden-counter';
    this.pill.setAttribute('aria-label', 'Colour book');
    this.pill.innerHTML = `${PALETTE_ICON}<span class="count"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'album shelf';
    this.panel.innerHTML = `
      <div class="album-head">
        <p class="shelf-title">Colour book</p>
        <button class="icon-btn album-close" aria-label="Close colour book">${icons.close}</button>
      </div>
      <div class="album-grid"></div>`;
    container.append(this.pill, this.panel);
    this.pill.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.album-close')?.addEventListener('click', () => this.toggle(false));
    this.refresh();
  }

  refresh(): void {
    (this.pill.querySelector('.count') as HTMLElement).textContent = String(store.data.painter.granted);
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
    for (const wish of WISHES) {
      const count = store.data.painter.made[wish.id] ?? 0;
      const card = document.createElement('div');
      card.className = `album-card${count ? '' : ' unknown'}`;
      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.background = count ? toCss(shade(recipeAbsorption(wish.recipe))) : 'transparent';
      const label = document.createElement('span');
      label.textContent = count ? `${wish.name} x${count}` : '?';
      card.append(swatch, label);
      grid.appendChild(card);
    }
  }
}
