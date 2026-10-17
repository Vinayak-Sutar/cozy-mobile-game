import type { AudioEngine } from '../../feel/audio';

/** Letters per second as a bubble fills in. */
const REVEAL = 30;
const VOWELS: Record<string, number> = { a: 0, e: 2, i: 4, o: -2, u: -3, y: 1 };

interface Line {
  speaker: string;
  text: string;
  start: number;
  duration: number;
  /** Base pitch of their babble (MIDI), lifted when happy. */
  voice: number;
  spoken: number;
  lines: string[] | null;
}

/**
 * One speech bubble at a time: it pops up over whoever is talking and fills
 * in letter by letter, with a little babble blip for every other letter.
 */
export class Talk {
  private line: Line | null = null;

  get speaker(): string | null {
    return this.line?.speaker ?? null;
  }

  say(t: number, speaker: string, text: string, voice: number): void {
    this.line = { speaker, text, start: t, duration: text.length / REVEAL + 1.9, voice, spoken: 0, lines: null };
  }

  /** True while someone is still mid-sentence (so others don't talk over them). */
  busy(t: number): boolean {
    return !!this.line && t - this.line.start < this.line.duration - 0.6;
  }

  clear(): void {
    this.line = null;
  }

  update(t: number, audio: AudioEngine, pan: number): void {
    const line = this.line;
    if (!line) return;
    const age = t - line.start;
    if (age > line.duration) {
      this.line = null;
      return;
    }
    const shown = Math.min(line.text.length, Math.floor(age * REVEAL));
    while (line.spoken < shown) {
      const ch = line.text[line.spoken].toLowerCase();
      line.spoken++;
      if (line.spoken % 2 !== 0 || ch < 'a' || ch > 'z') continue;
      audio.babble(line.voice + (VOWELS[ch] ?? (ch.charCodeAt(0) % 5) - 2), pan);
    }
  }

  /** Draws the bubble with its tail pointing at (ax, ay), kept between `left` and `right`, below `top`. */
  draw(ctx: CanvasRenderingContext2D, t: number, ax: number, ay: number, unit: number, left: number, right: number, top: number): void {
    const line = this.line;
    if (!line) return;
    const age = t - line.start;
    const size = Math.round(Math.min(20, Math.max(13, unit * 0.04)));
    ctx.save();
    ctx.font = `700 ${size}px Nunito, Fredoka, system-ui, sans-serif`;
    line.lines ??= wrap(ctx, line.text, Math.min(right - left - 16, unit * 0.68));
    const lineHeight = size * 1.25;
    const pad = size * 0.7;
    const w = Math.max(...line.lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = line.lines.length * lineHeight + pad * 1.3;
    const x = Math.min(Math.max(ax - w / 2, left + 8), right - w - 8);
    const y = Math.max(top, ay - h - unit * 0.03);
    const k = Math.min(1, age / 0.22);
    const pop = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    ctx.globalAlpha = Math.min(1, Math.max(0, (line.duration - age) / 0.3));
    ctx.translate(ax, y + h);
    ctx.scale(pop, pop);
    ctx.translate(-ax, -(y + h));
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(20, 40, 60, 0.22)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(18, h / 2));
    ctx.fill();
    ctx.shadowBlur = 0;
    const tail = Math.min(Math.max(ax, x + 18), x + w - 18);
    ctx.beginPath();
    ctx.moveTo(tail - 8, y + h - 1);
    ctx.lineTo(ax, Math.max(ay, y + h + 4));
    ctx.lineTo(tail + 8, y + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2f3a4f';
    ctx.textBaseline = 'middle';
    let left2 = Math.floor(age * REVEAL);
    line.lines.forEach((text, i) => {
      if (left2 > 0) ctx.fillText(text.slice(0, left2), x + pad, y + pad * 0.65 + lineHeight * (i + 0.5));
      left2 -= text.length + 1;
    });
    ctx.restore();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
