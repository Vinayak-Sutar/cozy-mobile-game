import { SYMMETRY_MODES, type SymmetryMode } from '../brush/symmetry';
import { savePrefs, type StudioPrefs } from '../tools';

export interface ToolsActions {
  symmetryChanged(): void;
  resetCentre(): void;
  fill(on: boolean): void;
  fillActive(): boolean;
  assistChanged(): void;
  openImage(file: File): void;
  showCanvas(): void;
  closeReference(): void;
  referenceOpen(): boolean;
}

const TABS: [string, string][] = [
  ['symmetry', 'Symmetry'],
  ['fill', 'Fill'],
  ['assist', 'Drawing help'],
  ['reference', 'Reference'],
];

/** The tools sheet: symmetry, the fill bucket, QuickShape and smoothing, and the reference window. */
export class ToolsPanel {
  readonly el: HTMLElement;

  constructor(
    private readonly prefs: StudioPrefs,
    private readonly actions: ToolsActions,
  ) {
    this.el = document.createElement('div');
    this.render();
  }

  render(): void {
    const tabs = document.createElement('div');
    tabs.className = 'st-tabs';
    if (!TABS.some(([id]) => id === this.prefs.toolsTab)) this.prefs.toolsTab = 'symmetry';
    for (const [id, label] of TABS) {
      const b = document.createElement('button');
      b.className = `st-tab${this.prefs.toolsTab === id ? ' active' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        this.prefs.toolsTab = id;
        savePrefs(this.prefs);
        this.render();
      });
      tabs.appendChild(b);
    }
    const body =
      this.prefs.toolsTab === 'fill'
        ? this.fill()
        : this.prefs.toolsTab === 'assist'
          ? this.assist()
          : this.prefs.toolsTab === 'reference'
            ? this.reference()
            : this.symmetry();
    this.el.replaceChildren(tabs, ...body);
  }

  private note(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'st-note';
    p.textContent = text;
    return p;
  }

  private chip(label: string, run: () => void, className = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `st-chip-btn ${className}`;
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }

  private range(label: string, value: number, min: number, max: number, show: (v: number) => string, set: (v: number, done: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'st-row';
    row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="1"><span class="value"></span>`;
    const input = row.querySelector('input') as HTMLInputElement;
    const out = row.querySelector('.value') as HTMLElement;
    input.value = String(value);
    out.textContent = show(value);
    input.addEventListener('input', () => {
      out.textContent = show(Number(input.value));
      set(Number(input.value), false);
    });
    input.addEventListener('change', () => set(Number(input.value), true));
    return row;
  }

  private symmetry(): HTMLElement[] {
    const sym = this.prefs.symmetry;
    const grid = document.createElement('div');
    grid.className = 'st-sym-grid';
    for (const mode of SYMMETRY_MODES) {
      const b = document.createElement('button');
      b.className = `st-sym${sym.mode === mode.id ? ' active' : ''}`;
      b.innerHTML = `${symmetryIcon(mode.id, sym.count)}<span>${mode.name}</span>`;
      b.addEventListener('click', () => {
        sym.mode = mode.id;
        savePrefs(this.prefs);
        this.actions.symmetryChanged();
        this.render();
      });
      grid.appendChild(b);
    }
    const parts: HTMLElement[] = [grid];
    if (sym.mode === 'radial' || sym.mode === 'kaleidoscope') {
      parts.push(
        this.range('Copies', sym.count, 2, 16, (v) => String(v), (v, done) => {
          sym.count = v;
          this.actions.symmetryChanged();
          if (done) {
            savePrefs(this.prefs);
            this.render();
          }
        }),
      );
    }
    if (sym.mode !== 'off') {
      const row = document.createElement('div');
      row.className = 'st-actions';
      row.append(this.chip('Centre the guide', () => this.actions.resetCentre()));
      parts.push(row, this.note('Drag the round handle on the canvas to move the centre. Paint, the eraser and smudge all follow the guide.'));
    } else {
      parts.push(this.note('Mirror one side to the other, or paint flowers and mandalas with Radial and Kaleidoscope.'));
    }
    return parts;
  }

  private fill(): HTMLElement[] {
    const on = this.actions.fillActive();
    const row = document.createElement('div');
    row.className = 'st-actions';
    row.append(
      this.chip(on ? 'Fill is on: tap the canvas' : 'Use the fill bucket', () => {
        this.actions.fill(!on);
        this.render();
      }, on ? 'primary' : ''),
    );
    const sample = document.createElement('div');
    sample.className = 'st-row';
    sample.innerHTML = '<label>Look at</label>';
    const seg = document.createElement('div');
    seg.className = 'st-seg';
    for (const [id, label] of [
      ['all', 'All layers'],
      ['layer', 'This layer'],
    ] as ['all' | 'layer', string][]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = this.prefs.fillSample === id ? 'active' : '';
      b.addEventListener('click', () => {
        this.prefs.fillSample = id;
        savePrefs(this.prefs);
        this.render();
      });
      seg.appendChild(b);
    }
    sample.appendChild(seg);
    return [
      row,
      this.range('Tolerance', Math.round(this.prefs.fillTolerance * 100), 0, 100, (v) => `${v}%`, (v, done) => {
        this.prefs.fillTolerance = v / 100;
        if (done) savePrefs(this.prefs);
      }),
      sample,
      this.note('Fills the area you tap with the current colour on this layer. "All layers" lets you colour in line art that sits on another layer. Tap a paint tool to stop filling.'),
    ];
  }

  private assist(): HTMLElement[] {
    const quick = document.createElement('div');
    quick.className = 'st-actions';
    quick.append(
      this.chip(`QuickShape: ${this.prefs.quickShape ? 'on' : 'off'}`, () => {
        this.prefs.quickShape = !this.prefs.quickShape;
        savePrefs(this.prefs);
        this.actions.assistChanged();
        this.render();
      }, this.prefs.quickShape ? 'primary' : ''),
    );
    return [
      quick,
      this.note('Draw a line, circle, rectangle or triangle and keep your finger or pen still at the end: it snaps to a clean shape.'),
      this.range('Predictive stroke', Math.round(this.prefs.predictive * 100), 0, 100, (v) => (v ? `${v}%` : 'Off'), (v, done) => {
        this.prefs.predictive = v / 100;
        if (done) {
          savePrefs(this.prefs);
          this.actions.assistChanged();
        }
      }),
      this.note('Predictive stroke tidies wobbly lines when you lift. StreamLine in each brush smooths them while you draw.'),
    ];
  }

  private reference(): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'st-actions';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.className = 'st-hidden';
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (chosen) this.actions.openImage(chosen);
    });
    row.append(
      file,
      this.chip('Open a picture…', () => file.click(), 'primary'),
      this.chip('Show the whole painting', () => this.actions.showCanvas()),
    );
    if (this.actions.referenceOpen()) row.append(this.chip('Close', () => this.actions.closeReference()));
    return [
      row,
      this.note('A small window floats over the canvas. Drag it by its top bar, resize it from the corner, and tap the picture to pick a colour from it. The picture stays on this device.'),
    ];
  }
}

/** A little drawing of each symmetry, so the choice reads at a glance. */
function symmetryIcon(mode: SymmetryMode, count: number): string {
  const lines: string[] = [];
  const ray = (a: number, both: boolean): void => {
    const x = 20 + Math.cos(a) * 15;
    const y = 20 + Math.sin(a) * 15;
    const x0 = both ? 20 - Math.cos(a) * 15 : 20;
    const y0 = both ? 20 - Math.sin(a) * 15 : 20;
    lines.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
  };
  const n = Math.max(2, Math.min(16, count));
  if (mode === 'vertical') ray(Math.PI / 2, true);
  if (mode === 'horizontal') ray(0, true);
  if (mode === 'quadrant') {
    ray(0, true);
    ray(Math.PI / 2, true);
  }
  if (mode === 'radial') for (let i = 0; i < Math.min(n, 8); i++) ray(-Math.PI / 2 + (2 * Math.PI * i) / Math.min(n, 8), false);
  if (mode === 'kaleidoscope') for (let i = 0; i < Math.min(2 * n, 12); i++) ray(-Math.PI / 2 + (2 * Math.PI * i) / Math.min(2 * n, 12), false);
  const off = mode === 'off' ? '<line x1="8" y1="32" x2="32" y2="8"/>' : '';
  return `<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="20" cy="20" r="15" stroke-opacity="0.35"/>${lines.join('')}${off}</svg>`;
}
