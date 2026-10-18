import { button, icons } from './icons';

/** A panel that slides up from the bottom (or floats at the side on tablets). One open at a time. */
export class Sheet {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private onClose: (() => void) | null = null;
  private current = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('section');
    this.el.className = 'st-sheet';
    const head = document.createElement('div');
    head.className = 'st-sheet-head';
    this.title = document.createElement('h2');
    const close = button(icons.close, 'Close');
    close.addEventListener('click', () => this.close());
    head.append(this.title, close);
    this.body = document.createElement('div');
    this.body.className = 'st-sheet-body';
    this.el.append(head, this.body);
    parent.appendChild(this.el);
  }

  get openId(): string {
    return this.el.classList.contains('open') ? this.current : '';
  }

  /** Shows `content` under `title`. Opening the same sheet again closes it. */
  open(id: string, title: string, content: HTMLElement, onClose?: () => void): void {
    if (this.openId === id) {
      this.close();
      return;
    }
    this.onClose?.();
    this.current = id;
    this.title.textContent = title;
    this.body.replaceChildren(content);
    this.body.scrollTop = 0;
    this.onClose = onClose ?? null;
    this.el.classList.add('open');
  }

  close(): void {
    if (!this.el.classList.contains('open')) return;
    this.el.classList.remove('open');
    const done = this.onClose;
    this.onClose = null;
    this.current = '';
    done?.();
  }
}
