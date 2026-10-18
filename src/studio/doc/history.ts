import { context, type Layer, makeCanvas } from './document';

/** One undoable step. */
export interface HistoryEntry {
  label: string;
  bytes: number;
  undo(): void;
  redo(): void;
}

const TILE = 256;

/**
 * A paint change on one layer, stored as just the 256 px tiles it touched.
 * Undo and redo both swap the saved tiles with what's on the layer now.
 */
export class TileEdit implements HistoryEntry {
  bytes = 0;
  private tiles = new Map<string, HTMLCanvasElement>();

  constructor(
    readonly layer: Layer,
    readonly label = 'Paint',
  ) {}

  /** Saves the tiles under `rect` the first time they're touched in this step. */
  capture(x: number, y: number, w: number, h: number): void {
    const { width, height } = this.layer.canvas;
    const x0 = Math.max(0, Math.floor(x / TILE));
    const y0 = Math.max(0, Math.floor(y / TILE));
    const x1 = Math.min(Math.ceil(width / TILE) - 1, Math.floor((x + w) / TILE));
    const y1 = Math.min(Math.ceil(height / TILE) - 1, Math.floor((y + h) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const key = `${tx},${ty}`;
        if (this.tiles.has(key)) continue;
        const tile = makeCanvas(TILE, TILE);
        context(tile).drawImage(this.layer.canvas, tx * TILE, ty * TILE, TILE, TILE, 0, 0, TILE, TILE);
        this.tiles.set(key, tile);
        this.bytes += TILE * TILE * 4;
      }
    }
  }

  get empty(): boolean {
    return this.tiles.size === 0;
  }

  private swap(): void {
    const ctx = this.layer.ctx;
    for (const [key, saved] of this.tiles) {
      const [tx, ty] = key.split(',').map(Number);
      const now = makeCanvas(TILE, TILE);
      context(now).drawImage(this.layer.canvas, tx * TILE, ty * TILE, TILE, TILE, 0, 0, TILE, TILE);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.drawImage(saved, tx * TILE, ty * TILE);
      ctx.restore();
      this.tiles.set(key, now);
    }
  }

  undo(): void {
    this.swap();
  }

  redo(): void {
    this.swap();
  }
}

/** Any other change (layers added, moved, blend changed…), as a pair of functions. */
export class ActionEdit implements HistoryEntry {
  constructor(
    readonly label: string,
    readonly undo: () => void,
    readonly redo: () => void,
    readonly bytes = 0,
  ) {}
}

/** The undo stack, kept within a memory budget (oldest steps are forgotten first). */
export class History {
  private entries: HistoryEntry[] = [];
  private index = 0;
  onChange: () => void = () => {};

  constructor(private readonly budget: number) {}

  push(entry: HistoryEntry): void {
    this.entries.length = this.index;
    this.entries.push(entry);
    this.index = this.entries.length;
    let total = this.entries.reduce((sum, e) => sum + e.bytes, 0);
    while (this.entries.length > 1 && (total > this.budget || this.entries.length > 300)) {
      total -= this.entries[0].bytes;
      this.entries.shift();
      this.index--;
    }
    this.onChange();
  }

  undo(): string | null {
    if (this.index === 0) return null;
    const entry = this.entries[--this.index];
    entry.undo();
    this.onChange();
    return entry.label;
  }

  redo(): string | null {
    if (this.index >= this.entries.length) return null;
    const entry = this.entries[this.index++];
    entry.redo();
    this.onChange();
    return entry.label;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length;
  }

  get depth(): number {
    return this.index;
  }

  clear(): void {
    this.entries = [];
    this.index = 0;
    this.onChange();
  }
}
