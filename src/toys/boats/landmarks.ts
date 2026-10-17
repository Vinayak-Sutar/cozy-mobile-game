/**
 * The places on the shore that passengers want to visit, three per map.
 * Each is drawn standing on the ground at (x, y), about `s` tall. The same
 * drawing is used, small, in a passenger's wish bubble and the map arrow.
 */
export type PlaceId =
  | 'house'
  | 'tree'
  | 'tent'
  | 'mill'
  | 'picnic'
  | 'barn'
  | 'hut'
  | 'lighthouse'
  | 'icecream'
  | 'igloo'
  | 'snowman'
  | 'cabin'
  | 'lamp'
  | 'treehouse'
  | 'observatory';

type Draw = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void;

const OUTLINE = 'rgba(70, 45, 30, 0.45)';

function poly(ctx: CanvasRenderingContext2D, points: [number, number][], fill: string, stroke = true): void {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke = false): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) ctx.stroke();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const house: Draw = (ctx, x, y, s) => {
  const w = s * 0.78;
  const wall = s * 0.5;
  ctx.fillStyle = '#fff3dc';
  ctx.beginPath();
  ctx.rect(x - w / 2, y - wall, w, wall);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b5654a';
  ctx.fillRect(x + w * 0.22, y - s * 0.98, s * 0.11, s * 0.25);
  poly(ctx, [
    [x - w * 0.62, y - wall + s * 0.02],
    [x, y - s],
    [x + w * 0.62, y - wall + s * 0.02],
  ], '#e8735a');
  ctx.fillStyle = '#8a5a3c';
  ctx.beginPath();
  ctx.roundRect(x - w * 0.12, y - wall * 0.62, w * 0.24, wall * 0.62, [s * 0.08, s * 0.08, 0, 0]);
  ctx.fill();
  ctx.fillStyle = '#9fd3f0';
  ctx.fillRect(x + w * 0.18, y - wall * 0.72, w * 0.2, wall * 0.3);
  ctx.fillRect(x - w * 0.38, y - wall * 0.72, w * 0.2, wall * 0.3);
};

const tree: Draw = (ctx, x, y, s) => {
  poly(ctx, [
    [x - s * 0.08, y],
    [x - s * 0.05, y - s * 0.5],
    [x + s * 0.05, y - s * 0.5],
    [x + s * 0.08, y],
  ], '#8a5a3c', false);
  for (const [dx, dy, r] of [
    [-0.2, -0.55, 0.22],
    [0.2, -0.55, 0.22],
    [0, -0.75, 0.27],
    [0, -0.5, 0.2],
  ]) {
    circle(ctx, x + dx * s, y + dy * s, r * s, '#5fae5a');
  }
  circle(ctx, x - s * 0.08, y - s * 0.84, s * 0.1, 'rgba(255, 255, 255, 0.18)');
  for (const [dx, dy] of [
    [-0.22, -0.6],
    [0.15, -0.78],
    [0.24, -0.5],
    [-0.05, -0.6],
  ]) {
    circle(ctx, x + dx * s, y + dy * s, s * 0.045, '#e8534a');
  }
};

const tent: Draw = (ctx, x, y, s) => {
  const w = s * 0.82;
  const h = s * 0.62;
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + w / 2, y);
  };
  ctx.fillStyle = '#ffe08a';
  outline();
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#6fb6e8';
  for (let i = -3; i <= 3; i += 2) {
    poly(ctx, [
      [x, y - h],
      [x + (i * w) / 7, y],
      [x + ((i + 1) * w) / 7, y],
    ], '#6fb6e8', false);
  }
  ctx.restore();
  outline();
  ctx.stroke();
  poly(ctx, [
    [x - w * 0.1, y],
    [x, y - h * 0.4],
    [x + w * 0.1, y],
  ], '#5a3e2e', false);
  flag(ctx, x, y - h, s * 0.36, '#e8534a');
};

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = '#8a5a3c';
  ctx.lineWidth = Math.max(1, h * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  ctx.restore();
  poly(ctx, [
    [x, y - h],
    [x + h * 0.55, y - h * 0.8],
    [x, y - h * 0.6],
  ], color, false);
}

const mill: Draw = (ctx, x, y, s) => {
  const w = s * 0.62;
  const wall = s * 0.55;
  // The water wheel, beside the mill.
  const wx = x + w * 0.55;
  const wy = y - s * 0.22;
  const r = s * 0.24;
  circle(ctx, wx, wy, r, '#a8774f', true);
  circle(ctx, wx, wy, r * 0.72, '#d9b98c');
  ctx.save();
  ctx.strokeStyle = '#7a5236';
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + Math.cos(a) * r, wy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
  circle(ctx, wx, wy, s * 0.045, '#7a5236');
  ctx.fillStyle = '#e9e0cf';
  ctx.beginPath();
  ctx.rect(x - w / 2, y - wall, w, wall);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 100, 80, 0.35)';
  ctx.lineWidth = 1;
  for (let row = 1; row < 4; row++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - (wall * row) / 4);
    ctx.lineTo(x + w / 2, y - (wall * row) / 4);
    ctx.stroke();
  }
  ctx.restore();
  poly(ctx, [
    [x - w * 0.62, y - wall],
    [x, y - s],
    [x + w * 0.62, y - wall],
  ], '#7c8fa8');
  ctx.fillStyle = '#6b4a33';
  ctx.beginPath();
  ctx.roundRect(x - w * 0.15, y - wall * 0.55, w * 0.3, wall * 0.55, [s * 0.1, s * 0.1, 0, 0]);
  ctx.fill();
};

const picnic: Draw = (ctx, x, y, s) => {
  // A checked blanket, seen a little from above, with a basket on it.
  const w = s * 0.95;
  const top = y - s * 0.3;
  const corners: [number, number][] = [
    [x - w * 0.36, top],
    [x + w * 0.36, top],
    [x + w * 0.5, y],
    [x - w * 0.5, y],
  ];
  poly(ctx, corners, '#ffffff');
  ctx.save();
  ctx.beginPath();
  corners.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(232, 83, 74, 0.75)';
  for (let i = -5; i <= 5; i += 2) {
    ctx.fillRect(x + i * w * 0.09, top, w * 0.09, s * 0.3);
  }
  for (let j = 0; j < 4; j += 2) ctx.fillRect(x - w / 2, top + j * s * 0.075, w, s * 0.075);
  ctx.restore();
  const bx = x - s * 0.06;
  const by = y - s * 0.12;
  ctx.save();
  ctx.strokeStyle = '#8a5a3c';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.arc(bx, by - s * 0.2, s * 0.17, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#c99a5b';
  ctx.beginPath();
  ctx.roundRect(bx - s * 0.22, by - s * 0.22, s * 0.44, s * 0.26, s * 0.05);
  ctx.fill();
  ctx.stroke();
  circle(ctx, x + s * 0.28, y - s * 0.08, s * 0.07, '#e8534a');
};

const barn: Draw = (ctx, x, y, s) => {
  const w = s * 0.8;
  const wall = s * 0.5;
  poly(ctx, [
    [x - w / 2, y],
    [x - w / 2, y - wall],
    [x - w * 0.35, y - s * 0.82],
    [x, y - s],
    [x + w * 0.35, y - s * 0.82],
    [x + w / 2, y - wall],
    [x + w / 2, y],
  ], '#d9534a');
  poly(ctx, [
    [x - w * 0.58, y - wall + s * 0.02],
    [x - w * 0.38, y - s * 0.86],
    [x, y - s * 1.04],
    [x + w * 0.38, y - s * 0.86],
    [x + w * 0.58, y - wall + s * 0.02],
    [x + w * 0.5, y - wall + s * 0.02],
    [x + w * 0.33, y - s * 0.8],
    [x, y - s * 0.96],
    [x - w * 0.33, y - s * 0.8],
    [x - w * 0.5, y - wall + s * 0.02],
  ], '#f6efe2', false);
  ctx.fillStyle = '#f6efe2';
  ctx.fillRect(x - w * 0.22, y - wall * 0.8, w * 0.44, wall * 0.8);
  ctx.save();
  ctx.strokeStyle = '#d9534a';
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.22, y - wall * 0.8);
  ctx.lineTo(x + w * 0.22, y);
  ctx.moveTo(x + w * 0.22, y - wall * 0.8);
  ctx.lineTo(x - w * 0.22, y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff3dc';
  ctx.fillRect(x - w * 0.08, y - s * 0.78, w * 0.16, s * 0.12);
};

const hut: Draw = (ctx, x, y, s) => {
  const w = s * 0.6;
  const wall = s * 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - w / 2, y - wall, w, wall);
  ctx.fillStyle = '#5aa9e6';
  for (let i = 0; i < 5; i += 2) ctx.fillRect(x - w / 2 + (i * w) / 5, y - wall, w / 5, wall);
  ctx.strokeRect(x - w / 2, y - wall, w, wall);
  poly(ctx, [
    [x - w * 0.62, y - wall],
    [x, y - s],
    [x + w * 0.62, y - wall],
  ], '#ffcf5a');
  ctx.fillStyle = '#6b4a33';
  ctx.fillRect(x - w * 0.14, y - wall * 0.6, w * 0.28, wall * 0.6);
};

const lighthouse: Draw = (ctx, x, y, s) => {
  const base = s * 0.2;
  const top = s * 0.12;
  const tower: [number, number][] = [
    [x - base, y],
    [x - top, y - s * 0.72],
    [x + top, y - s * 0.72],
    [x + base, y],
  ];
  poly(ctx, tower, '#ffffff');
  ctx.save();
  ctx.beginPath();
  tower.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#e8534a';
  for (let i = 0; i < 3; i++) ctx.fillRect(x - base, y - s * (0.12 + i * 0.24), base * 2, s * 0.12);
  ctx.restore();
  glow(ctx, x, y - s * 0.8, s * 0.32, 'rgba(255, 230, 150, 0.8)');
  ctx.fillStyle = '#ffe58a';
  ctx.fillRect(x - top, y - s * 0.86, top * 2, s * 0.14);
  ctx.strokeRect(x - top, y - s * 0.86, top * 2, s * 0.14);
  poly(ctx, [
    [x - top * 1.3, y - s * 0.86],
    [x, y - s],
    [x + top * 1.3, y - s * 0.86],
  ], '#3e4660');
};

const icecream: Draw = (ctx, x, y, s) => {
  const w = s * 0.62;
  // The cart, with wheels and a striped awning, and a giant cone on top.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - s * 0.42, w, s * 0.32, s * 0.04);
  ctx.fill();
  ctx.stroke();
  circle(ctx, x - w * 0.3, y - s * 0.07, s * 0.07, '#5a4a5c');
  circle(ctx, x + w * 0.3, y - s * 0.07, s * 0.07, '#5a4a5c');
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff8fb1';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.6 + (i * w * 1.2) / 6, y - s * 0.62);
    ctx.lineTo(x - w * 0.6 + ((i + 1) * w * 1.2) / 6, y - s * 0.62);
    ctx.lineTo(x - w * 0.6 + ((i + 1) * w * 1.2) / 6, y - s * 0.52);
    ctx.arc(x - w * 0.6 + ((i + 0.5) * w * 1.2) / 6, y - s * 0.52, (w * 0.6) / 6, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  poly(ctx, [
    [x - s * 0.09, y - s * 0.72],
    [x + s * 0.09, y - s * 0.72],
    [x, y - s * 0.62],
  ], '#e8b46a');
  circle(ctx, x, y - s * 0.8, s * 0.11, '#ff9fc0', true);
  circle(ctx, x + s * 0.02, y - s * 0.93, s * 0.08, '#fff2c4', true);
  circle(ctx, x + s * 0.03, y - s * 1.02, s * 0.025, '#e8534a');
};

const igloo: Draw = (ctx, x, y, s) => {
  const r = s * 0.48;
  ctx.fillStyle = '#f4fbff';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120, 160, 200, 0.5)';
  ctx.lineWidth = 1;
  for (let row = 1; row < 4; row++) {
    const yy = y - (r * row) / 4;
    ctx.beginPath();
    ctx.moveTo(x - r, yy);
    ctx.lineTo(x + r, yy);
    ctx.stroke();
    for (let col = -3; col <= 3; col++) {
      const xx = x + ((col + (row % 2) * 0.5) * r) / 3;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + r / 4);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = '#e4f1fa';
  ctx.beginPath();
  ctx.roundRect(x + r * 0.15, y - r * 0.55, r * 0.6, r * 0.55, [r * 0.3, r * 0.3, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3e4660';
  ctx.beginPath();
  ctx.roundRect(x + r * 0.27, y - r * 0.4, r * 0.36, r * 0.4, [r * 0.18, r * 0.18, 0, 0]);
  ctx.fill();
};

const snowman: Draw = (ctx, x, y, s) => {
  circle(ctx, x, y - s * 0.2, s * 0.22, '#ffffff', true);
  circle(ctx, x, y - s * 0.52, s * 0.16, '#ffffff', true);
  circle(ctx, x, y - s * 0.76, s * 0.12, '#ffffff', true);
  ctx.fillStyle = '#e8534a';
  ctx.fillRect(x - s * 0.15, y - s * 0.66, s * 0.3, s * 0.05);
  ctx.fillRect(x + s * 0.06, y - s * 0.66, s * 0.06, s * 0.16);
  poly(ctx, [
    [x, y - s * 0.77],
    [x + s * 0.14, y - s * 0.74],
    [x, y - s * 0.72],
  ], '#f39a3c', false);
  ctx.fillStyle = '#3b3346';
  ctx.fillRect(x - s * 0.13, y - s * 0.89, s * 0.26, s * 0.03);
  ctx.fillRect(x - s * 0.08, y - s * 1.0, s * 0.16, s * 0.12);
  circle(ctx, x - s * 0.045, y - s * 0.8, s * 0.018, '#3b3346');
  circle(ctx, x + s * 0.035, y - s * 0.8, s * 0.018, '#3b3346');
  circle(ctx, x, y - s * 0.48, s * 0.02, '#3b3346');
  circle(ctx, x, y - s * 0.4, s * 0.02, '#3b3346');
};

const cabin: Draw = (ctx, x, y, s) => {
  const w = s * 0.8;
  const wall = s * 0.48;
  ctx.fillStyle = '#9a6a45';
  ctx.fillRect(x - w / 2, y - wall, w, wall);
  ctx.save();
  ctx.strokeStyle = 'rgba(70, 40, 20, 0.45)';
  ctx.lineWidth = 1;
  for (let row = 1; row < 5; row++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - (wall * row) / 5);
    ctx.lineTo(x + w / 2, y - (wall * row) / 5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeRect(x - w / 2, y - wall, w, wall);
  ctx.fillStyle = '#7a5236';
  ctx.fillRect(x + w * 0.2, y - s * 0.95, s * 0.1, s * 0.25);
  poly(ctx, [
    [x - w * 0.62, y - wall + s * 0.02],
    [x, y - s * 0.9],
    [x + w * 0.62, y - wall + s * 0.02],
  ], '#ffffff');
  ctx.fillStyle = '#ffd56a';
  ctx.fillRect(x - w * 0.34, y - wall * 0.7, w * 0.22, wall * 0.32);
  ctx.fillStyle = '#5a3e2e';
  ctx.fillRect(x + w * 0.06, y - wall * 0.7, w * 0.22, wall * 0.7);
};

const lamp: Draw = (ctx, x, y, s) => {
  glow(ctx, x, y - s * 0.86, s * 0.5, 'rgba(255, 220, 140, 0.7)');
  ctx.fillStyle = '#3e4660';
  ctx.fillRect(x - s * 0.03, y - s * 0.78, s * 0.06, s * 0.78);
  ctx.fillRect(x - s * 0.12, y - s * 0.04, s * 0.24, s * 0.04);
  ctx.fillStyle = '#ffe58a';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.09, y - s * 0.98, s * 0.18, s * 0.2, s * 0.03);
  ctx.fill();
  ctx.stroke();
  poly(ctx, [
    [x - s * 0.13, y - s * 0.98],
    [x, y - s * 1.08],
    [x + s * 0.13, y - s * 0.98],
  ], '#3e4660', false);
};

const treehouse: Draw = (ctx, x, y, s) => {
  ctx.fillStyle = '#6b4a33';
  ctx.fillRect(x - s * 0.06, y - s * 0.6, s * 0.12, s * 0.6);
  for (const [dx, dy, r] of [
    [-0.24, -0.72, 0.2],
    [0.24, -0.72, 0.2],
    [0, -0.86, 0.22],
  ]) {
    circle(ctx, x + dx * s, y + dy * s, r * s, '#3f7a5a');
  }
  ctx.fillStyle = '#b5844f';
  ctx.fillRect(x - s * 0.22, y - s * 0.62, s * 0.44, s * 0.24);
  ctx.strokeRect(x - s * 0.22, y - s * 0.62, s * 0.44, s * 0.24);
  poly(ctx, [
    [x - s * 0.28, y - s * 0.62],
    [x, y - s * 0.8],
    [x + s * 0.28, y - s * 0.62],
  ], '#8a5a3c');
  ctx.fillStyle = '#ffd56a';
  ctx.fillRect(x - s * 0.06, y - s * 0.56, s * 0.12, s * 0.1);
  ctx.save();
  ctx.strokeStyle = '#d9b98c';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y - s * 0.38);
  ctx.lineTo(x + s * 0.2, y);
  ctx.moveTo(x + s * 0.2, y - s * 0.38);
  ctx.lineTo(x + s * 0.28, y);
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    ctx.moveTo(x + s * (0.12 + k * 0.08), y - s * 0.38 * (1 - k));
    ctx.lineTo(x + s * (0.2 + k * 0.08), y - s * 0.38 * (1 - k));
  }
  ctx.stroke();
  ctx.restore();
};

const observatory: Draw = (ctx, x, y, s) => {
  const w = s * 0.56;
  ctx.fillStyle = '#c9cfe0';
  ctx.fillRect(x - w / 2, y - s * 0.5, w, s * 0.5);
  ctx.strokeRect(x - w / 2, y - s * 0.5, w, s * 0.5);
  ctx.fillStyle = '#9aa6c8';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.5, w * 0.55, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The telescope pokes out of the slit, toward the stars.
  ctx.save();
  ctx.translate(x + w * 0.1, y - s * 0.68);
  ctx.rotate(-0.7);
  ctx.fillStyle = '#3e4660';
  ctx.fillRect(0, -s * 0.04, s * 0.3, s * 0.08);
  ctx.restore();
  ctx.fillStyle = '#ffd56a';
  ctx.fillRect(x - w * 0.12, y - s * 0.32, w * 0.24, s * 0.14);
  ctx.fillStyle = '#5a4a5c';
  ctx.fillRect(x - w * 0.1, y - s * 0.16, w * 0.2, s * 0.16);
  ctx.fillStyle = '#fff6c8';
  const sx = x + s * 0.34;
  const sy = y - s * 1.0;
  const r = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(sx, sy - r);
  ctx.quadraticCurveTo(sx, sy, sx + r, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy + r);
  ctx.quadraticCurveTo(sx, sy, sx - r, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy - r);
  ctx.fill();
};

const PLACES: Record<PlaceId, Draw> = {
  house,
  tree,
  tent,
  mill,
  picnic,
  barn,
  hut,
  lighthouse,
  icecream,
  igloo,
  snowman,
  cabin,
  lamp,
  treehouse,
  observatory,
};

export function drawLandmark(ctx: CanvasRenderingContext2D, id: PlaceId, x: number, y: number, s: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.strokeStyle = OUTLINE;
  PLACES[id](ctx, x, y, s);
  ctx.restore();
}
