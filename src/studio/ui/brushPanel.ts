import { BrushEngine } from '../brush/engine';
import { type Brush, BRUSHES, SETS } from '../brush/presets';
import { context, type Layer, makeCanvas } from '../doc/document';
import { savePrefs, type StudioPrefs } from '../tools';

const W = 340;
const H = 88;
let engine: BrushEngine | null = null;
let layer: Layer | null = null;
const previews = new Map<string, HTMLCanvasElement>();

/** A sample stroke painted with the real engine: an S-curve that swells and tapers like a pen stroke. */
export function brushPreview(brush: Brush, color: string): HTMLCanvasElement {
  const key = `${brush.id}|${color}`;
  let source = previews.get(key);
  if (!source) {
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
    engine.begin(layer, { brush, size, opacity: brush.opacity, color, mode: 'paint', viewScale: 1 }, point(0), null);
    const points = [];
    for (let i = 1; i <= 80; i++) points.push(point(i / 80));
    engine.add(points);
    engine.end();
    source = makeCanvas(W, H);
    context(source).drawImage(layer.canvas, 0, 0);
    previews.set(key, source);
  }
  const out = makeCanvas(W, H);
  context(out).drawImage(source, 0, 0);
  if (brush.blend === 'lighter') out.style.background = '#1d1e26';
  return out;
}

/** The brush library: sets of brushes, each with a sample stroke. */
export class BrushPanel {
  readonly el: HTMLElement;

  constructor(
    private readonly prefs: StudioPrefs,
    private readonly onPick: (id: string) => void,
  ) {
    this.el = document.createElement('div');
    this.render();
  }

  render(): void {
    const tabs = document.createElement('div');
    tabs.className = 'st-tabs';
    for (const set of SETS) {
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
    const list = document.createElement('div');
    list.className = 'st-brush-list';
    const current = this.prefs.tools[this.prefs.mode].brush;
    for (const brush of BRUSHES.filter((b) => b.set === this.prefs.brushSet)) {
      const card = document.createElement('button');
      card.className = `st-brush-card${brush.id === current ? ' active' : ''}`;
      card.appendChild(brushPreview(brush, this.prefs.mode === 'paint' ? this.prefs.color : '#55565f'));
      const name = document.createElement('span');
      name.textContent = brush.name;
      card.appendChild(name);
      card.addEventListener('click', () => {
        this.onPick(brush.id);
        this.render();
      });
      list.appendChild(card);
    }
    const note = document.createElement('p');
    note.className = 'st-note';
    note.textContent =
      this.prefs.mode === 'paint' ? 'Pick a brush to paint with.' : `Pick the brush shape for ${this.prefs.mode === 'erase' ? 'the eraser' : 'smudging'}.`;
    this.el.replaceChildren(note, tabs, list);
  }
}
