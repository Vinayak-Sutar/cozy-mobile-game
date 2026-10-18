import { harmonies, type HSV, hexToHsv, hsvToHex, hsvToRgb, LIBRARIES, rgbToHex, rgbToHsv } from '../color';
import { pushRecent, savePrefs, type StudioPrefs } from '../tools';

const TABS = [
  { id: 'disc', name: 'Disc' },
  { id: 'sliders', name: 'Sliders' },
  { id: 'harmony', name: 'Harmony' },
  { id: 'palettes', name: 'Palettes' },
];

/**
 * The colour panel: a hue ring with a saturation/brightness square, exact
 * sliders and hex, harmony suggestions, palettes (built-in libraries and your
 * own), and the last ten colours you used.
 */
export class ColorPanel {
  readonly el: HTMLElement;
  private hsv: HSV;
  private readonly big: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly page: HTMLElement;

  constructor(
    private readonly prefs: StudioPrefs,
    private readonly onPick: (color: string) => void,
  ) {
    this.hsv = hexToHsv(prefs.color);
    this.el = document.createElement('div');
    const top = document.createElement('div');
    top.className = 'st-colour-top';
    this.big = document.createElement('div');
    this.big.className = 'st-swatch-big';
    const previous = document.createElement('button');
    previous.className = 'st-swatch-big';
    previous.style.width = previous.style.height = '34px';
    previous.title = 'Swap with previous colour';
    previous.addEventListener('click', () => {
      const old = this.prefs.color;
      this.set(hexToHsv(this.prefs.previous), true);
      this.prefs.previous = old;
      previous.style.background = old;
    });
    previous.style.background = prefs.previous;
    this.recent = document.createElement('div');
    this.recent.className = 'st-recent';
    top.append(this.big, previous, this.recent);
    this.tabs = document.createElement('div');
    this.tabs.className = 'st-tabs';
    this.page = document.createElement('div');
    this.el.append(top, this.tabs, this.page);
    this.renderTabs();
    this.refresh();
  }

  /** Call when the colour changed elsewhere (the eyedropper). */
  sync(): void {
    this.hsv = hexToHsv(this.prefs.color);
    this.refresh();
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(
      ...TABS.map((tab) => {
        const b = document.createElement('button');
        b.className = `st-tab${this.prefs.colorTab === tab.id ? ' active' : ''}`;
        b.textContent = tab.name;
        b.addEventListener('click', () => {
          this.prefs.colorTab = tab.id;
          savePrefs(this.prefs);
          this.renderTabs();
          this.refresh();
        });
        return b;
      }),
    );
  }

  private set(hsv: HSV, commit: boolean): void {
    this.hsv = hsv;
    const hex = hsvToHex(hsv);
    if (hex !== this.prefs.color) this.prefs.color = hex;
    this.onPick(hex);
    if (commit) {
      pushRecent(this.prefs, hex);
      savePrefs(this.prefs);
    }
    this.refresh(commit);
  }

  private refresh(full = true): void {
    this.big.style.background = this.prefs.color;
    this.recent.replaceChildren(
      ...this.prefs.recent.map((c) => {
        const s = document.createElement('button');
        s.className = 'st-swatch';
        s.style.background = c;
        s.addEventListener('click', () => this.set(hexToHsv(c), true));
        return s;
      }),
    );
    if (!full && this.prefs.colorTab === 'disc') {
      this.drawDisc();
      return;
    }
    const tab = this.prefs.colorTab;
    if (tab === 'disc') this.page.replaceChildren(this.discEl());
    else if (tab === 'sliders') this.page.replaceChildren(this.slidersEl());
    else if (tab === 'harmony') this.page.replaceChildren(this.harmonyEl());
    else this.page.replaceChildren(this.palettesEl());
  }

  // ---------- Disc ----------

  private disc: HTMLCanvasElement | null = null;

  private discEl(): HTMLElement {
    const size = 250;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.className = 'st-disc';
    this.disc = canvas;
    let dragging: 'ring' | 'square' | null = null;
    const pick = (e: PointerEvent, phase: 'down' | 'move' | 'up'): void => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const r = Math.hypot(x, y);
      if (phase === 'down') dragging = r > size * 0.36 ? 'ring' : 'square';
      if (!dragging) return;
      if (dragging === 'ring') {
        const h = ((Math.atan2(y, x) * 180) / Math.PI + 360 + 90) % 360;
        this.set({ ...this.hsv, h }, phase === 'up');
      } else {
        const half = size * 0.25;
        const s = Math.min(1, Math.max(0, (x + half) / (half * 2)));
        const v = Math.min(1, Math.max(0, 1 - (y + half) / (half * 2)));
        this.set({ ...this.hsv, s, v }, phase === 'up');
      }
      if (phase === 'up') dragging = null;
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pick(e, 'down');
    });
    canvas.addEventListener('pointermove', (e) => dragging && pick(e, 'move'));
    canvas.addEventListener('pointerup', (e) => dragging && pick(e, 'up'));
    this.drawDisc();
    return canvas;
  }

  private drawDisc(): void {
    const canvas = this.disc;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvas.width / 250;
    const size = 250;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    // Hue ring.
    for (let a = 0; a < 360; a += 2) {
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${a}, 100%, 50%)`;
      ctx.lineWidth = 26;
      const start = ((a - 91) * Math.PI) / 180;
      ctx.arc(c, c, size * 0.44, start, start + (3 * Math.PI) / 180);
      ctx.stroke();
    }
    // Saturation/brightness square for this hue.
    const half = size * 0.25;
    const [r, g, b] = hsvToRgb({ h: this.hsv.h, s: 1, v: 1 });
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    const white = ctx.createLinearGradient(c - half, 0, c + half, 0);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    const black = ctx.createLinearGradient(0, c - half, 0, c + half);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000000');
    ctx.fillStyle = black;
    ctx.fillRect(c - half, c - half, half * 2, half * 2);
    // Markers.
    const ha = ((this.hsv.h - 90) * Math.PI) / 180;
    this.marker(ctx, c + Math.cos(ha) * size * 0.44, c + Math.sin(ha) * size * 0.44);
    this.marker(ctx, c - half + this.hsv.s * half * 2, c + half - this.hsv.v * half * 2);
  }

  private marker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- Sliders ----------

  private slidersEl(): HTMLElement {
    const wrap = document.createElement('div');
    const [r, g, b] = hsvToRgb(this.hsv);
    const row = (label: string, value: number, max: number, onInput: (v: number, done: boolean) => void): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'st-row';
      el.innerHTML = `<label>${label}</label><input type="range" min="0" max="${max}" step="1"><span class="value"></span>`;
      const input = el.querySelector('input') as HTMLInputElement;
      const out = el.querySelector('.value') as HTMLElement;
      input.value = String(Math.round(value));
      out.textContent = input.value;
      input.addEventListener('input', () => {
        out.textContent = input.value;
        onInput(Number(input.value), false);
      });
      input.addEventListener('change', () => onInput(Number(input.value), true));
      return el;
    };
    const fromRgb = (rr: number, gg: number, bb: number, done: boolean): void => {
      const hsv = rgbToHsv(rr, gg, bb);
      this.set({ ...hsv, h: hsv.s === 0 ? this.hsv.h : hsv.h }, done);
    };
    const hex = document.createElement('div');
    hex.className = 'st-row';
    hex.innerHTML = '<label>Hex</label><input class="st-input" maxlength="7" spellcheck="false">';
    const hexInput = hex.querySelector('input') as HTMLInputElement;
    hexInput.value = this.prefs.color;
    hexInput.addEventListener('change', () => {
      const v = hexInput.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) this.set(hexToHsv(v.startsWith('#') ? v : `#${v}`), true);
    });
    wrap.append(
      row('Hue', this.hsv.h, 359, (v, d) => this.set({ ...this.hsv, h: v }, d)),
      row('Saturation', this.hsv.s * 100, 100, (v, d) => this.set({ ...this.hsv, s: v / 100 }, d)),
      row('Brightness', this.hsv.v * 100, 100, (v, d) => this.set({ ...this.hsv, v: v / 100 }, d)),
      row('Red', r, 255, (v, d) => fromRgb(v, g, b, d)),
      row('Green', g, 255, (v, d) => fromRgb(r, v, b, d)),
      row('Blue', b, 255, (v, d) => fromRgb(r, g, v, d)),
      hex,
    );
    void rgbToHex;
    return wrap;
  }

  // ---------- Harmony ----------

  private harmonyEl(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'st-harmony';
    for (const set of harmonies(this.hsv)) {
      const h = document.createElement('h4');
      h.textContent = set.name;
      const row = document.createElement('div');
      row.className = 'row';
      for (const c of set.colors) row.appendChild(this.swatch(c));
      wrap.append(h, row);
    }
    return wrap;
  }

  // ---------- Palettes ----------

  private palettesEl(): HTMLElement {
    const wrap = document.createElement('div');
    const chips = document.createElement('div');
    chips.className = 'st-tabs';
    const choices = [{ id: 'mine', name: 'My palette' }, ...LIBRARIES.map((l) => ({ id: l.id, name: l.name }))];
    for (const choice of choices) {
      const b = document.createElement('button');
      b.className = `st-tab${this.prefs.library === choice.id ? ' active' : ''}`;
      b.textContent = choice.name;
      b.addEventListener('click', () => {
        this.prefs.library = choice.id;
        savePrefs(this.prefs);
        this.refresh();
      });
      chips.appendChild(b);
    }
    const grid = document.createElement('div');
    grid.className = 'st-swatches';
    if (this.prefs.library === 'mine') {
      const add = document.createElement('button');
      add.className = 'st-swatch add';
      add.textContent = '+';
      add.title = 'Add the current colour';
      add.addEventListener('click', () => {
        if (!this.prefs.myPalette.includes(this.prefs.color)) this.prefs.myPalette.push(this.prefs.color);
        savePrefs(this.prefs);
        this.refresh();
      });
      grid.appendChild(add);
      for (const c of this.prefs.myPalette) {
        const s = this.swatch(c);
        // Hold to remove a colour from your palette.
        let timer = 0;
        s.addEventListener('pointerdown', () => {
          timer = window.setTimeout(() => {
            this.prefs.myPalette = this.prefs.myPalette.filter((x) => x !== c);
            savePrefs(this.prefs);
            this.refresh();
          }, 650);
        });
        s.addEventListener('pointerup', () => window.clearTimeout(timer));
        s.addEventListener('pointerleave', () => window.clearTimeout(timer));
        grid.appendChild(s);
      }
    } else {
      for (const c of LIBRARIES.find((l) => l.id === this.prefs.library)?.colors ?? []) grid.appendChild(this.swatch(c));
    }
    const note = document.createElement('p');
    note.className = 'st-note';
    note.textContent = this.prefs.library === 'mine' ? 'Tap + to add the current colour. Hold a colour to remove it.' : '';
    wrap.append(chips, grid, note);
    return wrap;
  }

  private swatch(color: string): HTMLButtonElement {
    const s = document.createElement('button');
    s.className = 'st-swatch';
    s.style.background = color;
    s.title = color;
    s.addEventListener('click', () => this.set(hexToHsv(color), true));
    return s;
  }
}
