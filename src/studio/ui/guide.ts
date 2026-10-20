export interface GuideStep {
  /** What to point at; none puts the card in the middle. */
  target?: () => Element | null;
  title: string;
  text: string;
}

/**
 * A short first-painting guide: dims the screen, rings one control at a
 * time, and explains it in a card. Skip any time; it can be shown again
 * from the ⋯ menu.
 */
export class Guide {
  readonly el: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly card: HTMLElement;
  private index = 0;

  constructor(
    parent: HTMLElement,
    private readonly steps: GuideStep[],
    private readonly onDone: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'st-guide';
    this.ring = document.createElement('div');
    this.ring.className = 'st-guide-ring';
    this.card = document.createElement('div');
    this.card.className = 'st-guide-card';
    this.el.append(this.ring, this.card);
    parent.appendChild(this.el);
    window.addEventListener('resize', this.place);
    this.show(0);
  }

  private show(i: number): void {
    this.index = i;
    const step = this.steps[i];
    const last = i === this.steps.length - 1;
    const title = document.createElement('h3');
    title.textContent = step.title;
    const text = document.createElement('p');
    text.textContent = step.text;
    const row = document.createElement('div');
    row.className = 'st-guide-row';
    const dots = document.createElement('span');
    dots.className = 'st-guide-dots';
    dots.textContent = `${i + 1} of ${this.steps.length}`;
    const skip = document.createElement('button');
    skip.className = 'st-chip-btn';
    skip.textContent = last ? 'Back' : 'Skip';
    skip.addEventListener('click', () => (last && i > 0 ? this.show(i - 1) : this.finish()));
    const next = document.createElement('button');
    next.className = 'st-chip-btn primary';
    next.textContent = last ? 'Start painting' : 'Next';
    next.addEventListener('click', () => (last ? this.finish() : this.show(i + 1)));
    row.append(dots, skip, next);
    this.card.replaceChildren(title, text, row);
    this.place();
  }

  /** Rings the target and puts the card above or below it, on screen. */
  private place = (): void => {
    const step = this.steps[this.index];
    const bounds = this.el.getBoundingClientRect();
    const target = step.target?.();
    const card = this.card;
    card.style.left = '';
    card.style.top = '';
    if (!target) {
      this.ring.classList.add('none');
      card.classList.add('middle');
      return;
    }
    card.classList.remove('middle');
    this.ring.classList.remove('none');
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.ring.style, {
      left: `${r.left - bounds.left - pad}px`,
      top: `${r.top - bounds.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const cw = Math.min(330, bounds.width - 24);
    const ch = card.offsetHeight || 150;
    const below = r.bottom - bounds.top + 16;
    const above = r.top - bounds.top - 16 - ch;
    const top = below + ch < bounds.height - 8 ? below : Math.max(8, above);
    const left = Math.min(bounds.width - cw - 12, Math.max(12, r.left - bounds.left + r.width / 2 - cw / 2));
    card.style.width = `${cw}px`;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };

  finish(): void {
    window.removeEventListener('resize', this.place);
    this.el.remove();
    this.onDone();
  }
}
