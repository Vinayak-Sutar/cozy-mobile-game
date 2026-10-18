import { newId } from './doc/document';
import { deletePainting, duplicatePainting, getPainting, listPaintings, listVersions, type PaintingMeta, renamePainting, restoreVersion } from './doc/library';
import { icons } from './ui/icons';
import { NewPainting, type NewPaintingSpec } from './ui/newPainting';
import { Sheet } from './ui/sheet';

export interface GalleryActions {
  open(id: string): void;
  create(spec: NewPaintingSpec, name: string): void;
  glow(): void;
}

/** The studio's home: your paintings, newest first, and the button to start a new one. */
export class Gallery {
  readonly el: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly sheet: Sheet;
  private readonly toastEl: HTMLElement;
  private urls: string[] = [];
  private paintings: PaintingMeta[] = [];
  private toastTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly actions: GalleryActions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'st-gallery';
    const head = document.createElement('div');
    head.className = 'st-gallery-head';
    const back = document.createElement('a');
    back.className = 'st-chip-btn';
    back.href = '../';
    back.textContent = '← Drift';
    back.style.textDecoration = 'none';
    const title = document.createElement('h1');
    title.textContent = 'Drift Studio';
    head.append(title, back);

    const modes = document.createElement('div');
    modes.className = 'st-modes';
    const paint = document.createElement('button');
    paint.className = 'st-mode active';
    paint.innerHTML = '<strong>Paint</strong><span>Brushes, layers and colour</span>';
    paint.addEventListener('click', () => this.newPainting());
    const glow = document.createElement('button');
    glow.className = 'st-mode';
    glow.innerHTML = '<strong>Glow</strong><span>Painting with light</span>';
    glow.addEventListener('click', () => this.actions.glow());
    modes.append(paint, glow);

    this.grid = document.createElement('div');
    this.grid.className = 'st-grid';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-toast';
    this.el.append(head, modes, this.grid, this.toastEl);
    parent.appendChild(this.el);
    this.sheet = new Sheet(parent);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.paintings = await listPaintings();
    } catch {
      this.paintings = [];
      this.toast('Saving is blocked in this browser, so paintings will not be kept', 3500);
    }
    this.render();
  }

  private render(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    const cards: HTMLElement[] = [];
    const add = document.createElement('button');
    add.className = 'st-card new';
    add.innerHTML = `<div class="st-thumb">${icons.plus}</div><span class="st-card-name">New painting</span><span class="st-card-date">Pick a size and paper</span>`;
    add.addEventListener('click', () => this.newPainting());
    cards.push(add);
    for (const meta of this.paintings) cards.push(this.card(meta));
    this.grid.replaceChildren(...cards);
    if (!this.paintings.length) {
      const empty = document.createElement('p');
      empty.className = 'st-empty';
      empty.style.gridColumn = '1 / -1';
      empty.textContent = 'Your paintings will live here. They save themselves as you paint.';
      this.grid.appendChild(empty);
    }
  }

  private card(meta: PaintingMeta): HTMLElement {
    const card = document.createElement('div');
    card.className = 'st-card';
    const thumb = document.createElement('button');
    thumb.className = 'st-thumb';
    thumb.setAttribute('aria-label', `Open ${meta.name}`);
    if (meta.thumb) {
      const url = URL.createObjectURL(meta.thumb);
      this.urls.push(url);
      thumb.style.backgroundImage = `url("${url}")`;
    }
    thumb.addEventListener('click', () => this.actions.open(meta.id));
    const name = document.createElement('span');
    name.className = 'st-card-name';
    name.textContent = meta.name;
    const date = document.createElement('span');
    date.className = 'st-card-date';
    date.textContent = `${when(meta.updated)} · ${meta.width}×${meta.height}`;
    const more = document.createElement('button');
    more.className = 'st-card-more';
    more.setAttribute('aria-label', 'Painting options');
    more.innerHTML = icons.more;
    more.addEventListener('click', () => this.openMenu(meta));
    card.append(thumb, name, date, more);
    return card;
  }

  private newPainting(): void {
    const panel = new NewPainting((spec) => {
      this.sheet.close();
      void navigator.storage?.persist?.().catch(() => false);
      this.actions.create(spec, `Painting ${this.paintings.length + 1}`);
    });
    this.sheet.open('new', 'New painting', panel.el);
  }

  private openMenu(meta: PaintingMeta): void {
    const wrap = document.createElement('div');
    wrap.className = 'st-actions';
    wrap.style.flexDirection = 'column';
    const item = (label: string, run: () => void, className = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `st-chip-btn ${className}`;
      b.style.textAlign = 'left';
      b.textContent = label;
      b.addEventListener('click', run);
      return b;
    };
    let armed = false;
    const remove = item(
      'Delete',
      async () => {
        if (!armed) {
          armed = true;
          remove.textContent = 'Tap again to delete for good';
          return;
        }
        this.sheet.close();
        await deletePainting(meta.id);
        this.toast('Painting deleted');
        await this.refresh();
      },
      'danger',
    );
    wrap.append(
      item('Open', () => {
        this.sheet.close();
        this.actions.open(meta.id);
      }),
      item('Rename', async () => {
        const name = window.prompt('Painting name', meta.name);
        if (!name?.trim()) return;
        this.sheet.close();
        await renamePainting(meta.id, name.trim().slice(0, 60));
        await this.refresh();
      }),
      item('Duplicate', async () => {
        this.sheet.close();
        await duplicatePainting(meta.id, newId(), `${meta.name} copy`);
        this.toast('Copy made');
        await this.refresh();
      }),
      item('Earlier versions', () => void this.openVersions(meta)),
      remove,
    );
    this.sheet.open(`menu-${meta.id}`, meta.name, wrap);
  }

  private async openVersions(meta: PaintingMeta): Promise<void> {
    const versions = await listVersions(meta.id);
    const wrap = document.createElement('div');
    const note = document.createElement('p');
    note.className = 'st-note';
    note.textContent = versions.length
      ? 'A version is kept each time you come back to this painting, and every 10 minutes while you paint. Restoring keeps the current painting as a version too.'
      : 'No earlier versions yet. One is kept each time you come back to this painting and paint, and every 10 minutes while you paint.';
    wrap.appendChild(note);
    const list = document.createElement('div');
    list.className = 'st-size-list';
    for (const version of versions) {
      const row = document.createElement('button');
      row.className = 'st-size-opt';
      row.innerHTML = `<span>${when(version.time)}</span><small>${version.meta.layers.length} layers · Restore</small>`;
      row.addEventListener('click', async () => {
        this.sheet.close();
        await restoreVersion(version, await getPainting(meta.id));
        this.toast('Version restored');
        await this.refresh();
      });
      list.appendChild(row);
    }
    wrap.appendChild(list);
    this.sheet.open(`versions-${meta.id}`, 'Earlier versions', wrap);
  }

  toast(text: string, ms = 1800): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  destroy(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.sheet.el.remove();
    this.el.remove();
  }
}

function when(time: number): string {
  const d = new Date(time);
  const now = new Date();
  const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${clock}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })} ${clock}`;
}
