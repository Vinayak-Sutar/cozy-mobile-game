import type { BrushId, BrushSettings, Wetness } from '../app/storage';
import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { BRUSHES, COLORS, WETNESS, colorById, wetnessById } from '../toys/brushes';
import { brushIcons, icons } from './icons';

export interface ToolbarActions {
  pickBrush(id: BrushId): void;
  pickSize(index: number): void;
  pickColor(id: string): void;
  pickWetness(id: Wetness): void;
  undo(): void;
}

type ShelfId = 'brush' | 'color' | 'wet';

const SIZE_DOTS = [10, 16, 23];

const wetLevel = (level: number): string =>
  `<span class="wet-level">${[1, 2, 3].map((i) => `<i class="${i <= level ? 'on' : ''}" style="height:${6 + i * 5}px"></i>`).join('')}</span>`;

/**
 * The brush toolbar: one slim bar that's always there (brush, size, colour,
 * wetness, undo), with picture shelves that pop up above it. Modelled on
 * Infinite Painter's main toolbar plus kids' apps' big picture buttons.
 */
export class BrushToolbar {
  private readonly bar: HTMLElement;
  private readonly shelves: Record<ShelfId, HTMLElement>;
  private open: ShelfId | null = null;

  constructor(
    private readonly container: HTMLElement,
    private state: BrushSettings,
    private readonly actions: ToolbarActions,
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'brush-bar';
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Brush tools');
    this.bar.innerHTML = `
      <button class="tool-btn" data-shelf="brush" aria-label="Choose brush" aria-expanded="false"></button>
      <span class="size-dots" role="radiogroup" aria-label="Brush size">
        ${SIZE_DOTS.map(
          (d, i) =>
            `<button role="radio" data-size="${i}" aria-label="${['Small', 'Medium', 'Large'][i]}"><span style="width:${d}px;height:${d}px"></span></button>`,
        ).join('')}
      </span>
      <button class="tool-btn" data-shelf="color" aria-label="Choose colour" aria-expanded="false"><span class="swatch-dot"></span></button>
      <button class="tool-btn" data-shelf="wet" aria-label="How wet the paper is" aria-expanded="false"></button>
      <span class="bar-divider"></span>
      <button class="tool-btn" data-action="undo" aria-label="Undo">${icons.undo}</button>`;

    this.shelves = {
      brush: this.shelf(
        'Brushes',
        `<div class="brush-grid" role="radiogroup">${BRUSHES.map(
          (b) => `<button class="brush-option" role="radio" data-brush="${b.id}">${brushIcons[b.id]}<span>${b.name}</span></button>`,
        ).join('')}</div>`,
      ),
      color: this.shelf(
        'Colours',
        `<div class="swatch-grid" role="radiogroup">${COLORS.map(
          (c) => `<button class="swatch" role="radio" data-color="${c.id}" aria-label="${c.name}" style="background:${c.hex}"></button>`,
        ).join('')}</div>`,
      ),
      wet: this.shelf(
        'How wet is the paper?',
        `<div class="wet-options" role="radiogroup">${WETNESS.map(
          (w) => `<button role="radio" data-wet="${w.id}">${wetLevel(w.level)}<span>${w.name}</span></button>`,
        ).join('')}</div>`,
      ),
    };
    container.append(this.shelves.brush, this.shelves.color, this.shelves.wet, this.bar);

    this.bar.addEventListener('click', this.onBarClick);
    for (const shelf of Object.values(this.shelves)) shelf.addEventListener('click', this.onShelfClick);
    this.render();
  }

  update(state: BrushSettings): void {
    this.state = state;
    this.render();
  }

  setCanUndo(can: boolean): void {
    const undo = this.bar.querySelector('[data-action="undo"]') as HTMLButtonElement;
    undo.style.opacity = can ? '1' : '0.35';
  }

  closeShelves(): void {
    if (!this.open) return;
    this.open = null;
    this.render();
  }

  destroy(): void {
    this.bar.remove();
    for (const shelf of Object.values(this.shelves)) shelf.remove();
  }

  private shelf(title: string, body: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'shelf';
    el.innerHTML = `<p class="shelf-title">${title}</p>${body}`;
    return el;
  }

  private readonly onBarClick = (e: Event): void => {
    const target = (e.target as HTMLElement).closest('button');
    if (!target) return;
    const shelf = target.dataset.shelf as ShelfId | undefined;
    if (shelf) {
      this.open = this.open === shelf ? null : shelf;
      this.audio.ui(this.open ? 'open' : 'close');
      this.render();
      return;
    }
    if (target.dataset.size) {
      this.feedback();
      this.actions.pickSize(Number(target.dataset.size));
      return;
    }
    if (target.dataset.action === 'undo') {
      this.audio.ui('close');
      this.haptics.tap(0.4);
      this.actions.undo();
    }
  };

  private readonly onShelfClick = (e: Event): void => {
    const target = (e.target as HTMLElement).closest('button');
    if (!target) return;
    if (target.dataset.brush) this.actions.pickBrush(target.dataset.brush as BrushId);
    else if (target.dataset.color) this.actions.pickColor(target.dataset.color);
    else if (target.dataset.wet) this.actions.pickWetness(target.dataset.wet as Wetness);
    else return;
    this.feedback();
    this.open = null;
    this.render();
  };

  private feedback(): void {
    this.audio.ui('select');
    this.haptics.tap(0.35);
  }

  private render(): void {
    const { state } = this;
    const brushButton = this.bar.querySelector('[data-shelf="brush"]') as HTMLElement;
    brushButton.innerHTML = brushIcons[state.brush];
    const dot = this.bar.querySelector('.swatch-dot') as HTMLElement;
    dot.style.background = colorById(state.color).hex;
    const wetButton = this.bar.querySelector('[data-shelf="wet"]') as HTMLElement;
    wetButton.innerHTML = wetLevel(wetnessById(state.wetness).level);

    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-size]')) {
      b.setAttribute('aria-checked', String(Number(b.dataset.size) === state.size));
    }
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-shelf]')) {
      b.setAttribute('aria-expanded', String(b.dataset.shelf === this.open));
    }
    for (const [id, shelf] of Object.entries(this.shelves)) shelf.classList.toggle('open', id === this.open);
    for (const b of this.container.querySelectorAll<HTMLElement>('[data-brush]')) {
      b.setAttribute('aria-checked', String(b.dataset.brush === state.brush));
    }
    for (const b of this.container.querySelectorAll<HTMLElement>('[data-color]')) {
      b.setAttribute('aria-checked', String(b.dataset.color === state.color));
    }
    for (const b of this.container.querySelectorAll<HTMLElement>('[data-wet]')) {
      b.setAttribute('aria-checked', String(b.dataset.wet === state.wetness));
    }
  }
}
