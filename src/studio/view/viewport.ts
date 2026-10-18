/**
 * Where the painting sits on screen: zoomed, panned and rotated. Screen
 * coordinates are CSS pixels; document coordinates are canvas pixels.
 * screen = translate(tx, ty) · rotate(rotation) · scale(scale) · doc
 */
export class Viewport {
  scale = 1;
  rotation = 0;
  tx = 0;
  ty = 0;
  private gesture: { scale: number; rotation: number; p1: [number, number]; p2: [number, number]; mid: [number, number] } | null = null;

  toScreen(x: number, y: number): [number, number] {
    const c = Math.cos(this.rotation) * this.scale;
    const s = Math.sin(this.rotation) * this.scale;
    return [c * x - s * y + this.tx, s * x + c * y + this.ty];
  }

  toDoc(x: number, y: number): [number, number] {
    const dx = x - this.tx;
    const dy = y - this.ty;
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return [(c * dx + s * dy) / this.scale, (-s * dx + c * dy) / this.scale];
  }

  /** The 2D-canvas transform for drawing the document, at `ratio` device pixels per CSS pixel. */
  matrix(ratio: number): [number, number, number, number, number, number] {
    const c = Math.cos(this.rotation) * this.scale * ratio;
    const s = Math.sin(this.rotation) * this.scale * ratio;
    return [c, s, -s, c, this.tx * ratio, this.ty * ratio];
  }

  /** Fits the whole painting on screen, upright, leaving `margin` around it. */
  fit(docW: number, docH: number, viewW: number, viewH: number, margin = 24): void {
    this.rotation = 0;
    this.scale = Math.min((viewW - margin * 2) / docW, (viewH - margin * 2) / docH);
    this.tx = (viewW - docW * this.scale) / 2;
    this.ty = (viewH - docH * this.scale) / 2;
  }

  beginPinch(a: [number, number], b: [number, number]): void {
    const da = this.toDoc(...a);
    const db = this.toDoc(...b);
    this.gesture = { scale: this.scale, rotation: this.rotation, p1: a, p2: b, mid: [(da[0] + db[0]) / 2, (da[1] + db[1]) / 2] };
  }

  /** Two fingers: zoom by their spread, rotate by their turn, pan by their middle. */
  pinch(a: [number, number], b: [number, number]): void {
    const g = this.gesture;
    if (!g) return;
    const d0 = Math.hypot(g.p2[0] - g.p1[0], g.p2[1] - g.p1[1]) || 1;
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    this.scale = Math.min(32, Math.max(0.05, g.scale * (d1 / d0)));
    const turn = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(g.p2[1] - g.p1[1], g.p2[0] - g.p1[0]);
    let rotation = g.rotation + turn;
    // Snap gently to upright and quarter turns.
    const quarter = Math.round(rotation / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(rotation - quarter) < 0.07) rotation = quarter;
    this.rotation = rotation;
    // Keep the document point that was under the fingers' middle under it.
    const c = Math.cos(this.rotation) * this.scale;
    const s = Math.sin(this.rotation) * this.scale;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    this.tx = mx - (c * g.mid[0] - s * g.mid[1]);
    this.ty = my - (s * g.mid[0] + c * g.mid[1]);
  }

  endPinch(): void {
    this.gesture = null;
  }

  get zoomPercent(): number {
    return Math.round(this.scale * 100);
  }
}
