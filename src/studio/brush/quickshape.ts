/**
 * QuickShape (as in Procreate and Sketchbook): hold at the end of a stroke
 * and a wobbly line, circle or box becomes a clean one. Also the gentle
 * "predictive stroke" smoothing that tidies a line when you lift.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'arc'; cx: number; cy: number; r: number; start: number; sweep: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotation: number; circle: boolean }
  | { kind: 'polygon'; points: Pt[]; closed: boolean; name: string };

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Evenly spaced points along a path. */
function resample(pts: Pt[], n: number): Pt[] {
  const L = pathLength(pts);
  if (L === 0) return [pts[0]];
  const step = L / (n - 1);
  const out: Pt[] = [pts[0]];
  let need = step;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = dist(a, b);
    while (d >= need && out.length < n) {
      const k = need / d;
      a = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      out.push(a);
      d -= need;
      need = step;
    }
    need -= d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Ramer–Douglas–Peucker: the few corners that describe a path. */
function simplify(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let worst = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segmentDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= epsilon) return [pts[0], pts[pts.length - 1]];
  const left = simplify(pts.slice(0, index + 1), epsilon);
  const right = simplify(pts.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** How far points stray from a polyline, on average. */
function polylineError(pts: Pt[], poly: Pt[], closed: boolean): number {
  const edges = closed ? poly.length : poly.length - 1;
  let sum = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < edges; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
    sum += best;
  }
  return sum / pts.length;
}

/** Snaps an angle to the nearest quarter turn when it's within `tolerance`. */
function snapAngle(a: number, tolerance = (8 * Math.PI) / 180): number {
  const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(a - q) < tolerance ? q : a;
}

function fitEllipse(pts: Pt[]): { cx: number; cy: number; rx: number; ry: number; rotation: number; error: number } {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= pts.length;
  syy /= pts.length;
  sxy /= pts.length;
  // The main axes of the point cloud.
  const rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const tr = (sxx + syy) / 2;
  const det = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  let rx = Math.sqrt(2 * (tr + det));
  let ry = Math.sqrt(2 * Math.max(0, tr - det));
  // Refine the radii from where the points really are along each axis.
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  let su = 0;
  let sv = 0;
  for (const p of pts) {
    const u = (p.x - cx) * c + (p.y - cy) * s;
    const v = -(p.x - cx) * s + (p.y - cy) * c;
    su += Math.abs(u);
    sv += Math.abs(v);
  }
  // For an ellipse, the mean |cos| is 2/π.
  rx = (rx + (su / pts.length) * (Math.PI / 2)) / 2;
  ry = (ry + (sv / pts.length) * (Math.PI / 2)) / 2;
  let error = 0;
  for (const p of pts) {
    const u = (p.x - cx) * c + (p.y - cy) * s;
    const v = -(p.x - cx) * s + (p.y - cy) * c;
    error += Math.abs(Math.hypot(u / (rx || 1), v / (ry || 1)) - 1);
  }
  return { cx, cy, rx, ry, rotation, error: error / pts.length };
}

/** A circle through three points, or null if they're in a line. */
function circleThrough(a: Pt, b: Pt, c: Pt): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** Squares up a four-cornered shape whose corners are all near right angles. */
function squareUp(poly: Pt[]): Pt[] | null {
  for (let i = 0; i < 4; i++) {
    const p = poly[(i + 3) % 4];
    const q = poly[i];
    const r = poly[(i + 1) % 4];
    const a1 = Math.atan2(p.y - q.y, p.x - q.x);
    const a2 = Math.atan2(r.y - q.y, r.x - q.x);
    let turn = Math.abs(a1 - a2) % (2 * Math.PI);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (Math.abs(turn - Math.PI / 2) > (22 * Math.PI) / 180) return null;
  }
  // Orient the box along its longest side, then take its extents.
  let longest = 0;
  let angle = 0;
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const d = dist(a, b);
    if (d > longest) {
      longest = d;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  angle = snapAngle(((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const p of poly) {
    const u = p.x * c + p.y * s;
    const v = -p.x * s + p.y * c;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const back = (u: number, v: number): Pt => ({ x: u * c - v * s, y: u * s + v * c });
  return [back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)];
}

/**
 * Works out which clean shape a hand-drawn stroke was meant to be, or null
 * if it doesn't look like one. `px` is one screen pixel in canvas pixels.
 */
export function recognise(raw: Pt[], px: number): Shape | null {
  if (raw.length < 4) return null;
  const L = pathLength(raw);
  if (L < 30 * px) return null;
  const a = raw[0];
  const b = raw[raw.length - 1];
  const pts = resample(raw, 72);

  // A straight line: nothing strays far from the line between the ends.
  let stray = 0;
  for (const p of pts) stray = Math.max(stray, segmentDistance(p, a, b));
  if (stray < Math.max(4 * px, dist(a, b) * 0.07)) {
    // Nearly level or upright lines snap straight.
    const angle = snapAngle(Math.atan2(b.y - a.y, b.x - a.x), (4 * Math.PI) / 180);
    const len = dist(a, b);
    return { kind: 'line', a, b: { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len } };
  }

  const closed = dist(a, b) < Math.max(L * 0.2, 24 * px);
  if (closed) {
    const loop = pts.slice(0, -1);
    const e = fitEllipse(loop);
    const size = Math.sqrt(e.rx * e.ry);
    // Start the corner search at the point farthest from the middle, so a corner isn't split.
    let far = 0;
    for (let i = 0; i < loop.length; i++) if (dist(loop[i], { x: e.cx, y: e.cy }) > dist(loop[far], { x: e.cx, y: e.cy })) far = i;
    const turned = [...loop.slice(far), ...loop.slice(0, far), loop[far]];
    const corners = simplify(turned, size * 0.18).slice(0, -1);
    const polyError = corners.length >= 3 ? polylineError(loop, corners, true) / size : Infinity;
    const ellipseError = e.error;
    if (corners.length >= 3 && corners.length <= 6 && polyError < 0.07 && polyError < ellipseError * 0.9) {
      if (corners.length === 4) {
        const box = squareUp(corners);
        if (box) return { kind: 'polygon', points: box, closed: true, name: 'rectangle' };
      }
      return { kind: 'polygon', points: corners, closed: true, name: corners.length === 3 ? 'triangle' : 'shape' };
    }
    if (ellipseError < 0.13) {
      const circle = e.ry / e.rx > 0.86;
      const r = (e.rx + e.ry) / 2;
      return circle
        ? { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: r, ry: r, rotation: 0, circle: true }
        : { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rotation: snapAngle(e.rotation), circle: false };
    }
    return null;
  }

  // An open curve: an arc of a circle, or a few straight pieces.
  const arc = circleThrough(a, pts[36], b);
  if (arc && arc.r < L * 4) {
    let error = 0;
    for (const p of pts) error += Math.abs(dist(p, { x: arc.cx, y: arc.cy }) - arc.r);
    error /= pts.length;
    if (error < arc.r * 0.06) {
      const start = Math.atan2(a.y - arc.cy, a.x - arc.cx);
      const mid = Math.atan2(pts[36].y - arc.cy, pts[36].x - arc.cx);
      const end = Math.atan2(b.y - arc.cy, b.x - arc.cx);
      // Sweep the way that passes through the middle of the stroke.
      const norm = (x: number): number => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const ccw = norm(mid - start) < norm(end - start);
      const sweep = ccw ? norm(end - start) : -norm(start - end);
      return { kind: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, start, sweep };
    }
  }
  const poly = simplify(pts, L * 0.04);
  if (poly.length >= 3 && poly.length <= 6 && polylineError(pts, poly, false) < L * 0.012) {
    return { kind: 'polygon', points: poly, closed: false, name: 'lines' };
  }
  return null;
}

/** What the shape is called, as in "Snapped to a circle". */
export function shapeName(shape: Shape): string {
  switch (shape.kind) {
    case 'line':
      return 'a line';
    case 'arc':
      return 'an arc';
    case 'ellipse':
      return shape.circle ? 'a circle' : 'an ellipse';
    case 'polygon':
      return shape.name === 'lines' ? 'straight lines' : `a ${shape.name}`;
  }
}

/** Points along a shape, `step` canvas pixels apart. */
export function shapePoints(shape: Shape, step: number): Pt[] {
  const out: Pt[] = [];
  const line = (a: Pt, b: Pt, first: boolean): void => {
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let i = first ? 0 : 1; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  switch (shape.kind) {
    case 'line':
      line(shape.a, shape.b, true);
      break;
    case 'polygon': {
      const pts = shape.closed ? [...shape.points, shape.points[0]] : shape.points;
      for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i], i === 1);
      break;
    }
    case 'arc': {
      const n = Math.max(8, Math.ceil((Math.abs(shape.sweep) * shape.r) / step));
      for (let i = 0; i <= n; i++) {
        const a = shape.start + (shape.sweep * i) / n;
        out.push({ x: shape.cx + Math.cos(a) * shape.r, y: shape.cy + Math.sin(a) * shape.r });
      }
      break;
    }
    case 'ellipse': {
      const perimeter = Math.PI * (3 * (shape.rx + shape.ry) - Math.sqrt((3 * shape.rx + shape.ry) * (shape.rx + 3 * shape.ry)));
      const n = Math.max(16, Math.ceil(perimeter / step));
      const c = Math.cos(shape.rotation);
      const s = Math.sin(shape.rotation);
      // Start at the top so the joint sits where people usually start a circle.
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const u = Math.cos(a) * shape.rx;
        const v = Math.sin(a) * shape.ry;
        out.push({ x: shape.cx + u * c - v * s, y: shape.cy + u * s + v * c });
      }
      break;
    }
  }
  return out;
}

/**
 * Predictive stroke: a gentle smoothing of the whole line, keeping its ends
 * where they were. `radius` is how far (in canvas pixels) wobbles are averaged.
 */
export function smoothPath<T extends Pt>(pts: T[], radius: number): T[] {
  if (pts.length < 5 || radius <= 0) return pts;
  // Distance along the path at each point.
  const along: number[] = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + dist(pts[i - 1], pts[i]));
  const total = along[along.length - 1];
  const sigma = Math.min(radius, total / 6);
  if (sigma < 0.5) return pts;
  // Mirror the path through each end point (p0 - (pk - p0)), so the ends stay
  // exactly where they were and the line keeps its direction into them.
  const first = pts[0];
  const last = pts[pts.length - 1];
  const xs: number[] = [];
  const ys: number[] = [];
  const at: number[] = [];
  for (let k = pts.length - 1; k > 0; k--) {
    if (along[k] > sigma * 3) continue;
    xs.push(2 * first.x - pts[k].x);
    ys.push(2 * first.y - pts[k].y);
    at.push(-along[k]);
  }
  for (let i = 0; i < pts.length; i++) {
    xs.push(pts[i].x);
    ys.push(pts[i].y);
    at.push(along[i]);
  }
  for (let k = pts.length - 2; k >= 0; k--) {
    if (total - along[k] > sigma * 3) break;
    xs.push(2 * last.x - pts[k].x);
    ys.push(2 * last.y - pts[k].y);
    at.push(total + (total - along[k]));
  }
  const out: T[] = [];
  let lo = 0;
  for (let i = 0; i < pts.length; i++) {
    const here = along[i];
    while (at[lo] < here - sigma * 3) lo++;
    let wx = 0;
    let wy = 0;
    let w = 0;
    for (let j = lo; j < at.length && at[j] <= here + sigma * 3; j++) {
      const d = (at[j] - here) / sigma;
      const k = Math.exp(-0.5 * d * d);
      wx += xs[j] * k;
      wy += ys[j] * k;
      w += k;
    }
    out.push({ ...pts[i], x: wx / w, y: wy / w });
  }
  return out;
}
