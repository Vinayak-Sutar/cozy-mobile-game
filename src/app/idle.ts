import { createPointer, type Pointer } from '../input/pointers';
import type { Toy } from '../toys/Toy';
import { rand } from '../util/color';

const GHOST_ID = -100;
const FADE_IN = 0.45;
const DRAW_TIME = 2.8;
const FADE_OUT = 0.5;

interface Ghost {
  start: number;
  cx: number;
  cy: number;
  radius: number;
  pointer: Pointer;
  pressed: boolean;
  lifted: boolean;
}

/**
 * Keeps a toy alive when nobody is touching it: gentle ambient motion, and a
 * "ghost finger" that draws a swirl to show what to do, with no words needed.
 */
export class IdleDirector {
  private ghost: Ghost | null = null;
  private nextAmbient = 0;
  private enteredAt = 0;
  private lastGhostEnd = -Infinity;
  private touched = false;

  constructor(private readonly hooks: { down(p: Pointer): void; up(p: Pointer): void }) {}

  /** The ghost's pointer while it is pressed, so the stage can move fluid with it. */
  get pointer(): Pointer | null {
    return this.ghost?.pressed && !this.ghost.lifted ? this.ghost.pointer : null;
  }

  get visible(): boolean {
    return this.ghost !== null;
  }

  reset(now: number): void {
    this.ghost = null;
    this.touched = false;
    this.enteredAt = now;
    this.nextAmbient = now + 2500;
    this.lastGhostEnd = -Infinity;
  }

  /** A real finger arrived: the ghost politely leaves. */
  noteTouch(): void {
    this.touched = true;
    const ghost = this.ghost;
    if (ghost && ghost.pressed && !ghost.lifted) {
      ghost.lifted = true;
      this.hooks.up(ghost.pointer);
    }
    this.ghost = null;
    this.lastGhostEnd = performance.now();
  }

  update(now: number, idleMs: number, fingersDown: boolean, toy: Toy, view: { width: number; height: number }): void {
    if (fingersDown) return;

    if (this.ghost) {
      this.animateGhost(now);
      return;
    }

    const firstHint = !this.touched && now - this.enteredAt > 3000 && idleMs > 3000;
    // Quiet toys (painting) only get the first hint, never reminders or idle motion.
    const reminder = !toy.quietIdle && idleMs > 25000;
    if ((firstHint || reminder) && now - this.lastGhostEnd > 15000) {
      this.startGhost(now, view);
      return;
    }

    if (!toy.quietIdle && idleMs > 2500 && now > this.nextAmbient) {
      toy.ambient();
      this.nextAmbient = now + rand(2200, 3800);
    }
  }

  draw(ctx: CanvasRenderingContext2D, color: string, now: number): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const t = (now - ghost.start) / 1000;
    const alpha =
      t < FADE_IN ? t / FADE_IN : t > FADE_IN + DRAW_TIME ? Math.max(0, 1 - (t - FADE_IN - DRAW_TIME) / FADE_OUT) : 1;
    const pressed = ghost.pressed && !ghost.lifted;
    const r = pressed ? 17 : 21;
    const { x, y } = ghost.pointer;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * (pressed ? 0.35 : 0.2);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private startGhost(now: number, view: { width: number; height: number }): void {
    const radius = Math.min(view.width, view.height) * 0.22;
    const cx = view.width / 2;
    const cy = view.height / 2;
    const pointer = createPointer(GHOST_ID, cx, cy, true);
    this.ghost = { start: now, cx, cy, radius, pointer, pressed: false, lifted: false };
  }

  private animateGhost(now: number): void {
    const ghost = this.ghost!;
    const t = (now - ghost.start) / 1000;
    const drawT = Math.min(1, Math.max(0, (t - FADE_IN) / DRAW_TIME));
    // A lazy figure-of-eight, eased at both ends.
    const eased = drawT * drawT * (3 - 2 * drawT);
    const theta = eased * Math.PI * 2;
    ghost.pointer.x = ghost.cx + Math.sin(theta) * ghost.radius;
    ghost.pointer.y = ghost.cy + Math.sin(theta * 2) * ghost.radius * 0.45;

    if (!ghost.pressed && t >= FADE_IN) {
      ghost.pressed = true;
      ghost.pointer.frameX = ghost.pointer.x;
      ghost.pointer.frameY = ghost.pointer.y;
      this.hooks.down(ghost.pointer);
    }
    if (ghost.pressed && !ghost.lifted && t >= FADE_IN + DRAW_TIME) {
      ghost.lifted = true;
      this.hooks.up(ghost.pointer);
    }
    if (t >= FADE_IN + DRAW_TIME + FADE_OUT) {
      this.ghost = null;
      this.lastGhostEnd = now;
    }
  }
}
