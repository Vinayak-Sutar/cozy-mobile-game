/**
 * The fill bucket: a scanline flood fill from the tapped pixel over every
 * connected pixel of a similar colour. The filled area then grows by a pixel
 * or two, so it tucks under the soft edges of line art and leaves no halo.
 */
export interface FillResult {
  /** 1 where the fill goes, for the box below (row by row). */
  mask: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `tolerance` 0..1: how far each channel (including transparency) may differ
 * from the tapped colour. `grow` is how many pixels to spread the fill.
 */
export function floodFill(image: ImageData, sx: number, sy: number, tolerance: number, grow = 1): FillResult | null {
  const { width: w, height: h } = image;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const data = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
  const seed = data[sy * w + sx];
  const sr = seed & 255;
  const sg = (seed >>> 8) & 255;
  const sb = (seed >>> 16) & 255;
  const sa = seed >>> 24;
  const limit = Math.round(tolerance * 255);
  const match = (i: number): boolean => {
    const c = data[i];
    if (c === seed) return true;
    const a = c >>> 24;
    // Fully clear pixels match each other whatever colour they hold.
    if (a === 0 && sa === 0) return true;
    return (
      Math.abs((c & 255) - sr) <= limit &&
      Math.abs(((c >>> 8) & 255) - sg) <= limit &&
      Math.abs(((c >>> 16) & 255) - sb) <= limit &&
      Math.abs(a - sa) <= limit
    );
  };

  const filled = new Uint8Array(w * h);
  let x0 = sx;
  let x1 = sx;
  let y0 = sy;
  let y1 = sy;
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    let i = y * w + x;
    if (filled[i] || !match(i)) continue;
    // Run left and right along this row.
    let left = x;
    while (left > 0 && !filled[i - 1] && match(i - 1)) {
      left--;
      i--;
    }
    let right = left;
    i = y * w + left;
    let upOpen = false;
    let downOpen = false;
    while (right < w && !filled[i] && match(i)) {
      filled[i] = 1;
      // Queue the rows above and below once per run of matching pixels.
      if (y > 0) {
        const up = i - w;
        const ok = !filled[up] && match(up);
        if (ok && !upOpen) stack.push(right, y - 1);
        upOpen = ok;
      }
      if (y < h - 1) {
        const down = i + w;
        const ok = !filled[down] && match(down);
        if (ok && !downOpen) stack.push(right, y + 1);
        downOpen = ok;
      }
      right++;
      i++;
    }
    x0 = Math.min(x0, left);
    x1 = Math.max(x1, right - 1);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }

  // Grow the fill into the line art's soft edges.
  const g = Math.max(0, Math.round(grow));
  const bx = Math.max(0, x0 - g);
  const by = Math.max(0, y0 - g);
  const bw = Math.min(w, x1 + g + 1) - bx;
  const bh = Math.min(h, y1 + g + 1) - by;
  let mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const row = (y + by) * w + bx;
    for (let x = 0; x < bw; x++) mask[y * bw + x] = filled[row + x];
  }
  for (let pass = 0; pass < g; pass++) {
    const next = mask.slice();
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (mask[y * bw + x]) continue;
        if ((x > 0 && mask[y * bw + x - 1]) || (x < bw - 1 && mask[y * bw + x + 1]) || (y > 0 && mask[(y - 1) * bw + x]) || (y < bh - 1 && mask[(y + 1) * bw + x])) {
          next[y * bw + x] = 1;
        }
      }
    }
    mask = next;
  }
  return { mask, x: bx, y: by, width: bw, height: bh };
}
