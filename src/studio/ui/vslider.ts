/** A vertical slider on the edge of the screen (brush size, opacity), 0..1. */
export class VSlider {
  readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly thumb: HTMLElement;
  private value = 0.5;

  constructor(label: string, onChange: (value: number, done: boolean) => void) {
    this.el = document.createElement('div');
    this.el.className = 'st-vslider';
    this.el.setAttribute('aria-label', label);
    this.fill = document.createElement('div');
    this.fill.className = 'fill';
    this.thumb = document.createElement('div');
    this.thumb.className = 'thumb';
    const text = document.createElement('label');
    text.textContent = label;
    this.el.append(this.fill, this.thumb, text);
    const pick = (e: PointerEvent, done: boolean): void => {
      const rect = this.el.getBoundingClientRect();
      this.set(1 - (e.clientY - rect.top - 9) / (rect.height - 18));
      onChange(this.value, done);
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      pick(e, false);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.el.hasPointerCapture(e.pointerId)) pick(e, false);
    });
    this.el.addEventListener('pointerup', (e) => pick(e, true));
    // A mouse wheel or two-finger scroll over the slider nudges it.
    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.set(this.value - Math.sign(e.deltaY || -e.deltaX) * 0.03);
        onChange(this.value, true);
      },
      { passive: false },
    );
  }

  set(value: number): void {
    this.value = Math.min(1, Math.max(0, value));
    const h = 150 - 18;
    this.thumb.style.top = `${(1 - this.value) * h}px`;
    this.fill.style.height = `${this.value * (150 - 8)}px`;
  }
}
