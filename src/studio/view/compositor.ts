import { context, type Layer, makeCanvas, type PaintingDoc, paperPattern } from '../doc/document';
import type { Viewport } from './viewport';

/** What the brush engine is doing right now, so the screen can show the stroke before it's committed. */
export interface LiveStroke {
  /** The stroke so far, painted on its own transparent canvas. */
  canvas: HTMLCanvasElement;
  opacity: number;
  /** How it will be combined with the layer: normal, multiply, erase... */
  op: GlobalCompositeOperation;
}

/**
 * Draws the painting on screen. Paper and every layer below the active one
 * are cached in one canvas, so a frame is: that cache, the active layer (with
 * the live stroke), then each layer above, all under the viewport transform.
 */
export class Compositor {
  private below: HTMLCanvasElement;
  private belowCtx: CanvasRenderingContext2D;
  private work: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D;
  private pattern: HTMLCanvasElement | null = null;
  private belowDirty = true;
  private checker: CanvasPattern | null = null;

  constructor(private doc: PaintingDoc) {
    this.below = makeCanvas(doc.width, doc.height);
    this.belowCtx = context(this.below);
    this.work = makeCanvas(doc.width, doc.height);
    this.workCtx = context(this.work);
    this.paperChanged();
  }

  /** Call when paper or any layer below the active one changes. */
  invalidate(): void {
    this.belowDirty = true;
  }

  paperChanged(): void {
    this.pattern = paperPattern(this.doc.paper.texture);
    this.belowDirty = true;
  }

  /** Paper plus every layer below the active one. */
  private rebuildBelow(): void {
    const ctx = this.belowCtx;
    const { width, height } = this.doc;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    if (this.doc.paper.visible) this.drawPaper(ctx, width, height);
    for (let i = 0; i < this.doc.active; i++) this.drawLayer(ctx, this.doc.layers[i]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.belowDirty = false;
  }

  drawPaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = this.doc.paper.color;
    ctx.fillRect(0, 0, width, height);
    if (this.pattern) {
      const pattern = ctx.createPattern(this.pattern, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, source: CanvasImageSource = layer.canvas): void {
    if (!layer.visible || layer.opacity <= 0) return;
    ctx.globalCompositeOperation = layer.blend;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(source, 0, 0);
  }

  /** The active layer as it will look once the live stroke is committed (only the stroke's area is redone). */
  private activeWithStroke(stroke: LiveStroke, rect: Rect): HTMLCanvasElement {
    const layer = this.doc.activeLayer;
    const ctx = this.workCtx;
    const [x, y, w, h] = rect;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(layer.canvas, x, y, w, h, x, y, w, h);
    ctx.globalCompositeOperation = layer.alphaLock && stroke.op === 'source-over' ? 'source-atop' : stroke.op;
    ctx.globalAlpha = stroke.opacity;
    ctx.drawImage(stroke.canvas, x, y, w, h, x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return this.work;
  }

  /** Start of a stroke: copy the whole active layer once, then only the stroke's area each frame. */
  beginStroke(): void {
    const ctx = this.workCtx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.doc.width, this.doc.height);
    ctx.drawImage(this.doc.activeLayer.canvas, 0, 0);
  }

  /** `wet` is live watercolour lying on the active layer (drawn as if it were part of it). */
  render(
    target: CanvasRenderingContext2D,
    view: Viewport,
    ratio: number,
    stroke: LiveStroke | null,
    strokeRect: Rect | null,
    wet: CanvasImageSource | null = null,
  ): void {
    const { width, height } = this.doc;
    if (this.belowDirty) this.rebuildBelow();
    const canvas = target.canvas;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'source-over';
    target.globalAlpha = 1;
    target.fillStyle = '#25262e';
    target.fillRect(0, 0, canvas.width, canvas.height);
    target.setTransform(...view.matrix(ratio));
    target.imageSmoothingEnabled = view.scale < 4;
    // A drop shadow, then a checkerboard if the paper is off (transparent).
    target.shadowColor = 'rgba(0, 0, 0, 0.45)';
    target.shadowBlur = 18 * ratio;
    target.fillStyle = '#ffffff';
    target.fillRect(0, 0, width, height);
    target.shadowBlur = 0;
    target.shadowColor = 'transparent';
    if (!this.doc.paper.visible) {
      this.checker ??= this.makeChecker(target);
      if (this.checker) {
        target.fillStyle = this.checker;
        target.fillRect(0, 0, width, height);
      }
    }
    target.drawImage(this.below, 0, 0);
    const active = this.doc.activeLayer;
    if (stroke && strokeRect) this.drawLayer(target, active, this.activeWithStroke(stroke, strokeRect));
    else this.drawLayer(target, active);
    if (wet && active.visible) {
      target.globalCompositeOperation = active.blend;
      target.globalAlpha = active.opacity;
      target.drawImage(wet, 0, 0, width, height);
    }
    for (let i = this.doc.active + 1; i < this.doc.layers.length; i++) this.drawLayer(target, this.doc.layers[i]);
    target.globalCompositeOperation = 'source-over';
    target.globalAlpha = 1;
    target.setTransform(1, 0, 0, 1, 0, 0);
  }

  private makeChecker(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    const tile = makeCanvas(32, 32);
    const t = context(tile);
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, 32, 32);
    t.fillStyle = '#e6e6ea';
    t.fillRect(0, 0, 16, 16);
    t.fillRect(16, 16, 16, 16);
    return ctx.createPattern(tile, 'repeat');
  }

  /** The finished picture, flattened: for export, thumbnails and the eyedropper. */
  flatten(scale = 1, withPaper = this.doc.paper.visible, background: string | null = null): HTMLCanvasElement {
    const { width, height } = this.doc;
    const out = makeCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const ctx = context(out);
    ctx.scale(scale, scale);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    if (withPaper) this.drawPaper(ctx, width, height);
    for (const layer of this.doc.layers) this.drawLayer(ctx, layer);
    return out;
  }

  /** The colour you see at a document point (paper and all visible layers). */
  sample(x: number, y: number): [number, number, number] {
    const probe = makeCanvas(1, 1);
    const ctx = context(probe);
    ctx.translate(-Math.floor(x), -Math.floor(y));
    this.drawPaper(ctx, this.doc.width, this.doc.height);
    for (const layer of this.doc.layers) this.drawLayer(ctx, layer);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  dispose(): void {
    this.below.width = this.below.height = 1;
    this.work.width = this.work.height = 1;
  }
}

/** A rectangle in document pixels: [x, y, width, height]. */
export type Rect = [number, number, number, number];
