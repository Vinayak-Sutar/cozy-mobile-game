const HOLD_MS = 600;
const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A button that only fires after a short hold (a ring fills up), so a toddler
 * tapping around can't leave or pause the toy by accident.
 */
export class HoldButton {
  readonly el: HTMLButtonElement;
  private readonly ring: SVGCircleElement;
  private start = 0;
  private raf = 0;
  private timer = 0;

  constructor(
    parent: HTMLElement,
    icon: string,
    label: string,
    private readonly onComplete: () => void,
  ) {
    const el = document.createElement('button');
    el.className = 'hold-button';
    el.setAttribute('aria-label', label);
    el.innerHTML = `
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle class="ring-track" cx="26" cy="26" r="${RADIUS}" />
        <circle class="ring" cx="26" cy="26" r="${RADIUS}"
          stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}" />
      </svg>
      <span class="icon">${icon}</span>`;
    parent.appendChild(el);
    this.el = el;
    this.ring = el.querySelector('.ring') as SVGCircleElement;

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.cancel);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('pointerleave', this.cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keyboard and screen-reader users get an immediate action.
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onComplete();
      }
    });
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Not fatal: the hold still works without capture.
    }
    this.start = performance.now();
    this.el.classList.add('holding');
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.timer);
    this.raf = requestAnimationFrame(this.tick);
    // The timer decides; the animation frame only paints the ring.
    this.timer = window.setTimeout(() => {
      this.reset();
      this.onComplete();
    }, HOLD_MS);
  };

  private readonly tick = (now: number): void => {
    const progress = Math.min(1, (now - this.start) / HOLD_MS);
    this.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    if (progress < 1) this.raf = requestAnimationFrame(this.tick);
  };

  private readonly cancel = (): void => {
    if (!this.el.classList.contains('holding')) return;
    this.reset();
  };

  private reset(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.timer);
    this.el.classList.remove('holding');
    this.ring.style.strokeDashoffset = String(CIRCUMFERENCE);
  }
}
