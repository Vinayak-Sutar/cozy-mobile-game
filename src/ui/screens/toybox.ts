import { store, type ToyId } from '../../app/storage';
import type { AudioEngine } from '../../feel/audio';
import { brushIcons, icons } from '../icons';

interface Section {
  id: ToyId;
  name: string;
  art?: string;
}

const petals = (n: number, cy: number, rx: number, ry: number, offset: number): string =>
  Array.from(
    { length: n },
    (_, i) => `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${offset + (i * 360) / n})"/>`,
  ).join('');

const LILY_ART = `
<svg viewBox="0 0 100 100" width="78%" height="78%" aria-hidden="true">
  <ellipse cx="53" cy="60" rx="27" ry="27" fill="rgba(0,8,14,0.35)"/>
  <g transform="translate(50 56)">
    <path d="M0 0 L25.2 -6.4 A26 26 0 1 0 25.2 6.4 Z" fill="#2f7a5f"/>
    <g fill="#f7a8c4">${petals(7, -9, 5, 9.5, 0)}</g>
    <g fill="#fff0f6">${petals(5, -5.5, 3.6, 6.5, 36)}</g>
    <circle r="3.4" fill="#ffe9a3"/>
  </g>
</svg>`;

/** Every new idea becomes its own section card here. */
const SECTIONS: Section[] = [
  { id: 'glow', name: 'Glow' },
  { id: 'paint', name: 'Paint' },
  { id: 'brush', name: 'Paint with Brush', art: brushIcons.soft },
  { id: 'pond', name: 'Pond', art: LILY_ART },
];

export interface ToyboxActions {
  back(): void;
  settings(): void;
  open(id: ToyId): void;
}

/** The toy box: a grid of section cards. */
export class ToyboxScreen {
  readonly el: HTMLElement;
  private readonly grid: HTMLElement;

  constructor(parent: HTMLElement, audio: AudioEngine, actions: ToyboxActions) {
    const el = document.createElement('section');
    el.className = 'screen toybox away';
    el.innerHTML = `
      <div class="top-bar">
        <button class="icon-btn clay" data-action="back" aria-label="Back to home">${icons.back}</button>
        <span class="spacer"></span>
        <h2 class="screen-title">Toy box</h2>
        <span class="spacer"></span>
        <button class="icon-btn clay" data-action="settings" aria-label="Settings">${icons.gear}</button>
      </div>
      <div class="toy-grid"></div>`;
    parent.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.toy-grid') as HTMLElement;

    for (const section of SECTIONS) {
      const card = document.createElement('button');
      card.className = 'toy-card clay';
      card.dataset.toy = section.id;
      card.setAttribute('aria-label', section.name);
      card.innerHTML = `
        <span class="toy-bubble ${section.id}"><span class="art">${section.art ?? ''}</span></span>
        <span class="toy-name">${section.name}</span>`;
      card.addEventListener('click', () => {
        audio.ui('select');
        actions.open(section.id);
      });
      this.grid.appendChild(card);
    }

    el.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      audio.ui('tap');
      actions.back();
    });
    el.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
      audio.ui('tap');
      actions.settings();
    });
  }

  /** Marks the last-played section so returning players find their place. */
  refresh(): void {
    for (const card of this.grid.querySelectorAll<HTMLElement>('.toy-card')) {
      card.querySelector('.badge')?.remove();
      if (card.dataset.toy === store.data.lastToy) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Last played';
        card.appendChild(badge);
      }
    }
  }
}
