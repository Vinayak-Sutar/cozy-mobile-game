/**
 * Turns raw pointer events into painting and gestures:
 * - one finger, pen or mouse paints (every in-between sample is used, with pressure and tilt);
 * - two fingers pinch to zoom, rotate and pan; a quick two-finger tap undoes;
 * - a three-finger tap redoes; a four-finger tap hides the interface;
 * - touch and hold (without moving) picks a colour;
 * - pausing at the end of a stroke (still touching) asks for QuickShape.
 * In pen-only mode, fingers never paint: one finger pans, two pinch.
 */
export interface InputPoint {
  x: number;
  y: number;
  /** 0..1 from a stylus; null when the device has no real pressure (fingers, mouse). */
  pressure: number | null;
  tiltX: number;
  tiltY: number;
  /** Milliseconds. */
  t: number;
}

export interface InputHandlers {
  strokeStart(point: InputPoint, pen: boolean): void;
  strokeMove(points: InputPoint[]): void;
  strokeEnd(): void;
  strokeCancel(): void;
  /** The pointer stopped still for a moment partway through a stroke. */
  strokeHold(): void;
  pinchStart(a: [number, number], b: [number, number]): void;
  pinch(a: [number, number], b: [number, number]): void;
  pinchEnd(): void;
  pan(dx: number, dy: number): void;
  undo(): void;
  redo(): void;
  toggleUi(): void;
  eyedropper(x: number, y: number, phase: 'start' | 'move' | 'end'): void;
  penDetected(): void;
}

interface Tracked {
  id: number;
  type: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

/** 'wait': a stroke ended but other fingers (a resting palm) are still down; ignore them until they lift. */
type State = 'idle' | 'drawing' | 'gesture' | 'pan' | 'eyedropper' | 'wait';

const HOLD_MS = 450;
const TAP_MS = 320;
/** How long to stay still at the end of a stroke for QuickShape. */
const SHAPE_MS = 520;

export class StudioInput {
  penOnly = false;
  private pointers = new Map<number, Tracked>();
  private state: State = 'idle';
  private drawer = -1;
  private strokeStart = 0;
  private strokeTravel = 0;
  private holdTimer = 0;
  private stillTimer = 0;
  private still: [number, number] = [0, 0];
  private gestureStart = 0;
  private gestureFingers = 0;
  private gestureMoved = false;
  private penSeen = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('contextmenu', this.prevent);
    el.style.touchAction = 'none';
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
    this.el.removeEventListener('contextmenu', this.prevent);
    window.clearTimeout(this.holdTimer);
    window.clearTimeout(this.stillTimer);
  }

  private prevent = (e: Event): void => e.preventDefault();

  private local(e: PointerEvent): [number, number] {
    const rect = this.el.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private point(e: PointerEvent): InputPoint {
    const [x, y] = this.local(e);
    const pen = e.pointerType === 'pen';
    return { x, y, pressure: pen ? Math.max(0.02, e.pressure) : null, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0, t: e.timeStamp };
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const [x, y] = this.local(e);
    this.pointers.set(e.pointerId, { id: e.pointerId, type: e.pointerType, x, y, startX: x, startY: y });
    if (e.pointerType === 'pen' && !this.penSeen) {
      this.penSeen = true;
      this.handlers.penDetected();
    }
    const count = this.pointers.size;
    if (this.state === 'wait' && e.pointerType === 'pen') this.state = 'idle';

    if (this.state === 'idle') {
      if (this.penOnly && e.pointerType === 'touch') {
        this.state = 'pan';
        // In pen-only mode a finger still picks colours: touch and hold without moving.
        window.clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => {
          const p = this.pointers.get(e.pointerId);
          if (this.state === 'pan' && this.pointers.size === 1 && p && Math.hypot(p.x - p.startX, p.y - p.startY) < 8) {
            this.state = 'eyedropper';
            this.drawer = e.pointerId;
            this.handlers.eyedropper(p.x, p.y, 'start');
          }
        }, HOLD_MS);
        return;
      }
      this.state = 'drawing';
      this.drawer = e.pointerId;
      this.strokeStart = performance.now();
      this.strokeTravel = 0;
      this.still = [x, y];
      this.handlers.strokeStart(this.point(e), e.pointerType === 'pen');
      // Touch and hold without moving: pick a colour instead.
      if (e.pointerType !== 'pen') {
        window.clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => {
          if (this.state === 'drawing' && this.strokeTravel < 8) {
            this.handlers.strokeCancel();
            this.state = 'eyedropper';
            const p = this.pointers.get(this.drawer);
            if (p) this.handlers.eyedropper(p.x, p.y, 'start');
          }
        }, HOLD_MS);
      }
      return;
    }

    // A second finger landing just after the first means a gesture, not a stroke.
    if (this.state === 'drawing' && e.pointerType === 'touch') {
      const drawer = this.pointers.get(this.drawer);
      if (drawer?.type === 'pen') return; // A resting hand while drawing with a pen.
      if (performance.now() - this.strokeStart < 260 || this.strokeTravel < 14) {
        this.handlers.strokeCancel();
        window.clearTimeout(this.holdTimer);
        window.clearTimeout(this.stillTimer);
        this.startGesture();
      }
      return;
    }
    if (this.state === 'pan' && count >= 2) {
      this.startGesture();
      return;
    }
    if (this.state === 'gesture') this.gestureFingers = Math.max(this.gestureFingers, count);
  };

  private startGesture(): void {
    this.state = 'gesture';
    this.gestureStart = performance.now();
    this.gestureFingers = this.pointers.size;
    this.gestureMoved = false;
    const [a, b] = [...this.pointers.values()];
    this.handlers.pinchStart([a.x, a.y], [b.x, b.y]);
  }

  private move = (e: PointerEvent): void => {
    const tracked = this.pointers.get(e.pointerId);
    if (!tracked) return;
    const [x, y] = this.local(e);
    const dx = x - tracked.x;
    const dy = y - tracked.y;
    tracked.x = x;
    tracked.y = y;

    if (this.state === 'drawing' && e.pointerId === this.drawer) {
      this.strokeTravel += Math.hypot(dx, dy);
      const events = e.getCoalescedEvents?.() ?? [];
      const points = (events.length ? events : [e]).map((ev) => this.point(ev));
      this.handlers.strokeMove(points);
      // Restart the "held still" clock whenever the pointer really moves (a pen trembles a little).
      if (Math.hypot(x - this.still[0], y - this.still[1]) > 5) {
        this.still = [x, y];
        window.clearTimeout(this.stillTimer);
        this.stillTimer = window.setTimeout(() => {
          if (this.state === 'drawing' && this.strokeTravel > 30) this.handlers.strokeHold();
        }, SHAPE_MS);
      }
    } else if (this.state === 'gesture') {
      const [a, b] = [...this.pointers.values()];
      if (a && b) this.handlers.pinch([a.x, a.y], [b.x, b.y]);
      if (Math.hypot(tracked.x - tracked.startX, tracked.y - tracked.startY) > 12) this.gestureMoved = true;
    } else if (this.state === 'pan') {
      this.handlers.pan(dx, dy);
    } else if (this.state === 'eyedropper' && e.pointerId === this.drawer) {
      this.handlers.eyedropper(x, y, 'move');
    }
  };

  private up = (e: PointerEvent): void => {
    this.release(e, false);
  };

  private cancel = (e: PointerEvent): void => {
    this.release(e, true);
  };

  private release(e: PointerEvent, cancelled: boolean): void {
    const tracked = this.pointers.get(e.pointerId);
    if (!tracked) return;
    this.pointers.delete(e.pointerId);
    if (this.state === 'drawing' && e.pointerId === this.drawer) {
      window.clearTimeout(this.holdTimer);
      window.clearTimeout(this.stillTimer);
      if (cancelled) this.handlers.strokeCancel();
      else this.handlers.strokeEnd();
      this.state = this.pointers.size ? 'wait' : 'idle';
      return;
    }
    if (this.state === 'eyedropper' && e.pointerId === this.drawer) {
      this.handlers.eyedropper(tracked.x, tracked.y, 'end');
      this.state = 'idle';
      return;
    }
    if (this.state === 'gesture') {
      if (this.pointers.size === 1 && !this.gestureMoved) {
        // Fingers lifting one by one at the end of a tap: wait for the last.
      } else if (this.pointers.size === 1) {
        this.handlers.pinchEnd();
      }
      if (this.pointers.size === 0) {
        this.handlers.pinchEnd();
        const quick = performance.now() - this.gestureStart < TAP_MS;
        if (quick && !this.gestureMoved) {
          if (this.gestureFingers === 2) this.handlers.undo();
          else if (this.gestureFingers === 3) this.handlers.redo();
          else if (this.gestureFingers >= 4) this.handlers.toggleUi();
        }
        this.state = 'idle';
      }
      return;
    }
    if (this.pointers.size === 0) this.state = 'idle';
  }
}
