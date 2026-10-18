import { rgbToHex } from '../color';
import { context, makeCanvas } from '../doc/document';
import { button, icons } from './icons';

/**
 * A small floating window for a reference picture: a photo from the device,
 * or the whole painting while you work zoomed in. Drag it by its top bar,
 * resize it from the corner, and tap the picture to pick a colour from it.
 */
export class ReferenceWindow {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly title: HTMLElement;
  private source: CanvasImageSource | null = null;
  private sourceW = 1;
  private sourceH = 1;
  private width = 170;
  private x = 0;
  private y = 0;
  mode: 'image' | 'canvas' | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onPick: (color: string) => void,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'st-ref st-hidden';
    const bar = document.createElement('div');
    bar.className = 'st-ref-bar';
    this.title = document.createElement('span');
    const close = button(icons.close, 'Close reference');
    close.addEventListener('click', () => this.close());
    bar.append(this.title, close);
    this.canvas = document.createElement('canvas');
    this.ctx = context(this.canvas);
    const handle = document.createElement('div');
    handle.className = 'st-ref-resize';
    this.el.append(bar, this.canvas, handle);
    parent.appendChild(this.el);

    this.drag(bar, (dx, dy) => {
      this.x += dx;
      this.y += dy;
      this.place();
    });
    this.drag(handle, (dx) => {
      this.width = Math.max(110, Math.min(this.parent.clientWidth - 20, this.width + dx));
      this.draw();
      this.place();
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const px = Math.floor(((e.clientX - rect.left) / rect.width) * this.canvas.width);
      const py = Math.floor(((e.clientY - rect.top) / rect.height) * this.canvas.height);
      const [r, g, b, a] = this.ctx.getImageData(px, py, 1, 1).data;
      if (a > 0) this.onPick(rgbToHex(r, g, b));
    });
  }

  private drag(handle: HTMLElement, move: (dx: number, dy: number) => void): void {
    let last: [number, number] | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      last = [e.clientX, e.clientY];
    });
    handle.addEventListener('pointermove', (e) => {
      if (!last) return;
      move(e.clientX - last[0], e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    });
    const end = (): void => {
      last = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Shows a picture from the device. */
  async showFile(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    // Keep a modest copy: enough to look at and pick colours from.
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const copy = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    context(copy).drawImage(bitmap, 0, 0, copy.width, copy.height);
    bitmap.close();
    this.mode = 'image';
    this.title.textContent = 'Reference';
    this.setSource(copy);
  }

  /** Shows the painting itself (call again with a fresh copy as it changes). */
  showCanvas(picture: HTMLCanvasElement): void {
    this.mode = 'canvas';
    this.title.textContent = 'Whole painting';
    this.setSource(picture);
  }

  private setSource(source: HTMLCanvasElement): void {
    const first = this.el.classList.contains('st-hidden');
    this.source = source;
    this.sourceW = source.width;
    this.sourceH = source.height;
    this.el.classList.remove('st-hidden');
    this.draw();
    if (first) {
      this.x = this.parent.clientWidth - this.width - 12;
      this.y = 64;
    }
    this.place();
  }

  private draw(): void {
    if (!this.source) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.width * ratio);
    const h = Math.round((this.width * this.sourceH * ratio) / this.sourceW);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${h / ratio}px`;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(this.source, 0, 0, w, h);
  }

  /** Keeps the window on screen. */
  private place(): void {
    const maxX = this.parent.clientWidth - this.el.offsetWidth - 4;
    const maxY = this.parent.clientHeight - this.el.offsetHeight - 4;
    this.x = Math.max(4, Math.min(maxX, this.x));
    this.y = Math.max(4, Math.min(maxY, this.y));
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }

  get open(): boolean {
    return !this.el.classList.contains('st-hidden');
  }

  close(): void {
    this.el.classList.add('st-hidden');
    this.source = null;
    this.mode = null;
    this.onClose();
  }
}
