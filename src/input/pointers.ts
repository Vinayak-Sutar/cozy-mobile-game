/** One finger (or the mouse, or the idle "ghost" finger). Positions are CSS pixels. */
export interface Pointer {
  id: number;
  x: number;
  y: number;
  /** Position when the stage last consumed this pointer's movement. */
  frameX: number;
  frameY: number;
  startX: number;
  startY: number;
  /** Seconds (performance.now based) when the finger went down. */
  startTime: number;
  /** Increments per stroke across the session; toys use it to pick colours. */
  stroke: number;
  /** Smoothed speed in CSS px per second. */
  speed: number;
  /** Distance travelled since the last note was played. */
  travel: number;
  lastNoteAt: number;
  synthetic: boolean;
}

export interface PointerHandlers {
  down(pointer: Pointer): void;
  up(pointer: Pointer): void;
}

let strokeCounter = 0;

export function createPointer(id: number, x: number, y: number, synthetic = false): Pointer {
  return {
    id,
    x,
    y,
    frameX: x,
    frameY: y,
    startX: x,
    startY: y,
    startTime: performance.now() / 1000,
    stroke: strokeCounter++,
    speed: 0,
    travel: 0,
    lastNoteAt: 0,
    synthetic,
  };
}

/**
 * Tracks every active touch on an element with pointer events. Movement is
 * only recorded here; the stage consumes it once per frame so fast strokes
 * can be interpolated smoothly.
 */
export class PointerTracker {
  readonly pointers = new Map<number, Pointer>();
  lastActivity = performance.now();

  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: PointerHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('lostpointercapture', this.onUp);
    el.addEventListener('contextmenu', preventDefault);
  }

  get count(): number {
    return this.pointers.size;
  }

  /** Lifts every finger (used when switching toys mid-touch). */
  releaseAll(): void {
    for (const pointer of this.pointers.values()) this.handlers.up(pointer);
    this.pointers.clear();
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic or already-released pointers; tracking still works.
    }
    const pointer = createPointer(e.pointerId, e.clientX, e.clientY);
    this.pointers.set(e.pointerId, pointer);
    this.lastActivity = performance.now();
    this.handlers.down(pointer);
  };

  private readonly onMove = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    this.lastActivity = performance.now();
  };

  private readonly onUp = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;
    pointer.x = e.clientX || pointer.x;
    pointer.y = e.clientY || pointer.y;
    this.pointers.delete(e.pointerId);
    this.lastActivity = performance.now();
    this.handlers.up(pointer);
  };
}

function preventDefault(e: Event): void {
  e.preventDefault();
}
