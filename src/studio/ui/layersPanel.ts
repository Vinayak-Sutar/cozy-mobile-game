import { BLEND_MODES, type BlendMode, type Layer, type PaintingDoc } from '../doc/document';
import { button, icons } from './icons';

export interface LayerActions {
  select(index: number): void;
  add(): void;
  duplicate(index: number): void;
  remove(index: number): void;
  mergeDown(index: number): void;
  clear(index: number): void;
  move(index: number, to: number): void;
  setVisible(index: number, visible: boolean): void;
  setOpacity(index: number, opacity: number, done: boolean): void;
  setBlend(index: number, blend: BlendMode): void;
  setAlphaLock(index: number, lock: boolean): void;
  rename(index: number, name: string): void;
  paper(): void;
}

/** Layers, top first: thumbnails, visibility, and the active layer's opacity, blend and actions. */
export class LayersPanel {
  readonly el: HTMLElement;

  constructor(
    private readonly doc: PaintingDoc,
    private readonly actions: LayerActions,
  ) {
    this.el = document.createElement('div');
    this.render();
  }

  render(): void {
    const doc = this.doc;
    const head = document.createElement('div');
    head.className = 'st-actions';
    const add = document.createElement('button');
    add.className = 'st-chip-btn primary';
    add.textContent = '+ New layer';
    add.disabled = doc.layers.length >= doc.maxLayers;
    add.addEventListener('click', () => this.actions.add());
    const count = document.createElement('span');
    count.className = 'st-note';
    count.textContent = `${doc.layers.length} of ${doc.maxLayers} layers`;
    head.append(add, count);

    const list = document.createElement('div');
    list.style.marginTop = '10px';
    for (let i = doc.layers.length - 1; i >= 0; i--) list.appendChild(this.row(doc.layers[i], i));

    const paper = document.createElement('button');
    paper.className = 'st-layer';
    paper.innerHTML = `<canvas width="92" height="92"></canvas><span class="name">Paper<span class="meta">${doc.paper.visible ? 'Colour and texture' : 'Transparent'}</span></span>`;
    const pc = paper.querySelector('canvas') as HTMLCanvasElement;
    const pctx = pc.getContext('2d');
    if (pctx && doc.paper.visible) {
      pctx.fillStyle = doc.paper.color;
      pctx.fillRect(0, 0, 92, 92);
    }
    paper.addEventListener('click', () => this.actions.paper());
    list.appendChild(paper);
    this.el.replaceChildren(head, list);
  }

  private row(layer: Layer, index: number): HTMLElement {
    const doc = this.doc;
    const active = index === doc.active;
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = `st-layer${active ? ' active' : ''}`;
    const thumb = document.createElement('canvas');
    const scale = 92 / Math.max(doc.width, doc.height);
    thumb.width = Math.max(1, Math.round(doc.width * scale));
    thumb.height = Math.max(1, Math.round(doc.height * scale));
    thumb.getContext('2d')?.drawImage(layer.canvas, 0, 0, thumb.width, thumb.height);
    const name = document.createElement('span');
    name.className = 'name';
    const blend = BLEND_MODES.find((b) => b.id === layer.blend)?.name ?? 'Normal';
    name.innerHTML = `${escape(layer.name)}<span class="meta">${Math.round(layer.opacity * 100)}% · ${blend}${layer.alphaLock ? ' · locked' : ''}</span>`;
    const eye = button(layer.visible ? icons.eye : icons.eyeOff, layer.visible ? 'Hide layer' : 'Show layer');
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      this.actions.setVisible(index, !layer.visible);
    });
    row.append(thumb, name, eye);
    row.addEventListener('click', () => {
      if (!active) this.actions.select(index);
    });
    wrap.appendChild(row);
    if (active) wrap.appendChild(this.tools(layer, index));
    return wrap;
  }

  private tools(layer: Layer, index: number): HTMLElement {
    const tools = document.createElement('div');
    tools.className = 'st-layer-tools';
    const opacity = document.createElement('div');
    opacity.className = 'st-row';
    opacity.innerHTML = `<label>Opacity</label><input type="range" min="0" max="100" step="1" value="${Math.round(layer.opacity * 100)}"><span class="value">${Math.round(layer.opacity * 100)}%</span>`;
    const range = opacity.querySelector('input') as HTMLInputElement;
    const out = opacity.querySelector('.value') as HTMLElement;
    range.addEventListener('input', () => {
      out.textContent = `${range.value}%`;
      this.actions.setOpacity(index, Number(range.value) / 100, false);
    });
    range.addEventListener('change', () => this.actions.setOpacity(index, Number(range.value) / 100, true));
    const blendRow = document.createElement('div');
    blendRow.className = 'st-row';
    blendRow.innerHTML = '<label>Blend</label>';
    const select = document.createElement('select');
    select.className = 'st-select';
    for (const mode of BLEND_MODES) {
      const option = document.createElement('option');
      option.value = mode.id;
      option.textContent = mode.name;
      option.selected = mode.id === layer.blend;
      select.appendChild(option);
    }
    select.addEventListener('change', () => this.actions.setBlend(index, select.value as BlendMode));
    blendRow.appendChild(select);
    const actions = document.createElement('div');
    actions.className = 'st-actions';
    const chip = (label: string, run: () => void, className = '', disabled = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `st-chip-btn ${className}`;
      b.textContent = label;
      b.disabled = disabled;
      if (disabled) b.style.opacity = '0.4';
      b.addEventListener('click', run);
      return b;
    };
    const doc = this.doc;
    actions.append(
      chip(layer.alphaLock ? 'Unlock alpha' : 'Lock alpha', () => this.actions.setAlphaLock(index, !layer.alphaLock)),
      chip('Move up', () => this.actions.move(index, index + 1), '', index >= doc.layers.length - 1),
      chip('Move down', () => this.actions.move(index, index - 1), '', index === 0),
      chip('Duplicate', () => this.actions.duplicate(index), '', doc.layers.length >= doc.maxLayers),
      chip('Merge down', () => this.actions.mergeDown(index), '', index === 0),
      chip('Rename', () => {
        const name = window.prompt('Layer name', layer.name);
        if (name?.trim()) this.actions.rename(index, name.trim().slice(0, 40));
      }),
      chip('Clear', () => this.actions.clear(index)),
      chip('Delete', () => this.actions.remove(index), 'danger', doc.layers.length <= 1),
    );
    tools.append(opacity, blendRow, actions);
    return tools;
  }
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}
