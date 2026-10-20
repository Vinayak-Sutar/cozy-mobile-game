import { type DocPoint, BrushEngine, type StrokeSetup, type ToolMode } from './brush/engine';
import { floodFill } from './brush/fill';
import { type Brush, brushById, customBrushes, isCustom, MY_SET } from './brush/presets';
import { recognise, shapeName, shapePoints, smoothPath } from './brush/quickshape';
import { symmetryGuides, symmetryTransforms } from './brush/symmetry';
import { hexToRgb, rgbToHex } from './color';
import { type BlendMode, context, makeCanvas, memoryBudget, metaOf, newId, type PaintingDoc, type PaperTexture } from './doc/document';
import { ActionEdit, History, TileEdit } from './doc/history';
import { canvasBlob, type PaintingMeta, savePainting, saveVersion } from './doc/library';
import { encode, fileName, type ImageFormat, shareOrSave } from './export';
import { type InputPoint, StudioInput } from './input/input';
import { pushRecent, saveCustomBrushes, savePrefs, type StudioPrefs } from './tools';
import { BrushEditor } from './ui/brushEditor';
import { Guide } from './ui/guide';
import { BrushPanel, brushPreview, darkBackdrop } from './ui/brushPanel';
import { ColorPanel } from './ui/colorPanel';
import { button, html, icons } from './ui/icons';
import { LayersPanel } from './ui/layersPanel';
import { ReferenceWindow } from './ui/reference';
import { Sheet } from './ui/sheet';
import { VSlider } from './ui/vslider';
import { FRAME_SIZE, TimelapseRecorder } from './timelapse/recorder';
import { TimelapsePanel } from './ui/timelapsePanel';
import { ToolsPanel } from './ui/toolsPanel';
import { WetLayer, type WetStroke } from './wet/wetLayer';
import { Compositor } from './view/compositor';
import { Viewport } from './view/viewport';

/** Brush sizes are stored for a canvas this many pixels across, and scaled to each painting. */
const REFERENCE = 2000;
const MIN_SIZE = 1;
const MAX_SIZE = 600;
const VERSION_EVERY = 10 * 60 * 1000;
/** Live watercolour dries by itself after this many seconds without a touch. */
const DRY_AFTER = 7;

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
  private toolsPanel: ToolsPanel | null = null;
  private readonly reference: ReferenceWindow;
  private referenceTimer = 0;
  private readonly recorder: TimelapseRecorder;
  private timelapsePanel: TimelapsePanel | null = null;
  private tipCard: HTMLElement | null = null;
  /** The tool for the stroke under way (a stylus's eraser end erases whatever tool is chosen). */
  private strokeMode: ToolMode = 'paint';
  /** The brush outline that follows a mouse or a hovering stylus. */
  private readonly cursor: HTMLElement;
  private hover: { x: number; y: number } | null = null;
  private tipTimer = 0;
  private strokesDone = 0;
  private snapsDone = 0;

  // The stroke in progress, kept so QuickShape and predictive stroke can redraw it.
  private strokeSetup: StrokeSetup | null = null;
  private rawPoints: DocPoint[] = [];
  private snapped = false;
  /** The fill bucket is in use instead of a brush: a tap fills. */
  private fillActive = false;
  private fillAt: InputPoint | null = null;

  // Live watercolour: the flowing paint, which layer it's on, and the stroke in progress.
  private wet: WetLayer | null = null;
  private wetLayerId: string | null = null;
  private wetStroke: WetStroke | null = null;
  /** The layer as it was before re-wetting (so undo and drying can put it back). */
  private rewetEdit: TileEdit | null = null;
  private rewetAt = 0;
  private lastFrame = performance.now();
  private readonly wetBar: HTMLElement;
  /** Frozen watercolour doesn't move, so it's only redrawn when something changes. */
  private wetDirty = true;
  private wetStatus = '';

  // Interface bits that change.
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly zoomLabel: HTMLElement;
  private readonly brushBtn: HTMLButtonElement;
  private readonly well: HTMLButtonElement;
  private readonly modeBtns: Record<ToolMode, HTMLButtonElement>;
  private readonly toolsBtn: HTMLButtonElement;
  private readonly symHandle: HTMLElement;
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
    this.zoomLabel.title = 'Fit to screen (Ctrl+0)';
    this.zoomLabel.addEventListener('click', () => this.fit());
    this.undoBtn = button(icons.undo, 'Undo');
    this.undoBtn.title = 'Undo (Ctrl+Z)';
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn = button(icons.redo, 'Redo');
    this.redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    this.redoBtn.addEventListener('click', () => this.redo());
    const layers = button(icons.layers, 'Layers');
    layers.title = 'Layers (L)';
    layers.addEventListener('click', () => this.openLayers());
    const share = button(icons.share, 'Export and share');
    share.title = 'Export and share (Ctrl+E)';
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
    this.modeBtns.paint.title = 'Paint (B)';
    this.modeBtns.smudge.title = 'Smudge (S)';
    this.modeBtns.erase.title = 'Erase (E)';
    for (const mode of ['paint', 'smudge', 'erase'] as ToolMode[]) {
      this.modeBtns[mode].addEventListener('click', () => {
        if (this.prefs.mode === mode && !this.fillActive) this.openBrushes();
        else this.setMode(mode);
      });
    }
    this.toolsBtn = button(icons.tools, 'Tools: symmetry, fill, shapes, reference');
    this.toolsBtn.addEventListener('click', () => this.openTools());
    this.well = document.createElement('button');
    this.well.className = 'st-well';
    this.well.setAttribute('aria-label', 'Colours');
    this.well.addEventListener('click', () => this.openColors());
    bottom.append(this.brushBtn, this.modeBtns.paint, this.modeBtns.smudge, this.modeBtns.erase, this.toolsBtn, this.well);

    this.loupe = document.createElement('div');
    this.loupe.className = 'st-loupe st-hidden';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'st-toast';
    this.sizePreview = document.createElement('div');
    this.sizePreview.className = 'st-size-preview st-hidden';
    this.showUi = button(icons.eye, 'Show interface', 'st-btn st-show-ui st-hidden');
    this.showUi.addEventListener('click', () => this.toggleUi());
    this.symHandle = document.createElement('div');
    this.symHandle.className = 'st-sym-handle st-hidden';
    this.symHandle.setAttribute('aria-label', 'Symmetry centre');
    this.dragCentre(this.symHandle);
    this.el.append(this.symHandle, top, side, bottom, this.loupe, this.toastEl, this.sizePreview, this.showUi);
    this.reference = new ReferenceWindow(this.el, (c) => this.pickColor(c), () => this.toolsPanel?.render());
    this.recorder = new TimelapseRecorder(
      doc.id,
      () => this.framePicture(),
      () => !this.engine.active && !this.wetStroke,
    );
    this.recorder.enabled = prefs.timelapse;
    this.wetBar = document.createElement('div');
    this.wetBar.className = 'st-wetbar st-hidden';
    this.el.appendChild(this.wetBar);
    this.sheet = new Sheet(this.el);

    this.input = new StudioInput(this.canvas, {
      strokeStart: (p, pen, eraser) => this.strokeStart(p, pen, eraser),
      strokeMove: (points) => this.strokeMove(points),
      strokeEnd: () => this.strokeEnd(),
      strokeCancel: () => this.strokeCancel(),
      strokeHold: () => this.quickShape(),
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
    // Mouse, trackpad and keyboard.
    this.cursor = document.createElement('div');
    this.cursor.className = 'st-cursor st-hidden';
    this.el.appendChild(this.cursor);
    this.canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.canvas.addEventListener('pointermove', this.hoverMove);
    this.canvas.addEventListener('pointerdown', this.hoverMove);
    this.canvas.addEventListener('pointerleave', this.hoverLeave);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.keyReset);
    document.addEventListener('visibilitychange', this.hidden);
    window.addEventListener('pagehide', this.hidden);
    this.resize();
    this.fit();
    this.updateTool();
    this.updateButtons();
    if (options.loaded) this.openedAs = { meta: this.meta(), layers: options.loaded };
    else {
      this.markAll();
      // The time-lapse starts with the blank paper.
      this.recorder.changed();
    }
    if (!prefs.seenHelp) {
      prefs.seenHelp = true;
      savePrefs(prefs);
      window.setTimeout(() => this.startGuide(), 400);
    }
    this.loop();
  }

  // ---------- Guide and tips ----------

  /** The first-painting guide: one control at a time. */
  private startGuide(): void {
    this.sheet.close();
    const at = (selector: string) => () => this.el.querySelector(selector);
    new Guide(
      this.el,
      [
        { title: 'Welcome to Drift Studio', text: 'Paint with a finger or a stylus. Everything saves by itself as you go, and the gallery keeps earlier versions too.' },
        matchMedia('(hover: hover) and (pointer: fine)').matches
          ? { title: 'Move the painting', text: 'Scroll to move it, Ctrl + scroll (or pinch a trackpad) to zoom, Alt + scroll to turn it. Ctrl+Z undoes; press ? for every shortcut.' }
          : { title: 'Move the painting', text: 'Pinch with two fingers to zoom and turn it, and drag to move. Tap with two fingers to undo, three to redo.' },
        { target: at('.st-brush-btn'), title: 'Brushes', text: '35 brushes, from pencils and inks to oil paint and live watercolour. Edit any brush, or make your own.' },
        { target: at('.st-side'), title: 'Size and opacity', text: 'Slide to change how big and how strong the brush is. Each brush remembers its own size.' },
        { target: at('.st-well'), title: 'Colours', text: 'A colour wheel, sliders, harmonies and palettes. Touch and hold the painting to pick up a colour from it.' },
        { target: () => this.toolsBtn, title: 'Tools', text: 'Symmetry and kaleidoscope, the fill bucket, QuickShape and smoothing, and a reference picture.' },
        { target: at('[aria-label="Layers"]'), title: 'Layers', text: 'Paint on separate layers, then change their opacity and blend, hide them or merge them.' },
        { target: at('[aria-label="Export and share"]'), title: 'Share', text: 'Save a PNG or JPEG, or make a time-lapse video of your painting growing.' },
      ],
      () => this.render(),
    );
  }

  /** A one-time tip, shown above the tools (never again once seen). */
  private tip(id: string, text: string): void {
    if (this.prefs.seenTips.includes(id)) return;
    this.prefs.seenTips.push(id);
    savePrefs(this.prefs);
    this.tipCard?.remove();
    const card = document.createElement('div');
    card.className = 'st-tipcard';
    const p = document.createElement('p');
    p.textContent = text;
    const ok = document.createElement('button');
    ok.className = 'st-chip-btn';
    ok.textContent = 'Got it';
    const close = (): void => {
      window.clearTimeout(this.tipTimer);
      card.remove();
      if (this.tipCard === card) this.tipCard = null;
    };
    ok.addEventListener('click', close);
    card.append(p, ok);
    this.el.appendChild(card);
    this.tipCard = card;
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(close, 10000);
  }

  // ---------- Frame ----------

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const wet = this.wet;
    if (wet?.active) {
      wet.step(dt);
      // Dries by itself once you've left it alone for a while.
      if (!this.wetStroke && wet.quiet > DRY_AFTER) this.dryWet();
      else {
        if (!wet.frozen || this.wetStroke || this.wetDirty) {
          wet.render();
          this.needsRender = true;
          this.wetDirty = false;
        }
        this.updateWetBar();
      }
    }
    if (!this.needsRender && !this.engine.active) return;
    this.needsRender = false;
    this.engine.takeFrame();
    this.compositor.render(this.ctx, this.view, this.ratio, this.engine.live(), this.engine.area, wet?.active ? wet.canvas : null);
    this.drawGuides();
  };

  // ---------- Live watercolour ----------

  /** The wet layer for this painting, made the first time it's needed. */
  private wetFor(layerId: string): WetLayer | null {
    if (this.wet?.active && this.wetLayerId !== layerId) this.dryWet();
    this.wet ??= WetLayer.create(this.doc.width, this.doc.height);
    if (!this.wet) {
      this.toast('Live watercolour needs WebGL, which this browser has turned off', 3000);
      return null;
    }
    this.wetLayerId = layerId;
    return this.wet;
  }

  /** Dries the live watercolour into its layer, as one undo step. */
  private dryWet(): void {
    const wet = this.wet;
    if (!wet?.active) {
      this.wetBar.classList.add('st-hidden');
      return;
    }
    if (this.wetStroke) {
      wet.end();
      this.wetStroke = null;
    }
    const layer = this.doc.layers.find((l) => l.id === this.wetLayerId) ?? this.doc.activeLayer;
    const dried = wet.dry();
    const edit = this.rewetEdit ?? new TileEdit(layer, 'Watercolour');
    this.rewetEdit = null;
    if (dried) {
      edit.capture(...dried.rect);
      const ctx = layer.ctx;
      ctx.save();
      ctx.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(dried.canvas, 0, 0, this.doc.width, this.doc.height);
      ctx.restore();
    }
    if (!edit.empty) {
      this.history.push(edit);
      this.markLayer(layer.id);
    }
    this.wetLayerId = null;
    this.wetBar.classList.add('st-hidden');
    this.compositor.invalidate();
    this.updateButtons();
    this.pictureChanged();
    this.render();
  }

  /** Re-wet: the active layer's dry paint becomes flowing watercolour again. */
  private rewet(): void {
    const layer = this.doc.activeLayer;
    const wet = this.wetFor(layer.id);
    if (!wet) return;
    const edit = this.rewetEdit ?? new TileEdit(layer, 'Watercolour');
    edit.capture(0, 0, this.doc.width, this.doc.height);
    this.rewetEdit = edit;
    wet.rewet(layer.canvas);
    this.wetDirty = true;
    this.rewetAt = wet.undoDepth;
    layer.ctx.clearRect(0, 0, this.doc.width, this.doc.height);
    this.compositor.invalidate();
    this.updateWetBar(true);
    this.toast('The layer is wet again: its paint can flow');
    this.render();
  }

  /** The bar that shows while paint is wet: freeze, drips, re-wet and dry. */
  private updateWetBar(rebuild = false): void {
    const wet = this.wet;
    if (!wet?.active) {
      this.wetBar.classList.add('st-hidden');
      return;
    }
    const wasHidden = this.wetBar.classList.contains('st-hidden');
    this.wetBar.classList.remove('st-hidden');
    if (wasHidden || rebuild) {
      const chip = (label: string, on: boolean, run: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.className = `st-wet-chip${on ? ' on' : ''}`;
        b.textContent = label;
        b.addEventListener('click', () => {
          run();
          this.updateWetBar(true);
        });
        return b;
      };
      const status = document.createElement('span');
      status.className = 'st-wet-status';
      this.wetBar.replaceChildren(
        status,
        chip(wet.frozen ? 'Frozen' : 'Freeze', wet.frozen, () => {
          wet.frozen = !wet.frozen;
          this.wetDirty = true;
          this.toast(wet.frozen ? 'Frozen: the paint stays wet but stops moving' : 'Flowing again');
        }),
        chip('Drips', wet.dripping, () => {
          wet.setDrips(!wet.dripping);
          this.toast(wet.dripping ? 'Drips on: wet paint runs down the page' : 'Drips off');
        }),
        chip('Re-wet layer', false, () => this.rewet()),
        chip('Dry now', false, () => this.dryWet()),
      );
    }
    const status = this.wetBar.querySelector('.st-wet-status') as HTMLElement | null;
    const left = Math.max(0, Math.ceil(DRY_AFTER - wet.quiet));
    const text = this.wetStroke ? 'Wet' : `Wet · dries in ${left}s`;
    // Only touch the page when the words change (this runs every frame).
    if (status && (text !== this.wetStatus || wasHidden || rebuild)) {
      status.textContent = text;
      this.wetStatus = text;
    }
  }

  /** Dashed symmetry lines through the centre. */
  private drawGuides(): void {
    const sym = this.prefs.symmetry;
    if (sym.mode === 'off' || this.el.classList.contains('st-chrome-hidden')) return;
    const ctx = this.ctx;
    const { angles, rays } = symmetryGuides({ ...sym, x: 0, y: 0 });
    const cx = sym.cx * this.doc.width;
    const cy = sym.cy * this.doc.height;
    const reach = Math.hypot(this.doc.width, this.doc.height);
    ctx.setTransform(...this.view.matrix(this.ratio));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.doc.width, this.doc.height);
    ctx.clip();
    ctx.lineWidth = 1.5 / this.view.scale;
    ctx.setLineDash([8 / this.view.scale, 6 / this.view.scale]);
    ctx.strokeStyle = 'rgba(122, 167, 255, 0.75)';
    ctx.beginPath();
    for (const a of angles) {
      ctx.moveTo(rays ? cx : cx - Math.cos(a) * reach, rays ? cy : cy - Math.sin(a) * reach);
      ctx.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Keeps the round centre handle over the symmetry centre. */
  private placeHandle(): void {
    const sym = this.prefs.symmetry;
    this.symHandle.classList.toggle('st-hidden', sym.mode === 'off');
    if (sym.mode === 'off') return;
    const [x, y] = this.view.toScreen(sym.cx * this.doc.width, sym.cy * this.doc.height);
    this.symHandle.style.transform = `translate(${x}px, ${y}px)`;
  }

  private dragCentre(handle: HTMLElement): void {
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = this.el.getBoundingClientRect();
      const [x, y] = this.view.toDoc(e.clientX - rect.left, e.clientY - rect.top);
      // Snaps to the middle when close, so it's easy to put back.
      let cx = Math.min(1, Math.max(0, x / this.doc.width));
      let cy = Math.min(1, Math.max(0, y / this.doc.height));
      const near = 12 / (this.view.scale * Math.max(this.doc.width, this.doc.height));
      if (Math.abs(cx - 0.5) < near) cx = 0.5;
      if (Math.abs(cy - 0.5) < near) cy = 0.5;
      this.prefs.symmetry.cx = cx;
      this.prefs.symmetry.cy = cy;
      this.placeHandle();
      this.render();
    });
    const end = (): void => {
      if (!dragging) return;
      dragging = false;
      savePrefs(this.prefs);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

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
    this.placeHandle();
    this.placeCursor();
    this.render();
  }

  // ---------- Mouse, trackpad and keyboard ----------

  /**
   * Scrolling: two-finger trackpad scroll or the mouse wheel moves the
   * painting (Shift turns a wheel sideways); Ctrl or ⌘ + scroll, or a
   * trackpad pinch (which browsers send as Ctrl + scroll), zooms around the
   * pointer; Alt + scroll turns it.
   */
  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // About 1.2x per mouse-wheel notch; trackpad pinches send many small steps.
      this.view.zoomAt(Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.003), x, y);
    } else if (e.altKey) {
      this.view.rotateAt((dy || dx) * 0.003, x, y);
    } else if (e.shiftKey && !dx) {
      this.view.tx -= dy;
    } else {
      this.view.tx -= dx;
      this.view.ty -= dy;
    }
    this.viewChanged();
  };

  /** Keys typed into a text box or slider are theirs, not shortcuts. */
  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  private keyDown = (e: KeyboardEvent): void => {
    if (this.typing(e) || document.querySelector('.st-guide')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const centre = (): [number, number] => {
      const rect = this.canvas.getBoundingClientRect();
      return this.hover ? [this.hover.x, this.hover.y] : [rect.width / 2, rect.height / 2];
    };
    let handled = true;
    if (key === ' ') {
      if (!this.input.spaceHeld) {
        this.input.spaceHeld = true;
        this.canvas.style.cursor = 'grab';
        this.cursor.classList.add('st-hidden');
      }
    } else if (ctrl && key === 'z') {
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (ctrl && key === 'y') {
      this.redo();
    } else if (ctrl && key === 's') {
      void this.save().then(() => this.toast('Saved'));
    } else if (ctrl && key === 'e') {
      this.openExport();
    } else if (ctrl && (key === '0' || key === ')')) {
      this.fit();
    } else if (ctrl && key === '1') {
      this.view.zoomTo(1, ...centre());
      this.viewChanged();
    } else if ((ctrl && (key === '=' || key === '+')) || (!ctrl && (key === '+' || key === '='))) {
      this.view.zoomAt(1.25, ...centre());
      this.viewChanged();
    } else if ((ctrl && (key === '-' || key === '_')) || (!ctrl && (key === '-' || key === '_'))) {
      this.view.zoomAt(0.8, ...centre());
      this.viewChanged();
    } else if (ctrl) {
      handled = false;
    } else if (key === 'b') {
      this.setMode('paint');
    } else if (key === 'e') {
      this.setMode('erase');
    } else if (key === 's') {
      this.setMode('smudge');
    } else if (key === 'g') {
      this.fillActive = !this.fillActive;
      this.updateTool();
      this.toast(this.fillActive ? 'Fill bucket: click an area to fill it' : 'Fill bucket off');
    } else if (key === '[' || key === ']') {
      this.nudgeSize(key === ']' ? 1.18 : 1 / 1.18);
    } else if (/^[0-9]$/.test(key)) {
      // 1 = 10% … 9 = 90%, 0 = 100%, like most art apps.
      const opacity = key === '0' ? 1 : Number(key) / 10;
      this.setOpacity(opacity, true);
      this.updateTool();
      this.toast(`Opacity ${Math.round(opacity * 100)}%`);
    } else if (key === ',' || key === '.') {
      this.view.rotateAt(((key === '.' ? 1 : -1) * Math.PI) / 12, ...centre(), true);
      this.viewChanged();
    } else if (key === 'r') {
      this.view.rotateAt(-this.view.rotation, ...centre());
      this.viewChanged();
    } else if (key === 'l') {
      this.openLayers();
    } else if (key === 'tab' && (e.target === document.body || e.target === this.canvas)) {
      // Only when nothing has focus: keyboard users still need Tab to move between buttons.
      this.toggleUi();
    } else if (key === 'escape') {
      if (this.sheet.openId) this.sheet.close();
      else if (this.fillActive) {
        this.fillActive = false;
        this.updateTool();
      } else handled = false;
    } else if (key === '?' || (key === '/' && e.shiftKey)) {
      this.openHelp();
    } else {
      handled = false;
    }
    if (handled) e.preventDefault();
  };

  private keyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      e.preventDefault();
      this.keyReset();
    }
  };

  private keyReset = (): void => {
    this.input.spaceHeld = false;
    this.canvas.style.cursor = '';
    this.placeCursor();
  };

  /** [ and ]: brush size down or up a step. */
  private nudgeSize(factor: number): void {
    const tool = this.prefs.tools[this.prefs.mode];
    tool.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, tool.size * factor));
    savePrefs(this.prefs);
    this.updateTool();
    this.placeCursor();
  }

  /** The brush outline follows a mouse or a hovering stylus, so you can see the brush before painting. */
  private hoverMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.hoverLeave();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.hover = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.placeCursor();
  };

  private hoverLeave = (): void => {
    this.hover = null;
    this.cursor.classList.add('st-hidden');
  };

  private placeCursor(): void {
    const hover = this.hover;
    if (!hover || this.input.spaceHeld || this.fillActive) {
      this.cursor.classList.add('st-hidden');
      if (this.fillActive && hover && !this.input.spaceHeld) this.canvas.style.cursor = 'crosshair';
      return;
    }
    const mode = this.prefs.mode;
    const size = this.prefs.tools[mode].size * this.docScale * this.view.scale;
    // Tiny brushes get a plain crosshair; bigger ones an outline of their real size.
    if (size < 5) {
      this.cursor.classList.add('st-hidden');
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    this.canvas.style.cursor = 'none';
    this.cursor.classList.remove('st-hidden');
    this.cursor.style.width = this.cursor.style.height = `${size}px`;
    this.cursor.style.transform = `translate(${hover.x - size / 2}px, ${hover.y - size / 2}px)`;
  }

  // ---------- Painting ----------

  private toDoc(p: InputPoint): DocPoint {
    const [x, y] = this.view.toDoc(p.x, p.y);
    return { x, y, pressure: p.pressure, tiltX: p.tiltX, tiltY: p.tiltY, t: p.t };
  }

  private get docScale(): number {
    return Math.max(this.doc.width, this.doc.height) / REFERENCE;
  }

  private strokeStart(p: InputPoint, _pen: boolean, eraser = false): void {
    this.sheet.close();
    if (this.fillActive) {
      // Fill on lift, so a two-finger gesture that starts with one finger doesn't fill.
      this.fillAt = p;
      return;
    }
    const layer = this.doc.activeLayer;
    if (!layer.visible) {
      this.toast('This layer is hidden');
      return;
    }
    const mode: ToolMode = eraser ? 'erase' : this.prefs.mode;
    this.strokeMode = mode;
    const tool = this.prefs.tools[mode];
    const brush = brushById(tool.brush);
    const sym = this.prefs.symmetry;
    const symmetry = symmetryTransforms({ mode: sym.mode, count: sym.count, x: sym.cx * this.doc.width, y: sym.cy * this.doc.height });
    if (mode === 'paint' && brush.live) {
      const wet = this.wetFor(layer.id);
      if (!wet) return;
      this.wetStroke = { kind: brush.live, color: this.prefs.color, size: tool.size * this.docScale, strength: tool.opacity, symmetry };
      this.tip('wet', 'Live watercolour stays wet for a few seconds: brush clean water through it, let it drip, or tap Dry now. It dries by itself when you stop.');
      const [x, y] = this.view.toDoc(p.x, p.y);
      wet.begin({ x, y, pressure: p.pressure ?? 1, t: p.t }, this.wetStroke);
      this.updateWetBar();
      this.updateButtons();
      this.render();
      return;
    }
    // Any other tool puts the wet paint down first.
    this.dryWet();
    this.strokeSetup = {
      brush,
      size: tool.size * this.docScale,
      opacity: tool.opacity * brush.opacity,
      color: this.prefs.color,
      mode,
      viewScale: this.view.scale,
      symmetry,
    };
    const first = this.toDoc(p);
    this.rawPoints = [first];
    this.snapped = false;
    this.edit = new TileEdit(layer, mode === 'erase' ? 'Erase' : mode === 'smudge' ? 'Smudge' : 'Paint');
    this.engine.begin(layer, this.strokeSetup, first, this.edit);
    if (this.engine.live()) this.compositor.beginStroke();
    this.render();
  }

  private strokeMove(points: InputPoint[]): void {
    if (this.wetStroke && this.wet) {
      this.wet.move(
        points.map((p) => {
          const [x, y] = this.view.toDoc(p.x, p.y);
          return { x, y, pressure: p.pressure ?? 1, t: p.t };
        }),
        this.wetStroke,
      );
      return;
    }
    if (!this.engine.active || this.snapped) return;
    const doc = points.map((p) => this.toDoc(p));
    if (this.rawPoints.length < 20000) this.rawPoints.push(...doc);
    this.engine.add(doc);
  }

  /** Throws away the stroke so far and paints it again along `points` (for QuickShape and predictive stroke). */
  private redrawStroke(points: DocPoint[]): void {
    const setup = this.strokeSetup;
    if (!setup || !this.engine.active || points.length < 2) return;
    const layer = this.doc.activeLayer;
    const label = this.edit?.label ?? 'Paint';
    this.engine.cancel();
    // Smudge and wet paint already changed the layer: put it back first.
    if (this.edit && !this.edit.empty) this.edit.undo();
    this.edit = new TileEdit(layer, label);
    this.engine.begin(layer, { ...setup, brush: { ...setup.brush, streamline: 0 } }, points[0], this.edit);
    this.engine.add(points.slice(1));
    if (this.engine.live()) this.compositor.beginStroke();
    this.render();
  }

  /** Held still at the end of a stroke: snap it to a clean line or shape. */
  private quickShape(): void {
    if (!this.prefs.quickShape || !this.engine.active || this.snapped || this.strokeMode === 'smudge') return;
    const raw = this.rawPoints;
    const shape = recognise(raw, 1 / this.view.scale);
    if (!shape) return;
    const step = Math.max(0.5, 2 / this.view.scale);
    const pts = shapePoints(shape, step);
    // A steady, even pressure (the average of the stroke) and an unhurried pace.
    const pressures = raw.map((p) => p.pressure).filter((p): p is number => p !== null);
    const pressure = pressures.length ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null;
    const t0 = raw[0].t;
    const dt = (step * this.view.scale) / 0.3;
    this.redrawStroke(pts.map((p, i) => ({ x: p.x, y: p.y, pressure, tiltX: raw[0].tiltX, tiltY: raw[0].tiltY, t: t0 + i * dt })));
    this.snapped = true;
    this.snapsDone++;
    navigator.vibrate?.(12);
    this.toast(`Snapped to ${shapeName(shape)}`);
  }

  private strokeEnd(): void {
    if (this.fillActive) {
      const at = this.fillAt;
      this.fillAt = null;
      if (at) this.fill(at);
      return;
    }
    if (this.wetStroke) {
      this.wet?.end();
      this.wetStroke = null;
      if (this.strokeMode === 'paint') {
        pushRecent(this.prefs, this.prefs.color);
        savePrefs(this.prefs);
      }
      return;
    }
    if (!this.engine.active) return;
    // Predictive stroke: tidy the wobbles of the whole line before it's put down.
    const strength = this.prefs.predictive;
    if (strength > 0 && !this.snapped && this.strokeMode !== 'smudge' && this.rawPoints.length > 6) {
      this.redrawStroke(smoothPath(this.rawPoints, (strength * 16) / this.view.scale));
    }
    this.engine.end();
    this.strokeSetup = null;
    this.rawPoints = [];
    const edit = this.edit;
    this.edit = null;
    if (edit && !edit.empty) {
      this.history.push(edit);
      this.markLayer(edit.layer.id);
      this.strokesDone++;
      if (this.strokesDone === 12 && !this.snapsDone && this.prefs.quickShape) {
        this.tip('quickshape', 'Tip: draw a line, circle or box and hold still at the end. It snaps to a clean shape (QuickShape).');
      }
      if (this.strokeMode === 'paint') {
        pushRecent(this.prefs, this.prefs.color);
        savePrefs(this.prefs);
      }
    }
    this.pictureChanged();
    this.render();
  }

  /** The fill bucket: fills the area under `p` on the active layer. */
  private fill(p: InputPoint): void {
    this.dryWet();
    const layer = this.doc.activeLayer;
    if (!layer.visible) {
      this.toast('This layer is hidden');
      return;
    }
    const [x, y] = this.view.toDoc(p.x, p.y);
    const { width, height } = this.doc;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const source = this.prefs.fillSample === 'layer' ? layer.canvas : this.compositor.flatten(1, false);
    const image = context(source).getImageData(0, 0, width, height);
    const result = floodFill(image, x, y, this.prefs.fillTolerance, 1);
    if (!result) return;
    if (result.width * result.height > width * height * 0.98 && this.prefs.fillSample === 'all') this.toast('Filled the whole canvas: is there a gap in the outline?', 2400);
    const patch = makeCanvas(result.width, result.height);
    const pctx = context(patch);
    const out = pctx.createImageData(result.width, result.height);
    const [r, g, b] = hexToRgb(this.prefs.color);
    for (let i = 0; i < result.mask.length; i++) {
      if (!result.mask[i]) continue;
      out.data[i * 4] = r;
      out.data[i * 4 + 1] = g;
      out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = 255;
    }
    pctx.putImageData(out, 0, 0);
    const edit = new TileEdit(layer, 'Fill');
    edit.capture(result.x, result.y, result.width, result.height);
    const ctx = layer.ctx;
    ctx.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
    ctx.globalAlpha = this.prefs.tools.paint.opacity;
    ctx.drawImage(patch, result.x, result.y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.history.push(edit);
    this.markLayer(layer.id);
    pushRecent(this.prefs, this.prefs.color);
    savePrefs(this.prefs);
    this.pictureChanged();
    this.render();
  }

  /** The painting changed: record a time-lapse frame, and refresh the reference window if it shows the painting. */
  private pictureChanged(): void {
    this.recorder.changed();
    if (this.reference.mode !== 'canvas') return;
    window.clearTimeout(this.referenceTimer);
    this.referenceTimer = window.setTimeout(() => this.showWholePainting(), 250);
  }

  /** The painting as it looks now, small, for a time-lapse frame. */
  private framePicture(): HTMLCanvasElement {
    const { width, height, paper } = this.doc;
    return this.compositor.flatten(Math.min(1, FRAME_SIZE / Math.max(width, height)), paper.visible, paper.visible ? null : '#ffffff');
  }

  private showWholePainting(): void {
    this.reference.showCanvas(this.compositor.flatten(Math.min(1, 700 / Math.max(this.doc.width, this.doc.height))));
  }

  private pickColor(color: string): void {
    this.prefs.previous = this.prefs.color;
    this.prefs.color = color;
    pushRecent(this.prefs, color);
    savePrefs(this.prefs);
    this.updateTool();
    this.colorPanel?.sync();
    this.toast('Colour picked');
  }

  private strokeCancel(): void {
    this.fillAt = null;
    if (this.wetStroke) {
      // A two-finger gesture started with one finger: take the touch back.
      this.wet?.undo();
      this.wet?.end();
      this.wetStroke = null;
      this.updateButtons();
      return;
    }
    if (!this.engine.active) return;
    this.strokeSetup = null;
    this.rawPoints = [];
    // Smudge already changed the layer: put it back.
    if (this.edit && !this.edit.empty) this.edit.undo();
    this.edit = null;
    this.engine.cancel();
    this.render();
  }

  private undo(): void {
    if (this.engine.active || this.wetStroke) return;
    const wet = this.wet;
    if (wet?.active && wet.canUndo) {
      wet.undo();
      // Undoing past a re-wet puts the layer's dry paint back.
      if (this.rewetEdit && wet.undoDepth < this.rewetAt) {
        this.rewetEdit.undo();
        this.rewetEdit = null;
        this.compositor.invalidate();
      }
      if (!wet.canUndo) wet.clearAll();
      this.wetDirty = true;
      this.toast('Undo watercolour');
      this.updateButtons();
      this.updateWetBar();
      this.render();
      return;
    }
    this.dryWet();
    const label = this.history.undo();
    this.toast(label ? `Undo ${label.toLowerCase()}` : 'Nothing to undo');
    this.afterHistory();
  }

  private redo(): void {
    if (this.engine.active || this.wetStroke) return;
    this.dryWet();
    const label = this.history.redo();
    this.toast(label ? `Redo ${label.toLowerCase()}` : 'Nothing to redo');
    this.afterHistory();
  }

  private afterHistory(): void {
    this.doc.active = Math.min(this.doc.active, this.doc.layers.length - 1);
    this.compositor.invalidate();
    this.markAll();
    this.layersPanel?.render();
    this.pictureChanged();
    this.render();
  }

  private eyedropper(x: number, y: number, phase: 'start' | 'move' | 'end'): void {
    const [dx, dy] = this.view.toDoc(x, y);
    const inside = dx >= 0 && dy >= 0 && dx < this.doc.width && dy < this.doc.height;
    const color = inside ? rgbToHex(...this.compositor.sample(dx, dy)) : this.prefs.color;
    if (phase === 'end') {
      this.loupe.classList.add('st-hidden');
      if (inside) this.pickColor(color);
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
    this.fillActive = false;
    this.prefs.mode = mode;
    if (mode === 'smudge') this.tip('smudge', 'Smudge drags paint like a wet finger. Tap Smudge again to choose its brush: any shape or texture works.');
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
    this.placeCursor();
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
    for (const m of Object.keys(this.modeBtns) as ToolMode[]) this.modeBtns[m].classList.toggle('on', m === mode && !this.fillActive);
    this.toolsBtn.classList.toggle('on', this.fillActive);
    this.toolsBtn.innerHTML = this.fillActive ? icons.fill : icons.tools;
    this.toolsBtn.classList.toggle('dot', this.prefs.symmetry.mode !== 'off');
    this.placeHandle();
    this.well.style.background = this.prefs.color;
    this.sizeSlider.set(Math.log(tool.size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE));
    this.opacitySlider.set(tool.opacity);
    // The brush's sample stroke in a little circle, and its name.
    const dot = document.createElement('canvas');
    dot.width = dot.height = 68;
    const dctx = dot.getContext('2d');
    if (dctx) {
      const color = mode === 'paint' ? this.prefs.color : '#55565f';
      const preview = brushPreview(brush, color);
      if (darkBackdrop(brush, color)) {
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
    this.undoBtn.disabled = !this.history.canUndo && !this.wet?.canUndo;
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

  private pickBrush(id: string): void {
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
  }

  private openBrushes(): void {
    const current = (): Brush => brushById(this.prefs.tools[this.prefs.mode].brush);
    this.brushPanel = new BrushPanel(
      this.prefs,
      {
        pick: (id) => this.pickBrush(id),
        edit: (brush) => this.openBrushEditor(brush, isCustom(brush.id)),
        create: () => this.openBrushEditor(current(), false),
      },
      current,
    );
    this.sheet.open('brushes', 'Brushes', this.brushPanel.el, () => (this.brushPanel = null));
  }

  /** Edits a brush. Built-in brushes are kept as they are: saving makes your own copy. */
  private openBrushEditor(brush: Brush, custom: boolean): void {
    const editor = new BrushEditor(brush, custom, this.prefs.mode === 'paint' ? this.prefs.color : '#55565f', {
      save: (b, asNew) => {
        const list = customBrushes().slice();
        const saved: Brush = { ...b, id: asNew ? `my-${newId()}` : b.id, set: MY_SET };
        const at = list.findIndex((x) => x.id === saved.id);
        if (at >= 0) list[at] = saved;
        else list.unshift(saved);
        if (!saveCustomBrushes(list)) this.toast('Could not keep the brush: storage is full', 2600);
        // Its new default size applies from now on.
        for (const mode of ['paint', 'smudge', 'erase'] as ToolMode[]) delete this.prefs.brushSizes[`${mode}:${saved.id}`];
        this.prefs.brushSet = MY_SET;
        this.prefs.tools[this.prefs.mode].brush = '';
        this.pickBrush(saved.id);
        this.toast(asNew ? 'Added to My brushes' : 'Brush saved');
        this.openBrushes();
      },
      remove: (id) => {
        saveCustomBrushes(customBrushes().filter((b) => b.id !== id));
        for (const mode of ['paint', 'smudge', 'erase'] as ToolMode[]) {
          if (this.prefs.tools[mode].brush === id) this.prefs.tools[mode].brush = 'round';
          delete this.prefs.brushSizes[`${mode}:${id}`];
        }
        savePrefs(this.prefs);
        this.updateTool();
        this.toast('Brush deleted');
        this.openBrushes();
      },
    });
    this.sheet.open('brush-edit', custom ? 'Edit brush' : 'Make your own brush', editor.el);
  }

  private openTools(): void {
    this.toolsPanel = new ToolsPanel(this.prefs, {
      symmetryChanged: () => {
        this.updateTool();
        this.render();
        if (this.prefs.symmetry.mode !== 'off') this.tip('symmetry', 'Drag the round handle on the canvas to move the centre of the symmetry.');
      },
      resetCentre: () => {
        this.prefs.symmetry.cx = 0.5;
        this.prefs.symmetry.cy = 0.5;
        savePrefs(this.prefs);
        this.placeHandle();
        this.render();
      },
      fill: (on) => {
        this.fillActive = on;
        this.updateTool();
        if (on) {
          this.sheet.close();
          this.toast('Tap an area to fill it');
          this.tip('fill', 'Fill looks at all layers, so you can colour in line art from a layer underneath. Tap a paint tool to stop filling.');
        }
      },
      fillActive: () => this.fillActive,
      assistChanged: () => {},
      openImage: (file) => {
        this.sheet.close();
        this.reference.showFile(file).catch(() => this.toast('That picture could not be opened'));
      },
      showCanvas: () => {
        this.sheet.close();
        this.showWholePainting();
      },
      closeReference: () => this.reference.close(),
      referenceOpen: () => this.reference.open,
    });
    this.sheet.open('tools', 'Tools', this.toolsPanel.el, () => (this.toolsPanel = null));
  }

  private openColors(): void {
    this.colorPanel = new ColorPanel(this.prefs, () => this.updateTool());
    this.sheet.open('colours', 'Colours', this.colorPanel.el, () => (this.colorPanel = null));
  }

  private openLayers(): void {
    this.dryWet();
    this.tip('layers', 'Tap a layer to paint on it. Each layer can be hidden, faded or blended without touching the others.');
    const doc = this.doc;
    const push = (label: string, undo: () => void, redo: () => void): void => {
      this.history.push(new ActionEdit(label, undo, redo));
    };
    const changed = (): void => {
      this.compositor.invalidate();
      this.markAll();
      this.layersPanel?.render();
      this.pictureChanged();
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
      this.pictureChanged();
      this.render();
      if (rerender) render();
    };
    render();
    this.sheet.open('paper', 'Paper', wrap, () => this.layersPanel?.render());
  }

  /** Share: a picture (PNG or JPEG), or a time-lapse video. */
  private openExport(tab: 'picture' | 'timelapse' = 'picture'): void {
    this.dryWet();
    this.timelapsePanel?.dispose();
    this.timelapsePanel = null;
    const body = tab === 'picture' ? this.picturePanel() : (this.timelapsePanel = new TimelapsePanel({ paintingId: this.doc.id, name: this.doc.name, recorder: this.recorder, toast: (t, ms) => this.toast(t, ms) })).el;
    const tabs = document.createElement('div');
    tabs.className = 'st-tabs';
    for (const [id, label] of [
      ['picture', 'Picture'],
      ['timelapse', 'Time-lapse'],
    ] as ['picture' | 'timelapse', string][]) {
      const b = document.createElement('button');
      b.className = `st-tab${tab === id ? ' active' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        if (id !== tab) {
          this.sheet.close();
          this.openExport(id);
        }
      });
      tabs.appendChild(b);
    }
    const wrap = document.createElement('div');
    wrap.append(tabs, body);
    this.sheet.open(`export-${tab}`, 'Share', wrap, () => {
      this.timelapsePanel?.dispose();
      this.timelapsePanel = null;
    });
  }

  private picturePanel(): HTMLElement {
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
    return wrap;
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
      item(`Record time-lapse: ${this.prefs.timelapse ? 'on' : 'off'}`, () => {
        this.prefs.timelapse = !this.prefs.timelapse;
        this.recorder.enabled = this.prefs.timelapse;
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
      item('Show the guide again', () => this.startGuide()),
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
      ['Draw, then hold still', 'QuickShape: snaps to a line, circle or shape'],
      ['Tools button', 'Symmetry, fill bucket, smoothing and a reference picture'],
      ['Tap the % button', 'Fit the painting to the screen'],
      ['Tap a tool twice', 'Choose its brush (smudge and eraser too)'],
      ['Pen-only mode', 'With a stylus, fingers only move the canvas'],
    ];
    const keys: [string, string][] = [
      ['Scroll / two fingers', 'Move the painting (Shift + wheel: sideways)'],
      ['Ctrl + scroll, pinch', 'Zoom around the pointer'],
      ['Alt + scroll', 'Turn the painting'],
      ['Space + drag', 'Move the painting (middle or right drag too)'],
      ['Alt + click', 'Pick a colour'],
      ['Ctrl+Z, Ctrl+Shift+Z', 'Undo, redo'],
      ['B, E, S, G', 'Paint, eraser, smudge, fill bucket'],
      ['[ and ]', 'Smaller or bigger brush'],
      ['1 … 9, 0', 'Opacity 10% … 90%, 100%'],
      ['+ and −, Ctrl+0, Ctrl+1', 'Zoom in and out, fit, 100%'],
      [', and .', 'Turn 15° (R straightens)'],
      ['L, Ctrl+E, Tab', 'Layers, share, hide the interface'],
      ['Ctrl+S', 'Save now (it also saves by itself)'],
    ];
    const wrap = document.createElement('div');
    wrap.className = 'st-help';
    const heading = (text: string): HTMLElement => {
      const h = document.createElement('h3');
      h.textContent = text;
      return h;
    };
    // Show the set for this device first.
    const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const groups: [string, [string, string][]][] = [
      ['Touch and stylus', tips],
      ['Mouse, trackpad and keyboard', keys],
    ];
    if (desktop) groups.reverse();
    for (const [title, list] of groups) {
      wrap.appendChild(heading(title));
      for (const [k, v] of list) wrap.appendChild(html(`<div><b>${k}</b><span>${v}</span></div>`));
    }
    this.sheet.open('help', 'Gestures, keys and tips', wrap);
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
    if (e.type === 'pagehide' || document.visibilityState === 'hidden') {
      this.dryWet();
      void this.save();
      void this.recorder.flush();
    }
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
    this.dryWet();
    await this.save();
    await this.recorder.flush();
    this.destroy();
    this.options.onExit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.keyReset);
    document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.hidden);
    this.compositor.dispose();
    this.wet?.dispose();
    this.recorder.dispose();
    this.timelapsePanel?.dispose();
    this.el.remove();
  }
}
