// Grid geometry (pixels). Every tile sits on a super grid of pitch E+G.
// Ported from the reference prototype: fixed cell size, no scaling ever.

export const E = 102; // cell size (entity tile ~50% larger than the 68px base)
export const G = 12; // gutter
export const PITCH = E + G; // cell-to-cell pitch
export const M = Math.round(PITCH / 2); // outer canvas gutter (~half-unit)
export const O = 6; // panel frame outset (drawn in the gutter)

/** Pixel offset of cell index c. */
export const px = (c: number): number => M + c * PITCH;

/** Pixel size spanning n cells (n cells + n-1 gutters). */
export const span = (n: number): number => n * PITCH - G;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PackInput<T> {
  data: T;
  size: number; // square footprint in cells (1 or 2)
}

export interface Placed<T> extends PackInput<T> {
  x: number;
  y: number;
}

export interface PackResult<T> {
  pos: Placed<T>[];
  w: number; // width in cells
  h: number; // height in cells
}

/**
 * Skyline packer: places items in order at the lowest available position,
 * leftmost on ties. Returns null if any item is wider than the column count.
 */
export function pack<T>(items: PackInput<T>[], cols: number): PackResult<T> | null {
  const heights = new Array<number>(cols).fill(0);
  const pos: Placed<T>[] = [];
  for (const it of items) {
    const s = it.size;
    if (s > cols) return null;
    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;
    for (let x = 0; x + s <= cols; x++) {
      let y = 0;
      for (let k = x; k < x + s; k++) y = Math.max(y, heights[k]);
      if (y < bestY) {
        bestY = y;
        bestX = x;
      }
    }
    pos.push({ ...it, x: bestX, y: bestY });
    for (let x = bestX; x < bestX + s; x++) heights[x] = bestY + s;
  }
  const w = pos.length ? Math.max(...pos.map((q) => q.x + q.size)) : 0;
  const h = heights.length ? Math.max(...heights) : 0;
  return { pos, w, h };
}

/** Score a packing: prefer small, square blocks (lower is better). */
export function blockScore(result: PackResult<unknown>): number {
  return result.w * result.h * 10 + Math.abs(result.w - result.h);
}

/** Convert a placed cell position/size into an absolute pixel rect. */
export function rectOfPlaced(x: number, y: number, size: number): Rect {
  return { left: px(x), top: px(y), width: span(size), height: span(size) };
}

/** Number of columns that fit in a given pixel width. */
export function colsForWidth(widthPx: number): number {
  const usable = widthPx - 2 * M + G; // last cell has no trailing gutter
  return Math.max(1, Math.floor(usable / PITCH));
}
