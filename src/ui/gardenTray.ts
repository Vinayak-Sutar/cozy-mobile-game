import type { AudioEngine } from '../feel/audio';
import type { Haptics } from '../feel/haptics';
import { POTS, SPECIES, thumbnail } from '../toys/flowers';
import { icons } from './icons';

export interface TrayItem {
  kind: 'flower' | 'pot';
  id: string;
}

export interface TrayActions {
  /** Which planting spot is under this screen point, if any. */
  slotAt(clientX: number, clientY: number): number | null;
  /** Put the item in the spot. Returns false if it doesn't fit there. */
  place(slot: number, item: TrayItem): boolean;
  /** Highlight the spot an item is being dragged over (null = none). */
  hover(slot: number | null): void;
}

const BAG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M6 8h12l-1.2 12.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8z" fill="#e8c28a" stroke="#8a6238" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M8 8c0-2.4 1.8-4.5 4-4.5s4 2.1 4 4.5" fill="none" stroke="#8a6238" stroke-width="1.4"/>
  <circle cx="12" cy="13.5" r="2.2" fill="#f7a8c4"/><circle cx="12" cy="13.5" r="0.9" fill="#ffd36b"/>
  <path d="M12 15.7v2.6" stroke="#5ea85a" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

/**
 * The plant tray for Water the Garden: a seed bag button that opens a tray of
 * seed packets and pots. Drag one onto the garden bed, or tap it and then tap
 * a spot (easier for small hands).
 */
export class GardenTray {
  /** Item picked by tapping, waiting for a tap on a spot. */
  selected: TrayItem | null = null;
  private readonly bag: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly ghost: HTMLElement;
  private tab: 'flower' | 'pot' = 'flower';
  private drag: { item: TrayItem; startX: number; startY: number; active: boolean; source: HTMLElement } | null = null;

  constructor(
    container: HTMLElement,
    private readonly actions: TrayActions,
    private readonly audio: AudioEngine,
    private readonly haptics: Haptics,
  ) {
    this.bag = document.createElement('button');
    this.bag.className = 'seed-bag';
    this.bag.setAttribute('aria-label', 'Seeds and pots');
    this.bag.innerHTML = `<span class="bag-icon">${BAG_ICON}</span><span class="bag-picked"></span>`;

    this.panel = document.createElement('div');
    this.panel.className = 'shelf plant-tray';
    this.panel.innerHTML = `
      <div class="tray-head">
        <div class="segmented tray-tabs" role="tablist">
          <button role="tab" data-tab="flower">Seeds</button>
          <button role="tab" data-tab="pot">Pots</button>
        </div>
        <button class="icon-btn tray-close" aria-label="Close tray">${icons.close}</button>
      </div>
      <div class="tray-grid"></div>`;

    this.ghost = document.createElement('div');
    this.ghost.className = 'drag-ghost';

    container.append(this.panel, this.bag, this.ghost);
    this.bag.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.tray-close')?.addEventListener('click', () => this.toggle(false));
    for (const tab of this.panel.querySelectorAll<HTMLElement>('[data-tab]')) {
      tab.addEventListener('click', () => {
        this.tab = tab.dataset.tab as 'flower' | 'pot';
        this.audio.ui('tap');
        this.renderGrid();
      });
    }
    this.renderGrid();
  }

  get isOpen(): boolean {
    return this.panel.classList.contains('open');
  }

  toggle(open = !this.isOpen): void {
    if (open === this.isOpen) return;
    this.audio.ui(open ? 'open' : 'close');
    this.panel.classList.toggle('open', open);
    this.bag.classList.toggle('active', open);
  }

  /** Used after a tap-to-place: the picked item has been planted. */
  clearSelection(): void {
    this.selected = null;
    this.renderSelection();
  }

  destroy(): void {
    this.panel.remove();
    this.bag.remove();
    this.ghost.remove();
  }

  private renderGrid(): void {
    for (const tab of this.panel.querySelectorAll<HTMLElement>('[data-tab]')) {
      tab.setAttribute('aria-checked', String(tab.dataset.tab === this.tab));
    }
    const grid = this.panel.querySelector('.tray-grid') as HTMLElement;
    grid.replaceChildren();
    const items: { item: TrayItem; name: string }[] =
      this.tab === 'flower'
        ? SPECIES.map((s) => ({ item: { kind: 'flower', id: s.id }, name: s.name }))
        : [...POTS.map((p) => ({ item: { kind: 'pot' as const, id: p.id }, name: p.name })), { item: { kind: 'pot', id: 'none' }, name: 'No pot' }];

    for (const { item, name } of items) {
      const button = document.createElement('button');
      button.className = 'tray-item';
      button.setAttribute('aria-label', name);
      button.dataset.kind = item.kind;
      button.dataset.id = item.id;
      const picture = item.id === 'none' ? noPotPicture() : thumbnail(item.kind, item.id, 52);
      const label = document.createElement('span');
      label.textContent = name;
      button.append(picture, label);
      button.addEventListener('pointerdown', (e) => this.startDrag(e, item, button));
      grid.appendChild(button);
    }
    this.renderSelection();
  }

  private renderSelection(): void {
    for (const b of this.panel.querySelectorAll<HTMLElement>('.tray-item')) {
      b.classList.toggle('picked', !!this.selected && b.dataset.kind === this.selected.kind && b.dataset.id === this.selected.id);
    }
    const picked = this.bag.querySelector('.bag-picked') as HTMLElement;
    picked.replaceChildren();
    this.bag.classList.toggle('has-pick', !!this.selected);
    if (this.selected) {
      picked.append(this.selected.id === 'none' ? noPotPicture() : thumbnail(this.selected.kind, this.selected.id, 30));
    }
  }

  private startDrag(e: PointerEvent, item: TrayItem, source: HTMLElement): void {
    e.preventDefault();
    try {
      source.setPointerCapture(e.pointerId);
    } catch {
      // Dragging still works without capture.
    }
    this.drag = { item, startX: e.clientX, startY: e.clientY, active: false, source };
    source.addEventListener('pointermove', this.onDragMove);
    source.addEventListener('pointerup', this.onDragEnd);
    source.addEventListener('pointercancel', this.onDragEnd);
  }

  private readonly onDragMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10) {
      drag.active = true;
      this.ghost.replaceChildren(drag.item.id === 'none' ? noPotPicture() : thumbnail(drag.item.kind, drag.item.id, 64));
      this.ghost.classList.add('show');
      // Slide the tray out of the way so the whole garden bed is visible while dragging.
      this.panel.classList.add('dragging');
      this.haptics.tap(0.3);
    }
    if (!drag.active) return;
    this.ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 56}px)`;
    this.actions.hover(this.actions.slotAt(e.clientX, e.clientY));
  };

  private readonly onDragEnd = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    drag.source.removeEventListener('pointermove', this.onDragMove);
    drag.source.removeEventListener('pointerup', this.onDragEnd);
    drag.source.removeEventListener('pointercancel', this.onDragEnd);
    this.drag = null;
    this.ghost.classList.remove('show');
    this.panel.classList.remove('dragging');
    this.actions.hover(null);

    if (drag.active) {
      const slot = e.type === 'pointerup' ? this.actions.slotAt(e.clientX, e.clientY) : null;
      if (slot !== null) this.actions.place(slot, drag.item);
      return;
    }
    // A tap: pick it, close the tray so the bed is visible, then tap a spot.
    if (e.type !== 'pointerup') return;
    const same = this.selected && this.selected.kind === drag.item.kind && this.selected.id === drag.item.id;
    this.selected = same ? null : drag.item;
    this.audio.ui('select');
    this.haptics.tap(0.3);
    this.renderSelection();
    if (this.selected) this.toggle(false);
  };
}

function noPotPicture(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'no-pot';
  el.innerHTML = icons.close;
  return el;
}
