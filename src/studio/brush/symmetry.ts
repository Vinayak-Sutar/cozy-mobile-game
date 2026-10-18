/**
 * Symmetry: each dab is painted again through mirrors and turns around a
 * centre, so one stroke draws a butterfly, a flower or a mandala.
 */
export type SymmetryMode = 'off' | 'vertical' | 'horizontal' | 'quadrant' | 'radial' | 'kaleidoscope';

export const SYMMETRY_MODES: { id: SymmetryMode; name: string }[] = [
  { id: 'off', name: 'Off' },
  { id: 'vertical', name: 'Mirror' },
  { id: 'horizontal', name: 'Mirror across' },
  { id: 'quadrant', name: 'Four ways' },
  { id: 'radial', name: 'Radial' },
  { id: 'kaleidoscope', name: 'Kaleidoscope' },
];

export interface SymmetryAt {
  mode: SymmetryMode;
  count: number;
  /** Centre in canvas pixels. */
  x: number;
  y: number;
}

/** The transforms a dab goes through (the identity first), or null when symmetry is off. */
export function symmetryTransforms(s: SymmetryAt): DOMMatrix[] | null {
  const about = (rotate: number, flipX: boolean, flipY = false): DOMMatrix =>
    new DOMMatrix()
      .translateSelf(s.x, s.y)
      .rotateSelf(rotate)
      .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
      .translateSelf(-s.x, -s.y);
  switch (s.mode) {
    case 'off':
      return null;
    case 'vertical':
      return [new DOMMatrix(), about(0, true)];
    case 'horizontal':
      return [new DOMMatrix(), about(0, false, true)];
    case 'quadrant':
      return [new DOMMatrix(), about(0, true), about(0, false, true), about(180, false)];
    case 'radial':
    case 'kaleidoscope': {
      const n = Math.max(2, Math.min(16, Math.round(s.count)));
      const list: DOMMatrix[] = [];
      for (let i = 0; i < n; i++) {
        const turn = (360 * i) / n;
        list.push(about(turn, false));
        // Kaleidoscope: every slice also has its mirror image.
        if (s.mode === 'kaleidoscope') list.push(about(turn, true));
      }
      return list;
    }
  }
}

/** The guide lines to show, as angles (radians) of lines through the centre. Each runs both ways unless `rays`. */
export function symmetryGuides(s: SymmetryAt): { angles: number[]; rays: boolean } {
  const n = Math.max(2, Math.min(16, Math.round(s.count)));
  switch (s.mode) {
    case 'vertical':
      return { angles: [Math.PI / 2], rays: false };
    case 'horizontal':
      return { angles: [0], rays: false };
    case 'quadrant':
      return { angles: [0, Math.PI / 2], rays: false };
    case 'radial':
      return { angles: Array.from({ length: n }, (_, i) => -Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n), rays: true };
    case 'kaleidoscope':
      return { angles: Array.from({ length: 2 * n }, (_, i) => -Math.PI / 2 + (Math.PI * i) / n), rays: true };
    default:
      return { angles: [], rays: false };
  }
}
