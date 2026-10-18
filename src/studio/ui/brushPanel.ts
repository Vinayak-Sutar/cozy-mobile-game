import { BrushEngine } from '../brush/engine';
import { type Brush, brushesIn, brushSets, isCustom, LIVE_SET, MY_SET } from '../brush/presets';
import { hexToRgb } from '../color';
import { context, type Layer, makeCanvas } from '../doc/document';
import { savePrefs, type StudioPrefs } from '../tools';

const W = 340;
const H = 88;
let engine: BrushEngine | null = null;
let layer: Layer | null = null;
const previews = new Map<string, HTMLCanvasElement>();

/** Paints the sample stroke (an S-curve that swells and tapers like a pen stroke) into `target`. */
export function paintSample(target: HTMLCanvasElement, brush: Brush, color: string): void {
  engine ??= new BrushEngine(W, H);
  if (!layer) {
    const canvas = makeCanvas(W, H);
    layer = { id: 'preview', name: 'preview', canvas, ctx: context(canvas), opacity: 1, blend: 'source-over', visible: true, alphaLock: false };
  }
  layer.ctx.clearRect(0, 0, W, H);
  const size = Math.min(34, Math.max(5, brush.size * (brush.tip === 'round' && brush.hardness < 0.2 ? 0.35 : 0.9)));
  const point = (k: number) => ({
    x: 22 + k * (W - 44),
    y: H / 2 + Math.sin(k * Math.PI * 2) * 18,
    pressure: 0.15 + Math.sin(k * Math.PI) * 0.85,
    tiltX: 0,
    tiltY: 0,
    t: k * 600,
  });
  // Water and lifting have no colour of their own: show them as a pale wash.
  const shown = brush.live === 'water' ? '#9fc3d9' : brush.live === 'lift' ? '#d8cfc2' : color;
  engine.begin(layer, { brush, size, opacity: brush.opacity, color: shown, mode: 'paint', viewScale: 1 }, point(0), null);
  const points = [];
  for (let i = 1; i <= 80; i++) points.push(point(i / 80));
  engine.add(points);
  engine.end();
  const ctx = context(target);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(layer.canvas, 0, 0, target.width, target.height);
}

/** Glowing brushes and very light colours show up better on a dark backdrop than on paper. */
export function darkBackdrop(brush: Brush, color: string): boolean {
  if (brush.blend === 'lighter') return true;
  const [r, g, b] = hexToRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.82;
}

/** A sample stroke painted with the real engine, cached per brush settings and colour. */
export function brushPreview(brush: Brush, color: string): HTMLCanvasElement {
  // Your own brushes can change under the same id, so the key is every setting.
  const key = `${isCustom(brush.id) ? JSON.stringify(brush) : brush.id}|${color}`;
  let source = previews.get(key);
  if (!source) {
    source = makeCanvas(W, H);
    paintSample(source, brush, color);
    if (previews.size > 80) previews.delete(previews.keys().next().value as string);
    previews.set(key, source);
  }
  const out = makeCanvas(W, H);
  context(out).drawImage(source, 0, 0);
  if (darkBackdrop(brush, color)) out.style.background = '#1d1e26';
  return out;
}

export interface BrushPanelActions {
  pick(id: string): void;
  edit(brush: Brush): void;
  create(): void;
}

/** The brush library: sets of brushes, each with a sample stroke, plus your own. */
export class BrushPanel {
  readonly el: HTMLElement;

  constructor(
    private readonly prefs: StudioPrefs,
    private readonly actions: BrushPanelActions,
    private readonly current: () => Brush,
  ) {
    this.el = document.createElement('div');
    this.render();
  }

  render(): void {
    const sets = brushSets();
    if (!sets.includes(this.prefs.brushSet)) this.prefs.brushSet = sets.includes('Paint') ? 'Paint' : sets[0];
    const tabs = document.createElement('div');
    tabs.className = 'st-tabs';
    for (const set of sets) {
      const b = document.createElement('button');
      b.className = `st-tab${this.prefs.brushSet === set ? ' active' : ''}`;
      b.textContent = set;
      b.addEventListener('click', () => {
        this.prefs.brushSet = set;
        savePrefs(this.prefs);
        this.render();
      });
      tabs.appendChild(b);
    }
    const head = document.createElement('div');
    head.className = 'st-actions';
    head.style.marginTop = '0';
    head.style.marginBottom = '10px';
    const current = this.current();
    const edit = document.createElement('button');
    edit.className = 'st-chip-btn';
    edit.textContent = `Edit ${current.name}`;
    edit.disabled = !!current.live;
    if (current.live) edit.style.opacity = '0.4';
    edit.addEventListener('click', () => this.actions.edit(current));
    const create = document.createElement('button');
    create.className = 'st-chip-btn';
    create.textContent = '+ New brush';
    create.addEventListener('click', () => this.actions.create());
    head.append(edit, create);

    const list = document.createElement('div');
    list.className = 'st-brush-list';
    for (const brush of brushesIn(this.prefs.brushSet)) {
      const card = document.createElement('button');
      card.className = `st-brush-card${brush.id === current.id ? ' active' : ''}`;
      card.appendChild(brushPreview(brush, this.prefs.mode === 'paint' ? this.prefs.color : '#55565f'));
      const name = document.createElement('span');
      name.textContent = brush.name;
      card.appendChild(name);
      card.addEventListener('click', () => {
        this.actions.pick(brush.id);
        this.render();
      });
      list.appendChild(card);
    }
    if (this.prefs.brushSet === MY_SET && !list.childElementCount) {
      const empty = document.createElement('p');
      empty.className = 'st-note';
      empty.textContent = 'Brushes you make or change appear here.';
      list.appendChild(empty);
    }
    const note = document.createElement('p');
    note.className = 'st-note';
    note.textContent =
      this.prefs.brushSet === LIVE_SET
        ? 'Live watercolour flows like real water while it is wet, then dries into the layer. Use the wet bar at the top to freeze it, let it drip, or dry it now.'
        : this.prefs.mode === 'paint'
          ? 'Pick a brush to paint with.'
          : `Pick the brush shape for ${this.prefs.mode === 'erase' ? 'the eraser' : 'smudging'}.`;
    this.el.replaceChildren(note, tabs, head, list);
  }
}
