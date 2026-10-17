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

const GARDEN_ART = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M45 34 C 43 46, 47 54, 44 64" stroke="#4f9bf0" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.85"/>
  <g fill="#ffffff">
    <circle cx="36" cy="28" r="9"/><circle cx="47" cy="22" r="11"/><circle cx="58" cy="27" r="9"/>
    <ellipse cx="47" cy="31" rx="19" ry="7"/>
  </g>
  <path d="M68 64 C 68 56, 70 50, 69 44" stroke="#4f8f4a" stroke-width="3" stroke-linecap="round" fill="none"/>
  <ellipse cx="64" cy="54" rx="5" ry="2.5" fill="#5ea85a" transform="rotate(-30 64 54)"/>
  <g fill="#f7a8c4" transform="translate(69 42)">${petals(6, -4.5, 2.6, 4.5, 0)}</g>
  <circle cx="69" cy="42" r="2.4" fill="#ffd36b"/>
</svg>`;

const PIP_ART = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <ellipse cx="63" cy="70" rx="24" ry="9" fill="#fbf7f0" stroke="#e3d7c6" stroke-width="3"/>
  <ellipse cx="63" cy="70" rx="17" ry="5.5" fill="#6cc070"/>
  <path d="M35 30 q2 -7 1 -10" stroke="#5ea85a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="40" cy="20" rx="5" ry="2.4" fill="#7cc274" transform="rotate(-25 40 20)"/>
  <circle cx="35" cy="50" r="19" fill="#7fc8f8" stroke="rgba(70,50,40,0.25)" stroke-width="1.5"/>
  <circle cx="29" cy="48" r="2.6" fill="#3b3346"/><circle cx="41" cy="48" r="2.6" fill="#3b3346"/>
  <path d="M30 55 q5 5 10 0" stroke="#3b3346" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="24" cy="54" rx="3" ry="1.7" fill="rgba(255,140,160,0.6)"/><ellipse cx="46" cy="54" rx="3" ry="1.7" fill="rgba(255,140,160,0.6)"/>
</svg>`;

const WINDOW_ART = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="18" y="14" width="64" height="72" rx="6" fill="#dfe8f1" stroke="#c9a27a" stroke-width="6"/>
  <clipPath id="wipe"><circle cx="46" cy="52" r="20"/></clipPath>
  <g clip-path="url(#wipe)">
    <rect x="18" y="14" width="64" height="72" fill="#a9d8f5"/>
    <rect x="18" y="58" width="64" height="30" fill="#8fcf7e"/>
    <circle cx="46" cy="56" r="10" fill="#f0a253"/>
    <path d="M38 49 l3 -8 l4 6 z M54 49 l-3 -8 l-4 6 z" fill="#f0a253"/>
    <path d="M42 56 q2 2 4 0 M48 56 q2 2 4 0" stroke="#4a3328" stroke-width="1.4" fill="none"/>
  </g>
  <circle cx="46" cy="52" r="20" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
  <ellipse cx="68" cy="66" rx="2" ry="2.6" fill="#ffffff" opacity="0.9"/>
  <path d="M68 69 v12" stroke="#ffffff" stroke-width="2" opacity="0.6"/>
</svg>`;

/** Every new idea becomes its own section card here. */
const SECTIONS: Section[] = [
  { id: 'glow', name: 'Glow' },
  { id: 'paint', name: 'Paint' },
  { id: 'brush', name: 'Paint with Brush', art: brushIcons.soft },
  { id: 'pond', name: 'Pond', art: LILY_ART },
  { id: 'water', name: 'Water the Garden', art: GARDEN_ART },
  { id: 'painter', name: 'Little Painter', art: PIP_ART },
  { id: 'window', name: 'Hidden Picture', art: WINDOW_ART },
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
