// Pure layout: turn the monitoring tree (+ pin state + open panels) into
// absolutely-positioned tiles on the super grid.

import { isGroup, type GroupNode, type TreeNode } from "../api/types";
import {
  M,
  O,
  PITCH,
  pack,
  px,
  type PackInput,
  type PackResult,
  type Rect,
  rectOfPlaced,
  span,
} from "./geometry";

export type TileKind = "tile" | "pin" | "closer";

export interface Item {
  node: TreeNode;
  kind: TileKind;
}

/** Footprint in cells: 1x1 for every tile item. */
export function itemSize(_item: Item): number {
  return 1;
}

function toPackInput(item: Item): PackInput<Item> {
  return { data: item, size: itemSize(item) };
}

/** Stable sort: groups before entities, original order preserved within each type. */
function groupsFirst(children: TreeNode[]): TreeNode[] {
  return [...children].sort((a, b) => {
    const ag = isGroup(a) ? 0 : 1;
    const bg = isGroup(b) ? 0 : 1;
    return ag - bg;
  });
}

/** Items shown for a group body (not recursive). */
function groupBodyItems(group: GroupNode): Item[] {
  return groupsFirst(group.children).map((child) => ({
    node: child,
    kind: "tile" as const,
  }));
}

/**
 * Flat list of every leaf entity in the tree, as plain tiles. Used by the
 * "groups off" mode: all entities are shown with no group/pin tiles.
 */
export function entityItems(group: GroupNode): Item[] {
  const out: Item[] = [];
  const visit = (node: TreeNode) => {
    if (isGroup(node)) node.children.forEach(visit);
    else out.push({ node, kind: "tile" });
  };
  group.children.forEach(visit);
  return out;
}

/**
 * Open-panel layout: direct children + trailing Pin tile,
 * packed at whichever width gives the smallest, squarest block.
 */
export function panelPacking(group: GroupNode, cols: number): PackResult<Item> | null {
  const its: Item[] = [
    ...groupBodyItems(group),
    { node: group, kind: "pin" },
  ];

  let best: PackResult<Item> | null = null;
  let bestSkew = Number.POSITIVE_INFINITY;
  let bestWaste = Number.POSITIVE_INFINITY;
  let bestArea = Number.POSITIVE_INFINITY;

  for (let w = 1; w <= cols; w++) {
    const p = pack(its.map(toPackInput), w);
    if (!p) continue;

    const area = p.w * p.h;
    const waste = area - its.length;
    const skew = Math.abs(p.w - p.h);

    if (
      skew < bestSkew ||
      (skew === bestSkew && waste < bestWaste) ||
      (skew === bestSkew && waste === bestWaste && area < bestArea)
    ) {
      best = p;
      bestSkew = skew;
      bestWaste = waste;
      bestArea = area;
    }
  }

  return best;
}

/** A tile with its absolute pixel rect and stable identity. */
export interface PositionedTile {
  key: string;
  ctx: string;
  item: Item;
  size: number;
  rect: Rect;
}

export interface GroupFrame {
  key: string;
  ctx: string;
  node: GroupNode;
  rect: Rect;
  pinned: boolean;
}

export interface PanelLayer {
  ctx: string;
  node: GroupNode;
  frame: Rect;
  tiles: PositionedTile[];
}

export interface OpenPanel {
  node: GroupNode;
  anchorX: number;
  anchorY: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  base: PositionedTile[];
  baseFrames: GroupFrame[];
  panels: PanelLayer[];
}

interface SizeOption {
  w: number;
  h: number;
  waste: number;
  skew: number;
}

interface RectInput<T> {
  data: T;
  options: SizeOption[];
  /** Requested moat around this rect, in cells. */
  margin: number;
}

interface RectPlaced<T> {
  data: T;
  x: number;
  y: number;
  w: number;
  h: number;
  margin: number;
}

interface RectPackResult<T> {
  pos: RectPlaced<T>[];
  w: number;
  h: number;
}

interface PinnedAtom {
  node: GroupNode;
  items: Item[];
}

function keyFor(ctx: string, item: Item): string {
  const prefix = item.kind === "pin" ? "p:" : item.kind === "closer" ? "c:" : "";
  return `${ctx}:${prefix}${item.node.path}`;
}

function positioned(
  ctx: string,
  item: Item,
  x: number,
  y: number,
  yOffsetPx = 0,
): PositionedTile {
  const size = itemSize(item);
  const rect = rectOfPlaced(x, y, size);
  if (yOffsetPx) rect.top += yOffsetPx;
  return { key: keyFor(ctx, item), ctx, item, size, rect };
}

function frameRect(x: number, y: number, w: number, h: number, yOffsetPx = 0): Rect {
  return {
    left: px(x) - O,
    top: px(y) - O + yOffsetPx,
    width: span(w) + 2 * O,
    height: span(h) + 2 * O,
  };
}

function sizeOptions(count: number, cols: number): SizeOption[] {
  if (count <= 1) return [{ w: 1, h: 1, waste: 0, skew: 0 }];
  const raw: SizeOption[] = [];
  for (let w = 1; w <= cols; w++) {
    const h = Math.ceil(count / w);
    const area = w * h;
    raw.push({ w, h, waste: area - count, skew: Math.abs(w - h) });
  }
  const minWaste = Math.min(...raw.map((o) => o.waste));
  const bestWaste = raw.filter((o) => o.waste === minWaste);
  return bestWaste.sort((a, b) => {
    if (a.skew !== b.skew) return a.skew - b.skew;
    if (a.h !== b.h) return a.h - b.h;
    return a.w - b.w;
  });
}

function betterPlacement(
  a: { y: number; boardH: number; opt: SizeOption; x: number },
  b: { y: number; boardH: number; opt: SizeOption; x: number },
): boolean {
  const aHorizontalLine = a.opt.h === 1 && a.opt.w > 1;
  const bHorizontalLine = b.opt.h === 1 && b.opt.w > 1;
  const aVerticalLine = a.opt.w === 1 && a.opt.h > 1;
  const bVerticalLine = b.opt.w === 1 && b.opt.h > 1;

  // If comparing line layouts, prefer horizontal over vertical.
  if (aHorizontalLine && bVerticalLine) return true;
  if (aVerticalLine && bHorizontalLine) return false;

  if (a.y !== b.y) return a.y < b.y;
  if (a.boardH !== b.boardH) return a.boardH < b.boardH;
  if (a.opt.skew !== b.opt.skew) return a.opt.skew < b.opt.skew;
  if (a.opt.h !== b.opt.h) return a.opt.h < b.opt.h;
  return a.x < b.x;
}

function overlapsWithGap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): boolean {
  return !(
    ax + aw + gap <= bx ||
    ax >= bx + bw + gap ||
    ay + ah + gap <= by ||
    ay >= by + bh + gap
  );
}

/**
 * Rectangle packer with per-item size options and per-item margin.
 * Margin does not stack: two items can share one gap cell between them.
 */
function packRects<T>(inputs: RectInput<T>[], cols: number): RectPackResult<T> | null {
  const pos: RectPlaced<T>[] = [];
  const usesHalfStep = inputs.some((i) => Math.abs(i.margin % 1) > 0.001);
  const xStep = usesHalfStep ? 0.5 : 1;

  for (const input of inputs) {
    let best: { y: number; boardH: number; opt: SizeOption; x: number } | null = null;

    for (const opt of input.options) {
      if (opt.w > cols) continue;
      for (let x = 0; x + opt.w <= cols + 0.0001; x += xStep) {
        let y = 0;
        while (true) {
          let overlap = false;
          let pushTo = y;

          for (const p of pos) {
            const gap = Math.max(input.margin, p.margin);
            if (!overlapsWithGap(x, y, opt.w, opt.h, p.x, p.y, p.w, p.h, gap)) continue;
            overlap = true;
            pushTo = Math.max(pushTo, p.y + p.h + gap);
          }

          if (!overlap) {
            const boardH = Math.max(y + opt.h, ...pos.map((p) => p.y + p.h));
            const candidate = { y, boardH, opt, x };
            if (!best || betterPlacement(candidate, best)) best = candidate;
            break;
          }

          y = pushTo;
        }
      }
    }

    if (!best) return null;

    pos.push({
      data: input.data,
      x: best.x,
      y: best.y,
      w: best.opt.w,
      h: best.opt.h,
      margin: input.margin,
    });
  }

  const w = pos.length ? Math.max(...pos.map((q) => q.x + q.w)) : 0;
  const h = pos.length ? Math.max(...pos.map((q) => q.y + q.h)) : 0;
  return { pos, w, h };
}

function collectPinnedGroups(root: GroupNode, pinned: Set<string>): GroupNode[] {
  const out: GroupNode[] = [];
  const visit = (node: TreeNode) => {
    if (!isGroup(node)) return;
    if (pinned.has(node.id)) out.push(node);
    node.children.forEach(visit);
  };
  root.children.forEach(visit);
  return out;
}

/** Full board layout: top-level tiles, pinned blocks, and open panel layers. */
export function computeLayout(
  root: GroupNode,
  cols: number,
  pinned: Set<string>,
  stack: OpenPanel[],
  hideGroups = false,
): BoardLayout {
  const base: PositionedTile[] = [];
  const baseFrames: GroupFrame[] = [];

  if (hideGroups) {
    const basePack = pack(entityItems(root).map(toPackInput), cols);
    const maxRows = basePack ? basePack.h : 0;
    if (basePack) {
      base.push(...basePack.pos.map((q) => positioned("b", q.data, q.x, q.y)));
    }

    const panels: PanelLayer[] = [];
    const width = 2 * M + span(cols);
    const height = 2 * M + span(maxRows);
    return { width, height, base, baseFrames, panels };
  }

  const topItems = groupsFirst(root.children).map((node) => ({ node, kind: "tile" as const }));
  const topPack = pack(topItems.map(toPackInput), cols);
  let topRows = 0;
  if (topPack) {
    base.push(...topPack.pos.map((q) => positioned("b", q.data, q.x, q.y)));
    topRows = topPack.h;
  }

  const pinnedGroups = collectPinnedGroups(root, pinned);
  const groupMoat = cols >= 3 ? 0.5 : 0;
  const pinnedYOffsetPx = pinnedGroups.length > 0 ? Math.floor(PITCH / 2) : 0;
  const pinnedAtoms: PinnedAtom[] = pinnedGroups.map((node) => ({
    node,
    items: groupBodyItems(node),
  }));
  const pinnedInputs: RectInput<PinnedAtom>[] = pinnedAtoms.map((atom) => ({
    data: atom,
    options: sizeOptions(Math.max(1, atom.items.length), cols),
    margin: groupMoat,
  }));

  let maxRows = topRows;
  const pinnedPack = packRects(pinnedInputs, cols);
  if (pinnedPack) {
    for (const placed of pinnedPack.pos) {
      const y = placed.y + topRows;
      const ctx = `P:${placed.data.node.path}`;
      const frame = frameRect(placed.x, y, placed.w, placed.h, pinnedYOffsetPx);
      baseFrames.push({
        key: `${ctx}:F`,
        ctx,
        node: placed.data.node,
        rect: frame,
        pinned: true,
      });

      placed.data.items.forEach((item, i) => {
        const ix = i % placed.w;
        const iy = Math.floor(i / placed.w);
        if (iy >= placed.h) return;
        base.push(positioned(ctx, item, placed.x + ix, y + iy, pinnedYOffsetPx));
      });

      maxRows = Math.max(maxRows, y + placed.h);
    }
  }

  const panels: PanelLayer[] = [];
  stack.forEach((panel, i) => {
    const p = panelPacking(panel.node, cols);
    if (!p) return;
    const ctx = `L${i}`;
    const x = Math.max(0, Math.min(panel.anchorX, cols - p.w));
    const y = panel.anchorY;
    const tiles = p.pos.map((q) => positioned(ctx, q.data, x + q.x, y + q.y));
    panels.push({ ctx, node: panel.node, frame: frameRect(x, y, p.w, p.h), tiles });
    maxRows = Math.max(maxRows, y + p.h);
  });

  const width = 2 * M + span(cols);
  let maxBottom = 0;
  for (const t of base) maxBottom = Math.max(maxBottom, t.rect.top + t.rect.height);
  for (const f of baseFrames) maxBottom = Math.max(maxBottom, f.rect.top + f.rect.height);
  for (const p of panels) {
    maxBottom = Math.max(maxBottom, p.frame.top + p.frame.height);
    for (const t of p.tiles) maxBottom = Math.max(maxBottom, t.rect.top + t.rect.height);
  }
  const cellHeight = maxRows > 0 ? 2 * M + span(maxRows) : 2 * M;
  const contentHeight = maxBottom > 0 ? maxBottom + M : 2 * M;
  const height = Math.max(cellHeight, contentHeight);
  return { width, height, base, baseFrames, panels };
}
