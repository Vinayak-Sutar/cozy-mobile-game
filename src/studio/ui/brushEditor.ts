import type { AngleMode, Brush } from '../brush/presets';
import { GRAINS, type Grain, TIP_KINDS, TIP_SIZE, tipMask, type TipKind } from '../brush/tips';
import { context, makeCanvas } from '../doc/document';
import { darkBackdrop, paintSample } from './brushPanel';

type NumberKey = { [K in keyof Brush]-?: Brush[K] extends number ? K : never }[keyof Brush];

interface SliderSpec {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  /** Shown as a percentage of `max` unless a unit is given. */
  unit?: '°' | 'px' | '×' | '';
  /** A curved slider gives more room to small values (spacing, size). */
  curve?: number;
  step?: number;
}

const SECTIONS: { title: string; sliders: SliderSpec[] }[] = [
  {
    title: 'Shape',
    sliders: [
      { key: 'size', label: 'Size', min: 1, max: 600, unit: 'px', curve: 3, step: 1 },
      { key: 'hardness', label: 'Hardness', min: 0, max: 1 },
      { key: 'roundness', label: 'Roundness', min: 0.05, max: 1 },
      { key: 'angle', label: 'Angle', min: 0, max: 180, unit: '°', step: 1 },
      { key: 'angleJitter', label: 'Angle jitter', min: 0, max: 180, unit: '°', step: 1 },
    ],
  },
  {
    title: 'Stroke',
    sliders: [
      { key: 'spacing', label: 'Spacing', min: 0.02, max: 2, unit: '×', curve: 2.5 },
      { key: 'scatter', label: 'Scatter', min: 0, max: 3, unit: '×' },
      { key: 'count', label: 'Count', min: 1, max: 8, unit: '', step: 1 },
      { key: 'streamline', label: 'StreamLine', min: 0, max: 1 },
      { key: 'flow', label: 'Flow', min: 0.02, max: 1 },
      { key: 'opacity', label: 'Opacity', min: 0.05, max: 1 },
    ],
  },
  {
    title: 'Grain',
    sliders: [
      { key: 'grainDepth', label: 'Depth', min: 0, max: 1 },
      { key: 'grainScale', label: 'Scale', min: 0.3, max: 3, unit: '×' },
    ],
  },
  {
    title: 'Pressure and speed',
    sliders: [
      { key: 'pressureSize', label: 'Pressure → size', min: 0, max: 1 },
      { key: 'pressureOpacity', label: 'Pressure → opacity', min: 0, max: 1 },
      { key: 'minSize', label: 'Thinnest', min: 0.02, max: 1 },
      { key: 'speedSize', label: 'Fast = thinner', min: 0, max: 1 },
      { key: 'taperStart', label: 'Taper start', min: 0, max: 1 },
      { key: 'taperEnd', label: 'Taper end', min: 0, max: 1 },
    ],
  },
  {
    title: 'Colour',
    sliders: [
      { key: 'jitterHue', label: 'Hue jitter', min: 0, max: 1 },
      { key: 'jitterSat', label: 'Saturation jitter', min: 0, max: 1 },
      { key: 'jitterLight', label: 'Brightness jitter', min: 0, max: 1 },
      { key: 'hueShift', label: 'Rainbow', min: 0, max: 3, unit: '×' },
      { key: 'jitterSize', label: 'Size jitter', min: 0, max: 1 },
      { key: 'jitterOpacity', label: 'Opacity jitter', min: 0, max: 1 },
    ],
  },
  {
    title: 'Paint',
    sliders: [
      { key: 'wetMix', label: 'Wet mix', min: 0, max: 0.95 },
      { key: 'glow', label: 'Glow', min: 0, max: 1.5 },
    ],
  },
];

const TIP_NAMES: Record<TipKind, string> = {
  round: 'Round',
  pencil: 'Pencil',
  charcoal: 'Charcoal',
  chalk: 'Chalk',
  flat: 'Flat',
  bristle: 'Bristle',
  spray: 'Spray',
  cloud: 'Cloud',
  grass: 'Grass',
  leaf: 'Leaf',
  flower: 'Flower',
  star: 'Star',
  heart: 'Heart',
};

const GRAIN_NAMES: Record<Grain, string> = { none: 'None', paper: 'Paper', canvas: 'Canvas', pencil: 'Pencil', rough: 'Rough' };

const ANGLE_MODES: [AngleMode, string][] = [
  ['fixed', 'Fixed'],
  ['stroke', 'Follows the stroke'],
  ['random', 'Random'],
  ['tilt', 'Pen tilt'],
];

const BLENDS: [GlobalCompositeOperation, string][] = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiply (marker)'],
  ['screen', 'Screen'],
  ['lighter', 'Add (glow)'],
  ['overlay', 'Overlay'],
  ['soft-light', 'Soft light'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
  ['color-burn', 'Colour burn'],
  ['color-dodge', 'Colour dodge'],
];

export interface BrushEditorActions {
  /** Keep the brush: `asNew` makes a copy in My brushes. */
  save(brush: Brush, asNew: boolean): void;
  remove(id: string): void;
}

/**
 * The brush editor: every setting of a brush, with a live sample stroke.
 * Built-in brushes are never changed; saving one makes your own copy.
 */
export class BrushEditor {
  readonly el: HTMLElement;
  private draft: Brush;
  private readonly preview: HTMLCanvasElement;
  private queued = false;
  private section = 'Shape';
  private readonly body: HTMLElement;

  constructor(
    private readonly original: Brush,
    custom: boolean,
    private readonly color: string,
    private readonly actions: BrushEditorActions,
  ) {
    this.draft = { ...original };
    this.el = document.createElement('div');
    this.el.className = 'st-brush-editor';
    this.preview = makeCanvas(340 * 2, 88 * 2);
    this.preview.className = 'st-brush-sample';
    if (darkBackdrop(original, color)) this.preview.style.background = '#1d1e26';
    this.body = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'st-row';
    name.innerHTML = '<label>Name</label><input class="st-input" maxlength="40" spellcheck="false">';
    const nameInput = name.querySelector('input') as HTMLInputElement;
    nameInput.value = custom ? original.name : `${original.name} (mine)`;
    this.draft.name = nameInput.value;
    nameInput.addEventListener('input', () => (this.draft.name = nameInput.value.trim() || original.name));

    const actionsRow = document.createElement('div');
    actionsRow.className = 'st-actions';
    const chip = (label: string, run: () => void, className = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `st-chip-btn ${className}`;
      b.textContent = label;
      b.addEventListener('click', run);
      return b;
    };
    actionsRow.append(
      chip(custom ? 'Save' : 'Save to My brushes', () => this.actions.save({ ...this.draft }, !custom), 'primary'),
      ...(custom ? [chip('Save as a copy', () => this.actions.save({ ...this.draft, name: `${this.draft.name} copy` }, true))] : []),
      chip('Reset', () => {
        this.draft = { ...this.original, name: this.draft.name };
        this.renderBody();
        this.refresh();
      }),
      ...(custom ? [chip('Delete', () => this.actions.remove(original.id), 'danger')] : []),
    );
    this.el.append(this.preview, name, this.body, actionsRow);
    this.renderBody();
    this.refresh();
  }

  /** Repaints the sample stroke, at most once a frame while a slider moves. */
  private refresh(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      paintSample(this.preview, this.draft, this.color);
    });
  }

  private change(): void {
    this.preview.style.background = darkBackdrop(this.draft, this.color) ? '#1d1e26' : '';
    this.refresh();
  }

  private renderBody(): void {
    const tabs = document.createElement('div');
    tabs.className = 'st-tabs';
    for (const s of SECTIONS) {
      const b = document.createElement('button');
      b.className = `st-tab${this.section === s.title ? ' active' : ''}`;
      b.textContent = s.title;
      b.addEventListener('click', () => {
        this.section = s.title;
        this.renderBody();
      });
      tabs.appendChild(b);
    }
    const section = SECTIONS.find((s) => s.title === this.section) ?? SECTIONS[0];
    const parts: HTMLElement[] = [tabs];
    if (section.title === 'Shape') parts.push(this.tipPicker(), this.select('Angle', ANGLE_MODES, this.draft.angleMode, (v) => (this.draft.angleMode = v)));
    if (section.title === 'Grain') parts.push(this.select('Texture', GRAINS.map((g) => [g, GRAIN_NAMES[g]] as [Grain, string]), this.draft.grain, (v) => (this.draft.grain = v)));
    if (section.title === 'Paint') parts.push(this.select('Blend', BLENDS, this.draft.blend, (v) => (this.draft.blend = v)));
    for (const spec of section.sliders) parts.push(this.slider(spec));
    if (section.title === 'Paint') {
      const note = document.createElement('p');
      note.className = 'st-note';
      note.textContent = 'Wet mix makes paint pick up and blend the colours already on the layer, like oil paint.';
      parts.push(note);
    }
    if (section.title === 'Pressure and speed') {
      const note = document.createElement('p');
      note.className = 'st-note';
      note.textContent = 'Pressure comes from a stylus. With a finger, "Fast = thinner" and the tapers shape the line instead.';
      parts.push(note);
    }
    this.body.replaceChildren(...parts);
  }

  private tipPicker(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'st-tip-grid';
    for (const kind of TIP_KINDS) {
      const b = document.createElement('button');
      b.className = `st-tip${this.draft.tip === kind ? ' active' : ''}`;
      b.title = TIP_NAMES[kind];
      const c = makeCanvas(56, 56);
      const ctx = context(c);
      ctx.drawImage(tipMask(kind, kind === 'round' ? this.draft.hardness : 1), 0, 0, TIP_SIZE, TIP_SIZE, 4, 4, 48, 48);
      const label = document.createElement('span');
      label.textContent = TIP_NAMES[kind];
      b.append(c, label);
      b.addEventListener('click', () => {
        this.draft.tip = kind;
        for (const other of grid.querySelectorAll('.st-tip')) other.classList.toggle('active', other === b);
        this.change();
      });
      grid.appendChild(b);
    }
    return grid;
  }

  private select<T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'st-row';
    const l = document.createElement('label');
    l.textContent = label;
    const select = document.createElement('select');
    select.className = 'st-select';
    for (const [id, name] of options) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = name;
      o.selected = id === value;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      set(select.value as T);
      this.change();
    });
    row.append(l, select);
    return row;
  }

  private slider(spec: SliderSpec): HTMLElement {
    const row = document.createElement('div');
    row.className = 'st-row';
    const label = document.createElement('label');
    label.textContent = spec.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1000';
    const out = document.createElement('span');
    out.className = 'value';
    const curve = spec.curve ?? 1;
    const toValue = (t: number): number => {
      const v = spec.min + (spec.max - spec.min) * Math.pow(t, curve);
      return spec.step ? Math.round(v / spec.step) * spec.step : v;
    };
    const toT = (v: number): number => Math.pow(Math.min(1, Math.max(0, (v - spec.min) / (spec.max - spec.min))), 1 / curve);
    const show = (v: number): void => {
      out.textContent =
        spec.unit === undefined
          ? `${Math.round((v / spec.max) * 100)}%`
          : spec.unit === '×'
            ? `${v.toFixed(2)}×`
            : `${Math.round(v)}${spec.unit}`;
    };
    const value = this.draft[spec.key] as number;
    input.value = String(Math.round(toT(value) * 1000));
    show(value);
    input.addEventListener('input', () => {
      const v = toValue(Number(input.value) / 1000);
      (this.draft[spec.key] as number) = v;
      show(v);
      this.change();
    });
    row.append(label, input, out);
    return row;
  }
}
