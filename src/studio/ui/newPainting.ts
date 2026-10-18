import { maxLayersFor, type Paper, type PaperTexture } from '../doc/document';
import { html } from './icons';

export interface NewPaintingSpec {
  width: number;
  height: number;
  paper: Paper;
}

const MAX_SIDE = 4096;
/** iOS Safari refuses canvases above about 16.7 million pixels. */
const MAX_AREA = 16_700_000;

interface SizeOption {
  id: string;
  name: string;
  width: number;
  height: number;
}

function screenSize(): [number, number] {
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  return [Math.round(window.innerWidth * ratio), Math.round(window.innerHeight * ratio)];
}

/** Keeps a size inside what phones can hold. */
export function clampSize(width: number, height: number): [number, number] {
  let w = Math.max(64, Math.round(width));
  let h = Math.max(64, Math.round(height));
  const side = Math.max(w, h) / MAX_SIDE;
  if (side > 1) {
    w = Math.round(w / side);
    h = Math.round(h / side);
  }
  const area = (w * h) / MAX_AREA;
  if (area > 1) {
    w = Math.floor(w / Math.sqrt(area));
    h = Math.floor(h / Math.sqrt(area));
  }
  return [w, h];
}

function options(): SizeOption[] {
  const [sw, sh] = screenSize();
  return [
    { id: 'screen', name: 'Screen', width: sw, height: sh },
    { id: 'square', name: 'Square', width: 2048, height: 2048 },
    { id: 'portrait', name: 'Portrait 2:3', width: 1600, height: 2400 },
    { id: 'landscape', name: 'Landscape 3:2', width: 2400, height: 1600 },
    { id: 'wallpaper', name: 'Phone wallpaper', width: 1440, height: 3200 },
    { id: 'print', name: 'A4 print (300 dpi)', width: 2480, height: 3508 },
    { id: 'custom', name: 'Custom', width: 0, height: 0 },
  ];
}

const PAPERS: { color: string; name: string }[] = [
  { color: '#ffffff', name: 'White' },
  { color: '#faf3e6', name: 'Cream' },
  { color: '#e9e4da', name: 'Warm grey' },
  { color: '#c9ab7d', name: 'Kraft' },
  { color: '#22232a', name: 'Charcoal' },
  { color: '#0c0c10', name: 'Black' },
];

/** The new-painting sheet: a size, and the paper to paint on. */
export class NewPainting {
  readonly el: HTMLElement;
  private size = 'screen';
  private custom: [number, number] = [2000, 2000];
  private paper: Paper = { color: '#ffffff', texture: 'smooth', visible: true };

  constructor(private readonly onCreate: (spec: NewPaintingSpec) => void) {
    this.el = document.createElement('div');
    this.render();
  }

  private chosen(): [number, number] {
    const option = options().find((o) => o.id === this.size) ?? options()[0];
    return option.id === 'custom' ? clampSize(...this.custom) : clampSize(option.width, option.height);
  }

  private render(): void {
    const list = document.createElement('div');
    list.className = 'st-size-list';
    for (const option of options()) {
      const b = document.createElement('button');
      b.className = `st-size-opt${this.size === option.id ? ' active' : ''}`;
      const [w, h] = option.id === 'custom' ? clampSize(...this.custom) : clampSize(option.width, option.height);
      b.innerHTML = `<span>${option.name}</span><small>${w} × ${h} · up to ${maxLayersFor(w, h)} layers</small>`;
      b.addEventListener('click', () => {
        this.size = option.id;
        this.render();
      });
      list.appendChild(b);
    }

    const custom = html<HTMLDivElement>(
      '<div class="st-row"><label>Width</label><input class="st-input" type="number" min="64" max="4096" inputmode="numeric"><label style="min-width:auto">Height</label><input class="st-input" type="number" min="64" max="4096" inputmode="numeric"></div>',
    );
    custom.classList.toggle('st-hidden', this.size !== 'custom');
    const [wIn, hIn] = custom.querySelectorAll('input');
    wIn.value = String(this.custom[0]);
    hIn.value = String(this.custom[1]);
    const readCustom = (): void => {
      this.custom = [Number(wIn.value) || 2000, Number(hIn.value) || 2000];
    };
    wIn.addEventListener('change', () => {
      readCustom();
      this.render();
    });
    hIn.addEventListener('change', () => {
      readCustom();
      this.render();
    });

    const paperTitle = document.createElement('p');
    paperTitle.className = 'st-note';
    paperTitle.textContent = 'Paper';
    const swatches = document.createElement('div');
    swatches.className = 'st-swatches';
    for (const p of PAPERS) {
      const s = document.createElement('button');
      s.className = 'st-swatch';
      s.title = p.name;
      s.style.background = p.color;
      s.style.outline = this.paper.visible && this.paper.color === p.color ? '3px solid var(--accent)' : 'none';
      s.addEventListener('click', () => {
        this.paper = { ...this.paper, color: p.color, visible: true };
        this.render();
      });
      swatches.appendChild(s);
    }
    const clear = document.createElement('button');
    clear.className = 'st-swatch';
    clear.title = 'Transparent';
    clear.style.background = 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0 / 12px 12px';
    clear.style.outline = this.paper.visible ? 'none' : '3px solid var(--accent)';
    clear.addEventListener('click', () => {
      this.paper = { ...this.paper, visible: false };
      this.render();
    });
    swatches.appendChild(clear);

    const texture = html<HTMLDivElement>(
      '<div class="st-row"><label>Texture</label><select class="st-select"><option value="smooth">Smooth</option><option value="watercolor">Watercolour paper</option><option value="canvas">Canvas</option></select></div>',
    );
    const select = texture.querySelector('select') as HTMLSelectElement;
    select.value = this.paper.texture;
    select.addEventListener('change', () => (this.paper = { ...this.paper, texture: select.value as PaperTexture }));

    const actions = document.createElement('div');
    actions.className = 'st-actions';
    const create = document.createElement('button');
    create.className = 'st-chip-btn primary';
    const [w, h] = this.chosen();
    create.textContent = `Start painting (${w} × ${h})`;
    create.addEventListener('click', () => {
      if (this.size === 'custom') readCustom();
      const [width, height] = this.chosen();
      this.onCreate({ width, height, paper: { ...this.paper } });
    });
    actions.appendChild(create);
    this.el.replaceChildren(list, custom, paperTitle, swatches, texture, actions);
  }
}
