/**
 * A painting: its size, its paper, and a stack of layers. Each layer is its
 * own full-size 2D canvas (GPU-backed in Chrome), bottom first.
 */

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'lighter'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'difference'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { id: BlendMode; name: string }[] = [
  { id: 'source-over', name: 'Normal' },
  { id: 'multiply', name: 'Multiply' },
  { id: 'screen', name: 'Screen' },
  { id: 'overlay', name: 'Overlay' },
  { id: 'soft-light', name: 'Soft light' },
  { id: 'hard-light', name: 'Hard light' },
  { id: 'lighter', name: 'Add (glow)' },
  { id: 'darken', name: 'Darken' },
  { id: 'lighten', name: 'Lighten' },
  { id: 'color-dodge', name: 'Colour dodge' },
  { id: 'color-burn', name: 'Colour burn' },
  { id: 'difference', name: 'Difference' },
  { id: 'hue', name: 'Hue' },
  { id: 'saturation', name: 'Saturation' },
  { id: 'color', name: 'Colour' },
  { id: 'luminosity', name: 'Luminosity' },
];

export type PaperTexture = 'smooth' | 'watercolor' | 'canvas';

export interface Paper {
  color: string;
  texture: PaperTexture;
  /** Off = transparent background (and transparent PNG export). */
  visible: boolean;
}

export interface Layer {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  opacity: number;
  blend: BlendMode;
  visible: boolean;
  /** Paint only where this layer already has paint. */
  alphaLock: boolean;
}

/** Everything about a layer except its pixels (what gets saved as JSON). */
export type LayerMeta = Omit<Layer, 'canvas' | 'ctx'>;

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

let counter = 0;
export const newId = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Roughly how much canvas memory we let one painting use, by device. */
export function memoryBudget(): number {
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return deviceMemory <= 2 ? 110e6 : deviceMemory <= 4 ? 190e6 : 300e6;
}

/** How many layers fit, leaving room for the stroke buffer and composite caches. */
export function maxLayersFor(width: number, height: number): number {
  const perLayer = width * height * 4;
  return Math.max(3, Math.min(16, Math.floor(memoryBudget() / perLayer) - 3));
}

export class PaintingDoc {
  layers: Layer[] = [];
  active = 0;
  readonly maxLayers: number;
  private layerCount = 0;

  constructor(
    readonly id: string,
    public name: string,
    readonly width: number,
    readonly height: number,
    public paper: Paper,
  ) {
    this.maxLayers = maxLayersFor(width, height);
  }

  get activeLayer(): Layer {
    return this.layers[this.active];
  }

  createLayer(meta?: Partial<LayerMeta>): Layer {
    const canvas = makeCanvas(this.width, this.height);
    this.layerCount++;
    return {
      id: meta?.id ?? newId(),
      name: meta?.name ?? `Layer ${this.layerCount}`,
      canvas,
      ctx: context(canvas),
      opacity: meta?.opacity ?? 1,
      blend: meta?.blend ?? 'source-over',
      visible: meta?.visible ?? true,
      alphaLock: meta?.alphaLock ?? false,
    };
  }

  /** Adds a layer above the active one (or at `index`) and makes it active. */
  addLayer(layer: Layer = this.createLayer(), index = this.active + 1): Layer | null {
    if (this.layers.length >= this.maxLayers) return null;
    const at = Math.max(0, Math.min(this.layers.length, index));
    this.layers.splice(at, 0, layer);
    this.active = at;
    return layer;
  }

  duplicate(index: number): Layer | null {
    const source = this.layers[index];
    if (!source || this.layers.length >= this.maxLayers) return null;
    const copy = this.createLayer({ ...metaOf(source), id: newId(), name: `${source.name} copy` });
    copy.ctx.drawImage(source.canvas, 0, 0);
    return this.addLayer(copy, index + 1);
  }

  remove(index: number): Layer | null {
    if (this.layers.length <= 1) return null;
    const [removed] = this.layers.splice(index, 1);
    this.active = Math.min(this.active, this.layers.length - 1);
    return removed;
  }

  move(from: number, to: number): void {
    const target = Math.max(0, Math.min(this.layers.length - 1, to));
    const [layer] = this.layers.splice(from, 1);
    this.layers.splice(target, 0, layer);
    this.active = target;
  }

  indexOf(id: string): number {
    return this.layers.findIndex((l) => l.id === id);
  }
}

export function metaOf(layer: Layer): LayerMeta {
  const { id, name, opacity, blend, visible, alphaLock } = layer;
  return { id, name, opacity, blend, visible, alphaLock };
}

/** Paper grain as a small repeating canvas, drawn under the layers. */
export function paperPattern(texture: PaperTexture): HTMLCanvasElement | null {
  if (texture === 'smooth') return null;
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = context(canvas);
  const image = ctx.createImageData(size, size);
  let seed = texture === 'canvas' ? 99 : 7;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  // A blurred noise field for watercolour paper; a soft weave for canvas.
  const noise = new Float32Array(size * size).map(() => random());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v: number;
      if (texture === 'canvas') {
        const weave = (Math.sin((x / size) * Math.PI * 2 * 48) * Math.sin((y / size) * Math.PI * 2 * 48) + 1) / 2;
        v = 0.55 * weave + 0.45 * noise[y * size + x];
      } else {
        let sum = 0;
        for (let k = -2; k <= 2; k++) sum += noise[((y + k + size) % size) * size + ((x + k * 2 + size) % size)];
        v = sum / 5;
      }
      const i = (y * size + x) * 4;
      // Dark speckles only; strength kept low so it reads as texture, not dirt.
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(Math.max(0, v - 0.45) * 60);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
