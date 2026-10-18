import { type DocPoint, BrushEngine, type ToolMode } from './brush/engine';
import { brushById } from './brush/presets';
import { rgbToHex } from './color';
import { type BlendMode, memoryBudget, metaOf, type PaintingDoc, type PaperTexture } from './doc/document';
import { ActionEdit, History, TileEdit } from './doc/history';
import { canvasBlob, type PaintingMeta, savePainting, saveVersion } from './doc/library';
import { encode, fileName, type ImageFormat, shareOrSave } from './export';
import { type InputPoint, StudioInput } from './input/input';
import { pushRecent, savePrefs, type StudioPrefs } from './tools';
import { BrushPanel, brushPreview } from './ui/brushPanel';
import { ColorPanel } from './ui/colorPanel';
import { button, html, icons } from './ui/icons';
import { LayersPanel } from './ui/layersPanel';
import { Sheet } from './ui/sheet';
import { Compositor } from './view/compositor';
import { Viewport } from './view/viewport';

/** Brush sizes are stored for a canvas this many pixels across, and scaled to each painting. */
const REFERENCE = 2000;
const MIN_SIZE = 1;
const MAX_SIZE = 600;
const VERSION_EVERY = 10 * 60 * 1000;

export interface EditorOptions {
  created: number;
  /** Layers as they were loaded (saved as the first version of this session). */
  loaded?: Map<string, Blob>;
  onExit(): void;
}

/**
 * The painting screen: the canvas with zoom, pan and rotate; the brush,
 * smudge and eraser; colours, layers, undo; export; and autosave.
 */
export class Editor {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view = new Viewport();
  private readonly compositor: Compositor;
  private readonly engine: BrushEngine;
  private readonly history: History;
  private readonly input: StudioInput;
  private readonly sheet: Sheet;
  private ratio = 1;
  private needsRender = true;
  private raf = 0;
  private edit: TileEdit | null = null;
  private toastTimer = 0;
  private saveTimer = 0;
  private saving: Promise<void> | null = null;
  private dirtyLayers = new Set<string>();
  private dirtyMeta = false;
  private savedLayerIds: string[];
  private lastVersion = Date.now();
  /** The painting as it was opened, kept as a version once it first changes. */
  private openedAs: { meta: PaintingMeta; layers: Map<string, Blob> } | null = null;
  private exiting = false;
  private layersPanel: LayersPanel | null = null;
  private colorPanel: ColorPanel | null = null;
  private brushPanel: BrushPanel | null = null;

  // Interface bits that change.
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly zoomLabel: HTMLElement;
  private readonly brushBtn: HTMLButtonElement;
  private readonly well: HTMLButtonElement;
  private readonly modeBtns: Record<ToolMode, HTMLButtonElement>;
  private readonly sizeSlider: VSlider;
  private readonly opacitySlider: VSlider;
  private readonly loupe: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly sizePreview: HTMLElement;
  private readonly showUi: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly doc: PaintingDoc,
    private readonly prefs: StudioPrefs,
    private readonly options: EditorOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'st-editor';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'st-view';
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);

    this.compositor = new Compositor(doc);
    this.engine = new BrushEngine(doc.width, doc.height);
    this.history = new History(memoryBudget() * 0.45);
    this.history.onChange = () => this.updateButtons();
    this.savedLayerIds = options.loaded ? doc.layers.map((l) => l.id) : [];

    // Top bar.
    const top = document.createElement('div');
    top.className = 'st-topbar';
    const gallery = button(icons.gallery, 'Gallery');
    gallery.addEventListener('click', () => void this.exit());
    this.zoomLabel = document.createElement('button');
    this.zoomLabel.className = 'st-zoom';
    this.zoomLabel.title = 'Fit to screen';
    this.zoomLabel.addEventListener('click', () => this.fit());
    this.undoBtn = button(icons.undo, 'Undo');
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn = button(icons.redo, 'Redo');
    this.redoBtn.addEventListener('click', () => this.redo());
    const layers = button(icons.layers, 'Layers');
    layers.addEventListener('click', () => this.openLayers());
    const share = button(icons.share, 'Export and share');
    share.addEventListener('click', () => this.openExport());
    const more = button(icons.more, 'More');
    more.addEventListener('click', () => this.openMore());
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    top.append(gallery, this.zoomLabel, spacer, this.undoBtn, this.redoBtn, layers, share, more);

    // Size and opacity on the left edge.
    const side = document.createElement('div');
    side.className = 'st-side';
    this.sizeSlider = new VSlider('Size', (v, done) => this.setSize(v, done));
    this.opacitySlider = new VSlider('Opacity', (v, done) => this.setOpacity(v, done));
    side.append(this.sizeSlider.el, this.opacitySlider.el);

    // Tools at the bottom.
    const bottom = document.createElement('div');
    bottom.className = 'st-bottombar';
    this.brushBtn = document.createElement('button');
    this.brushBtn.className = 'st-brush-btn';
    this.brushBtn.addEventListener('click', () => this.openBrushes());
    this.modeBtns = {
      paint: button(icons.brush, 'Paint'),
      smudge: button(icons.smudge, 'Smudge'),
      erase: button(icons.eraser, 'Erase'),
    };
    for (const mode of ['paint', 'smudge', 'erase'] as ToolMode[]) {
      this.modeBtns[mode].addEventListener('click', () => {
        if (this.prefs.mode === mode) this.openBrushes();
        else this.setMode(mode);
      });
    }
    this.well = document.createElement('button');
    this.well.className = 'st-well';
    this.well.setAttribute('aria-label', 'Colours');
    this.well.addEventListener('click', () => this.openColors());
    bottom.append(this.brushBtn, this.modeBtns.paint, this.modeBtns.smudge, this.modeBtns.erase, this.well);

    this.loupe = document.createElement('div');
    this.loupe.className = 'st-loupe st-hidden';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-toast';
    this.sizePreview = document.createElement('div');
    this.sizePreview.className = 'st-size-preview st-hidden';
    this.showUi = button(icons.eye, 'Show interface', 'st-btn st-show-ui st-hidden');
    this.showUi.addEventListener('click', () => this.toggleUi());
    this.el.append(top, side, bottom, this.loupe, this.toastEl, this.sizePreview, this.showUi);
    this.sheet = new Sheet(this.el);

    this.input = new StudioInput(this.canvas, {
      strokeStart: (p, pen) => this.strokeStart(p, pen),
      strokeMove: (points) => this.strokeMove(points),
      strokeEnd: () => this.strokeEnd(),
      strokeCancel: () => this.strokeCancel(),
      pinchStart: (a, b) => this.view.beginPinch(a, b),
      pinch: (a, b) => {
        this.view.pinch(a, b);
        this.viewChanged();
      },
      pinchEnd: () => this.view.endPinch(),
      pan: (dx, dy) => {
        this.view.tx += dx;
        this.view.ty += dy;
        this.viewChanged();
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleUi: () => this.toggleUi(),
      eyedropper: (x, y, phase) => this.eyedropper(x, y, phase),
      penDetected: () => this.penDetected(),
    });
    this.input.penOnly = prefs.penOnly;

    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.hidden);
    window.addEventListener('pagehide', this.hidden);
    this.resize();
    this.fit();
    this.updateTool();
    this.updateButtons();
    if (options.loaded) this.openedAs = { meta: this.meta(), layers: options.loaded };
    else this.markAll();
    if (!prefs.seenHelp) {
      prefs.seenHelp = true;
      savePrefs(prefs);
      window.setTimeout(() => this.openHelp(), 500);
    }
    this.loop();
  }

  // ---------- Frame ----------

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.needsRender && !this.engine.active) return;
    this.needsRender = false;
    this.engine.takeFrame();
    this.compositor.render(this.ctx, this.view, this.ratio, this.engine.live(), this.engine.area);
  };

  private render(): void {
    this.needsRender = true;
  }

  private resize = (): void => {
    const rect = this.el.getBoundingClientRect();
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.ratio));
    this.render();
  };

  private fit(): void {
    const rect = this.el.getBoundingClientRect();
    this.view.fit(this.doc.width, this.doc.height, rect.width, rect.height, Math.min(48, rect.width * 0.06));
    this.viewChanged();
  }

  private viewChanged(): void {
    this.zoomLabel.textContent = `${this.view.zoomPercent}%`;
    this.render();
  }

  // ---------- Painting ----------

  private toDoc(p: InputPoint): DocPoint {
    const [x, y] = this.view.toDoc(p.x, p.y);
    return { x, y, pressure: p.pressure, tiltX: p.tiltX, tiltY: p.tiltY, t: p.t };
  }

  private get docScale(): number {
    return Math.max(this.doc.width, this.doc.height) / REFERENCE;
  }

  private strokeStart(p: InputPoint, _pen: boolean): void {
    this.sheet.close();
    const layer = this.doc.activeLayer;
    if (!layer.visible) {
      this.toast('This layer is hidden');
      return;
    }
    const mode = this.prefs.mode;
    const tool = this.prefs.tools[mode];
    const brush = brushById(tool.brush);
    this.edit = new TileEdit(layer, mode === 'erase' ? 'Erase' : mode === 'smudge' ? 'Smudge' : 'Paint');
    this.engine.begin(
      layer,
      { brush, size: tool.size * this.docScale, opacity: tool.opacity * brush.opacity, color: this.prefs.color, mode, viewScale: this.view.scale },
      this.toDoc(p),
      this.edit,
    );
    if (this.engine.live()) this.compositor.beginStroke();
    this.render();
  }

  private strokeMove(points: InputPoint[]): void {
    if (!this.engine.active) return;
    this.engine.add(points.map((p) => this.toDoc(p)));
  }

  private strokeEnd(): void {
    if (!this.engine.active) return;
    this.engine.end();
    const edit = this.edit;
    this.edit = null;
    if (edit && !edit.empty) {
      this.history.push(edit);
      this.markLayer(edit.layer.id);
      if (this.prefs.mode === 'paint') {
        pushRecent(this.prefs, this.prefs.color);
        savePrefs(this.prefs);
      }
    }
    this.render();
  }

  private strokeCancel(): void {
    if (!this.engine.active) return;
    // Smudge already changed the layer: put it back.
    if (this.edit && !this.edit.empty) this.edit.undo();
    this.edit = null;
    this.engine.cancel();
    this.render();
  }

  private undo(): void {
    if (this.engine.active) return;
    const label = this.history.undo();
    this.toast(label ? `Undo ${label.toLowerCase()}` : 'Nothing to undo');
    this.afterHistory();
  }

  private redo(): void {
    if (this.engine.active) return;
    const label = this.history.redo();
    this.toast(label ? `Redo ${label.toLowerCase()}` : 'Nothing to redo');
    this.afterHistory();
  }

  private afterHistory(): void {
    this.doc.active = Math.min(this.doc.active, this.doc.layers.length - 1);
    this.compositor.invalidate();
    this.markAll();
    this.layersPanel?.render();
    this.render();
  }

  private eyedropper(x: number, y: number, phase: 'start' | 'move' | 'end'): void {
    const [dx, dy] = this.view.toDoc(x, y);
    const inside = dx >= 0 && dy >= 0 && dx < this.doc.width && dy < this.doc.height;
    const color = inside ? rgbToHex(...this.compositor.sample(dx, dy)) : this.prefs.color;
    if (phase === 'end') {
      this.loupe.classList.add('st-hidden');
      if (inside) {
        this.prefs.previous = this.prefs.color;
        this.prefs.color = color;
        pushRecent(this.prefs, color);
        savePrefs(this.prefs);
        this.updateTool();
        this.colorPanel?.sync();
        this.toast('Colour picked');
      }
      return;
    }
    this.loupe.classList.remove('st-hidden');
    this.loupe.style.left = `${x}px`;
    this.loupe.style.top = `${y - 80}px`;
    this.loupe.style.borderColor = color;
    this.loupe.style.borderBottomColor = this.prefs.color;
    this.loupe.style.borderLeftColor = color;
  }

  private penDetected(): void {
    if (this.prefs.penOnly) return;
    this.prefs.penOnly = true;
    this.input.penOnly = true;
    savePrefs(this.prefs);
    this.toast('Pen found: fingers now move the canvas (⋯ to change)', 3200);
  }

  // ---------- Tools ----------

  private setMode(mode: ToolMode): void {
    this.prefs.mode = mode;
    savePrefs(this.prefs);
    this.updateTool();
    if (this.sheet.openId === 'brushes') this.brushPanel?.render();
  }

  private setSize(v: number, done: boolean): void {
    const size = MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, v);
    this.prefs.tools[this.prefs.mode].size = size;
    // Show how big the brush is on screen while dragging.
    const px = size * this.docScale * this.view.scale;
    this.sizePreview.style.width = this.sizePreview.style.height = `${Math.max(4, px)}px`;
    this.sizePreview.classList.toggle('st-hidden', done);
    if (done) savePrefs(this.prefs);
  }

  private setOpacity(v: number, done: boolean): void {
    this.prefs.tools[this.prefs.mode].opacity = Math.max(0.02, v);
    if (done) savePrefs(this.prefs);
  }

  private updateTool(): void {
    const mode = this.prefs.mode;
    const tool = this.prefs.tools[mode];
    const brush = brushById(tool.brush);
    for (const m of Object.keys(this.modeBtns) as ToolMode[]) this.modeBtns[m].classList.toggle('on', m === mode);
    this.well.style.background = this.prefs.color;
    this.sizeSlider.set(Math.log(tool.size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE));
    this.opacitySlider.set(tool.opacity);
    // The brush's sample stroke in a little circle, and its name.
    const dot = document.createElement('canvas');
    dot.width = dot.height = 68;
    const dctx = dot.getContext('2d');
    if (dctx) {
      const preview = brushPreview(brush, mode === 'paint' ? this.prefs.color : '#55565f');
      if (brush.blend === 'lighter') {
        dctx.fillStyle = '#1d1e26';
        dctx.fillRect(0, 0, 68, 68);
      }
      dctx.drawImage(preview, 40, 0, 260, 88, 2, 18, 64, 22);
    }
    const label = document.createElement('span');
    label.textContent = mode === 'paint' ? brush.name : mode === 'erase' ? `Eraser · ${brush.name}` : `Smudge · ${brush.name}`;
    this.brushBtn.replaceChildren(dot, label);
  }

  private updateButtons(): void {
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
  }

  private toggleUi(): void {
    const hidden = this.el.classList.toggle('st-chrome-hidden');
    this.showUi.classList.toggle('st-hidden', !hidden);
    if (hidden) this.sheet.close();
  }

  private toast(text: string, ms = 1400): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  // ---------- Panels ----------

  private openBrushes(): void {
    this.brushPanel = new BrushPanel(this.prefs, (id) => {
      const mode = this.prefs.mode;
      const tool = this.prefs.tools[mode];
      // Like a real brush pot: each brush keeps the size you last used it at.
      this.prefs.brushSizes[`${mode}:${tool.brush}`] = { size: tool.size, opacity: tool.opacity };
      const saved = this.prefs.brushSizes[`${mode}:${id}`];
      tool.brush = id;
      tool.size = saved?.size ?? brushById(id).size * (mode === 'paint' ? 1 : 1.4);
      tool.opacity = saved?.opacity ?? 1;
      savePrefs(this.prefs);
      this.updateTool();
    });
    this.sheet.open('brushes', 'Brushes', this.brushPanel.el, () => (this.brushPanel = null));
  }

  private openColors(): void {
    this.colorPanel = new ColorPanel(this.prefs, () => this.updateTool());
    this.sheet.open('colours', 'Colours', this.colorPanel.el, () => (this.colorPanel = null));
  }

  private openLayers(): void {
    const doc = this.doc;
    const push = (label: string, undo: () => void, redo: () => void): void => {
      this.history.push(new ActionEdit(label, undo, redo));
    };
    const changed = (): void => {
      this.compositor.invalidate();
      this.markAll();
      this.layersPanel?.render();
      this.render();
    };
    let opacityBefore: number | null = null;
    this.layersPanel = new LayersPanel(doc, {
      select: (i) => {
        doc.active = i;
        changed();
      },
      add: () => {
        const layer = doc.createLayer();
        const at = doc.active + 1;
        if (!doc.addLayer(layer, at)) return this.toast('No room for more layers');
        push('New layer', () => doc.remove(doc.indexOf(layer.id)), () => doc.addLayer(layer, at));
        changed();
      },
      duplicate: (i) => {
        const copy = doc.duplicate(i);
        if (!copy) return this.toast('No room for more layers');
        push('Duplicate', () => doc.remove(doc.indexOf(copy.id)), () => doc.addLayer(copy, i + 1));
        changed();
      },
      remove: (i) => {
        const removed = doc.remove(i);
        if (!removed) return;
        push('Delete layer', () => doc.addLayer(removed, i), () => doc.remove(doc.indexOf(removed.id)));
        changed();
      },
      mergeDown: (i) => {
        if (i === 0) return;
        const upper = doc.layers[i];
        const lower = doc.layers[i - 1];
        const edit = new TileEdit(lower, 'Merge');
        edit.capture(0, 0, doc.width, doc.height);
        if (upper.visible) {
          lower.ctx.globalCompositeOperation = upper.blend;
          lower.ctx.globalAlpha = upper.opacity;
          lower.ctx.drawImage(upper.canvas, 0, 0);
          lower.ctx.globalCompositeOperation = 'source-over';
          lower.ctx.globalAlpha = 1;
        }
        doc.remove(i);
        doc.active = i - 1;
        this.history.push(
          new ActionEdit(
            'Merge',
            () => {
              edit.undo();
              doc.addLayer(upper, i);
            },
            () => {
              edit.redo();
              doc.remove(doc.indexOf(upper.id));
            },
            edit.bytes,
          ),
        );
        changed();
      },
      clear: (i) => {
        const layer = doc.layers[i];
        const edit = new TileEdit(layer, 'Clear');
        edit.capture(0, 0, doc.width, doc.height);
        layer.ctx.clearRect(0, 0, doc.width, doc.height);
        this.history.push(edit);
        changed();
      },
      move: (i, to) => {
        if (to < 0 || to >= doc.layers.length) return;
        doc.move(i, to);
        push('Move layer', () => doc.move(to, i), () => doc.move(i, to));
        changed();
      },
      setVisible: (i, visible) => {
        const layer = doc.layers[i];
        layer.visible = visible;
        push(visible ? 'Show layer' : 'Hide layer', () => (layer.visible = !visible), () => (layer.visible = visible));
        changed();
      },
      setOpacity: (i, opacity, done) => {
        const layer = doc.layers[i];
        opacityBefore ??= layer.opacity;
        layer.opacity = opacity;
        if (done) {
          const before = opacityBefore;
          opacityBefore = null;
          push('Opacity', () => (layer.opacity = before), () => (layer.opacity = opacity));
          changed();
        } else {
          this.compositor.invalidate();
          this.render();
        }
      },
      setBlend: (i, blend: BlendMode) => {
        const layer = doc.layers[i];
        const before = layer.blend;
        layer.blend = blend;
        push('Blend mode', () => (layer.blend = before), () => (layer.blend = blend));
        changed();
      },
      setAlphaLock: (i, lock) => {
        const layer = doc.layers[i];
        layer.alphaLock = lock;
        push(lock ? 'Lock alpha' : 'Unlock alpha', () => (layer.alphaLock = !lock), () => (layer.alphaLock = lock));
        changed();
        this.toast(lock ? 'Alpha locked: paint stays inside what is there' : 'Alpha unlocked');
      },
      rename: (i, name) => {
        doc.layers[i].name = name;
        changed();
      },
      paper: () => this.openPaper(),
    });
    this.sheet.open('layers', 'Layers', this.layersPanel.el, () => (this.layersPanel = null));
  }

  private openPaper(): void {
    const doc = this.doc;
    const wrap = document.createElement('div');
    const colors = ['#ffffff', '#faf3e6', '#f2e6cf', '#d9c4a0', '#e9eef2', '#2b2c33', '#101114'];
    const render = (): void => {
      const swatches = document.createElement('div');
      swatches.className = 'st-swatches';
      for (const c of colors) {
        const s = document.createElement('button');
        s.className = 'st-swatch';
        s.style.background = c;
        s.style.outline = doc.paper.color === c ? '3px solid var(--accent)' : 'none';
        s.addEventListener('click', () => {
          doc.paper.color = c;
          doc.paper.visible = true;
          update();
        });
        swatches.appendChild(s);
      }
      const custom = html<HTMLDivElement>('<div class="st-row"><label>Any colour</label><input type="color" class="st-input"></div>');
      const picker = custom.querySelector('input') as HTMLInputElement;
      picker.value = doc.paper.color;
      picker.addEventListener('input', () => {
        doc.paper.color = picker.value;
        doc.paper.visible = true;
        update(false);
      });
      const texture = html<HTMLDivElement>(
        '<div class="st-row"><label>Texture</label><select class="st-select"><option value="smooth">Smooth</option><option value="watercolor">Watercolour paper</option><option value="canvas">Canvas</option></select></div>',
      );
      const select = texture.querySelector('select') as HTMLSelectElement;
      select.value = doc.paper.texture;
      select.addEventListener('change', () => {
        doc.paper.texture = select.value as PaperTexture;
        update();
      });
      const visible = document.createElement('button');
      visible.className = 'st-chip-btn';
      visible.textContent = doc.paper.visible ? 'Make transparent' : 'Show paper';
      visible.addEventListener('click', () => {
        doc.paper.visible = !doc.paper.visible;
        update();
      });
      const note = document.createElement('p');
      note.className = 'st-note';
      note.textContent = 'With the paper off, PNG exports keep a transparent background.';
      wrap.replaceChildren(swatches, custom, texture, visible, note);
    };
    const update = (rerender = true): void => {
      this.compositor.paperChanged();
      this.dirtyMeta = true;
      this.scheduleSave();
      this.render();
      if (rerender) render();
    };
    render();
    this.sheet.open('paper', 'Paper', wrap, () => this.layersPanel?.render());
  }

  private openExport(): void {
    const doc = this.doc;
    let format: ImageFormat = 'png';
    let scale = 1;
    let quality = 0.92;
    const wrap = document.createElement('div');
    const preview = this.compositor.flatten(Math.min(1, 360 / Math.max(doc.width, doc.height)));
    preview.className = 'st-export-preview';
    const seg = (options: [string, string][], current: () => string, pick: (id: string) => void): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'st-seg';
      const draw = (): void => {
        el.replaceChildren(
          ...options.map(([id, label]) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.className = current() === id ? 'active' : '';
            b.addEventListener('click', () => {
              pick(id);
              draw();
              info();
            });
            return b;
          }),
        );
      };
      draw();
      return el;
    };
    const formatRow = document.createElement('div');
    formatRow.className = 'st-row';
    formatRow.innerHTML = '<label>Format</label>';
    formatRow.appendChild(seg([['png', 'PNG'], ['jpeg', 'JPEG']], () => format, (id) => (format = id as ImageFormat)));
    const sizeRow = document.createElement('div');
    sizeRow.className = 'st-row';
    sizeRow.innerHTML = '<label>Size</label>';
    sizeRow.appendChild(seg([['1', 'Full'], ['0.5', 'Half']], () => String(scale), (id) => (scale = Number(id))));
    const qualityRow = html<HTMLDivElement>('<div class="st-row"><label>Quality</label><input type="range" min="50" max="100" value="92"><span class="value">92%</span></div>');
    const q = qualityRow.querySelector('input') as HTMLInputElement;
    q.addEventListener('input', () => {
      quality = Number(q.value) / 100;
      (qualityRow.querySelector('.value') as HTMLElement).textContent = `${q.value}%`;
    });
    const note = document.createElement('p');
    note.className = 'st-note';
    const info = (): void => {
      qualityRow.classList.toggle('st-hidden', format !== 'jpeg');
      const w = Math.round(doc.width * scale);
      const h = Math.round(doc.height * scale);
      note.textContent =
        format === 'png'
          ? `${w} × ${h} px. PNG keeps every detail${doc.paper.visible ? '' : ' and the transparent background'}: best for art.`
          : `${w} × ${h} px. JPEG is smaller, good for quick sharing${doc.paper.visible ? '' : ' (transparent areas become white)'}.`;
    };
    info();
    const actions = document.createElement('div');
    actions.className = 'st-actions';
    const share = document.createElement('button');
    share.className = 'st-chip-btn primary';
    share.textContent = 'Share or save';
    share.addEventListener('click', async () => {
      share.disabled = true;
      share.textContent = 'Preparing…';
      try {
        const flat = this.compositor.flatten(scale, doc.paper.visible, format === 'jpeg' && !doc.paper.visible ? '#ffffff' : null);
        const blob = await encode(flat, format, quality);
        const result = await shareOrSave(blob, fileName(doc.name, format === 'png' ? 'png' : 'jpg'));
        if (result !== 'cancelled') this.toast(result === 'shared' ? 'Shared' : 'Saved to your downloads');
      } catch {
        this.toast('Could not export this time');
      } finally {
        share.disabled = false;
        share.textContent = 'Share or save';
      }
    });
    actions.appendChild(share);
    wrap.append(preview, formatRow, sizeRow, qualityRow, note, actions);
    this.sheet.open('export', 'Export', wrap);
  }

  private openMore(): void {
    const wrap = document.createElement('div');
    wrap.className = 'st-actions';
    wrap.style.flexDirection = 'column';
    const item = (label: string, run: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'st-chip-btn';
      b.style.textAlign = 'left';
      b.textContent = label;
      b.addEventListener('click', run);
      return b;
    };
    wrap.append(
      item(`Pen-only mode: ${this.prefs.penOnly ? 'on' : 'off'}`, () => {
        this.prefs.penOnly = !this.prefs.penOnly;
        this.input.penOnly = this.prefs.penOnly;
        savePrefs(this.prefs);
        this.openMore();
        this.openMore();
      }),
      item('Fit to screen', () => {
        this.fit();
        this.sheet.close();
      }),
      item('Hide interface (tap the eye to bring it back)', () => {
        this.sheet.close();
        this.toggleUi();
      }),
      item('Paper', () => this.openPaper()),
      item('Rename painting', () => {
        const name = window.prompt('Painting name', this.doc.name);
        if (name?.trim()) {
          this.doc.name = name.trim().slice(0, 60);
          this.dirtyMeta = true;
          this.scheduleSave();
        }
      }),
      item('Gestures and tips', () => this.openHelp()),
    );
    const info = document.createElement('p');
    info.className = 'st-note';
    info.textContent = `${this.doc.width} × ${this.doc.height} px · ${this.doc.layers.length} ${this.doc.layers.length === 1 ? 'layer' : 'layers'} · ${this.history.depth} steps to undo`;
    wrap.appendChild(info);
    this.sheet.open('more', 'More', wrap);
  }

  private openHelp(): void {
    const tips: [string, string][] = [
      ['One finger / pen', 'Paint'],
      ['Two fingers', 'Pinch to zoom and rotate, drag to move'],
      ['Two-finger tap', 'Undo'],
      ['Three-finger tap', 'Redo'],
      ['Four-finger tap', 'Hide or show the interface'],
      ['Touch and hold', 'Pick a colour from the painting'],
      ['Tap the % button', 'Fit the painting to the screen'],
      ['Tap a tool twice', 'Choose its brush (smudge and eraser too)'],
      ['Pen-only mode', 'With a stylus, fingers only move the canvas'],
    ];
    const wrap = document.createElement('div');
    wrap.className = 'st-help';
    for (const [k, v] of tips) wrap.appendChild(html(`<div><b>${k}</b><span>${v}</span></div>`));
    this.sheet.open('help', 'Gestures and tips', wrap);
  }

  // ---------- Saving ----------

  private markLayer(id: string): void {
    this.dirtyLayers.add(id);
    this.scheduleSave();
  }

  private markAll(): void {
    for (const layer of this.doc.layers) this.dirtyLayers.add(layer.id);
    this.dirtyMeta = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 1500);
  }

  private hidden = (e: Event): void => {
    if (e.type === 'pagehide' || document.visibilityState === 'hidden') void this.save();
  };

  meta(thumb?: Blob): PaintingMeta {
    const doc = this.doc;
    return {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      paper: { ...doc.paper },
      layers: doc.layers.map(metaOf),
      active: doc.active,
      created: this.options.created,
      updated: Date.now(),
      thumb,
    };
  }

  /** Saves changed layers (as PNG), the painting's details and a thumbnail. */
  async save(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    if (this.saving) await this.saving;
    if (!this.dirtyLayers.size && !this.dirtyMeta) return;
    const dirty = [...this.dirtyLayers];
    this.dirtyLayers.clear();
    this.dirtyMeta = false;
    this.saving = (async () => {
      const changed = new Map<string, Blob>();
      for (const id of dirty) {
        const layer = this.doc.layers.find((l) => l.id === id);
        if (layer) changed.set(id, await canvasBlob(layer.canvas));
      }
      const thumbCanvas = this.compositor.flatten(Math.min(1, 360 / Math.max(this.doc.width, this.doc.height)));
      const thumb = await canvasBlob(thumbCanvas, 'image/png');
      const meta = this.meta(thumb);
      if (this.openedAs) {
        await saveVersion(this.openedAs.meta, this.openedAs.layers);
        this.openedAs = null;
        this.lastVersion = Date.now();
      }
      await savePainting(meta, changed, this.savedLayerIds);
      this.savedLayerIds = meta.layers.map((l) => l.id);
      // Every so often, keep a version to go back to.
      if (Date.now() - this.lastVersion > VERSION_EVERY) {
        this.lastVersion = Date.now();
        const all = new Map<string, Blob>();
        for (const layer of this.doc.layers) all.set(layer.id, changed.get(layer.id) ?? (await canvasBlob(layer.canvas)));
        await saveVersion(meta, all);
      }
    })()
      .catch(() => {
        for (const id of dirty) this.dirtyLayers.add(id);
        this.toast('Could not save. Is the phone out of space?', 2600);
      })
      .finally(() => {
        this.saving = null;
      });
    await this.saving;
  }

  async exit(): Promise<void> {
    if (this.exiting) return;
    this.exiting = true;
    this.sheet.close();
    await this.save();
    this.destroy();
    this.options.onExit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.hidden);
    this.compositor.dispose();
    this.el.remove();
  }
}

/** A vertical slider on the edge of the screen (brush size, opacity), 0..1. */
class VSlider {
  readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly thumb: HTMLElement;
  private value = 0.5;

  constructor(label: string, onChange: (value: number, done: boolean) => void) {
    this.el = document.createElement('div');
    this.el.className = 'st-vslider';
    this.el.setAttribute('aria-label', label);
    this.fill = document.createElement('div');
    this.fill.className = 'fill';
    this.thumb = document.createElement('div');
    this.thumb.className = 'thumb';
    const text = document.createElement('label');
    text.textContent = label;
    this.el.append(this.fill, this.thumb, text);
    const pick = (e: PointerEvent, done: boolean): void => {
      const rect = this.el.getBoundingClientRect();
      this.set(1 - (e.clientY - rect.top - 9) / (rect.height - 18));
      onChange(this.value, done);
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      pick(e, false);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.el.hasPointerCapture(e.pointerId)) pick(e, false);
    });
    this.el.addEventListener('pointerup', (e) => pick(e, true));
  }

  set(value: number): void {
    this.value = Math.min(1, Math.max(0, value));
    const h = 150 - 18;
    this.thumb.style.top = `${(1 - this.value) * h}px`;
    this.fill.style.height = `${this.value * (150 - 8)}px`;
  }
}
