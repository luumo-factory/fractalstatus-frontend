import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { isGroup, type EntityNode, type GroupNode, type TreeNode } from "../api/types";
import { colsForWidth, M, PITCH, type Rect } from "../board/geometry";
import {
  computeLayout,
  type OpenPanel,
  type PositionedTile,
} from "../board/layout";
import {
  colorForStatus,
  hasFailingDescendant,
  statusOf,
  type Status,
} from "../board/model";
import { CONTROL_COLORS, tileFill } from "../board/colors";
import { useFlip, FADE_MS, type FlipItem } from "../board/useFlip";
import { usePrefersReducedMotion } from "../hooks/useMedia";
import { Icon } from "./Icon";
import { Tile } from "./Tile";

interface PanelEntry extends OpenPanel {
  pctx: string;
}

interface BoardProps {
  root: GroupNode;
  exploded: Set<string>;
  setExploded: (updater: (prev: Set<string>) => Set<string>) => void;
  autoExplode: boolean;
  hideGroups: boolean;
  blur: boolean;
  selectedPath: string | null;
  disabledPaths: Set<string>;
  onSelectEntity: (node: EntityNode) => void;
  onDeselect: () => void;
}

const cellOf = (rect: Rect) => ({
  x: Math.round((rect.left - M) / PITCH),
  y: Math.round((rect.top - M) / PITCH),
});

const PIN_HOVER_MARGIN_PX = 8;
const PIN_HOVER_TOP_PX = 24;
const PIN_LABEL_LEFT_PX = 2;
const PIN_LABEL_TOP_PX = -20;

/** All descendant group ids on a path to a warn/crit leaf (auto-pin set). */
function autoPinnedSet(root: GroupNode, disabledPaths: Set<string>): Set<string> {
  const set = new Set<string>();
  const visit = (node: TreeNode) => {
    if (!isGroup(node)) return;
    if (hasFailingDescendant(node, disabledPaths)) set.add(node.id);
    node.children.forEach(visit);
  };
  root.children.forEach(visit);
  return set;
}

export function Board({
  root,
  exploded,
  setExploded,
  autoExplode,
  hideGroups,
  blur,
  selectedPath,
  disabledPaths,
  onSelectEntity,
  onDeselect,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(8);
  const [stack, setStack] = useState<PanelEntry[]>([]);
  const reduced = usePrefersReducedMotion();
  const flip = useFlip(reduced);
  const lock = useRef(false);
  const scrims = useRef(new Map<string, HTMLElement>());
  const [hoveredPinnedKey, setHoveredPinnedKey] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCols(colsForWidth(el.clientWidth)));
    ro.observe(el);
    setCols(colsForWidth(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const effectivePinned = useMemo(() => {
    const set = new Set(exploded);
    if (autoExplode) for (const id of autoPinnedSet(root, disabledPaths)) set.add(id);
    return set;
  }, [exploded, autoExplode, root, disabledPaths]);

  const layout = useMemo(
    () => computeLayout(root, cols, effectivePinned, stack, hideGroups),
    [root, cols, effectivePinned, stack, hideGroups],
  );

  const pinnedHoverAreas = useMemo(
    () =>
      layout.baseFrames
        .filter((f) => f.pinned)
        .map((f) => ({
          key: f.key,
          left: f.rect.left - PIN_HOVER_MARGIN_PX,
          top: f.rect.top - PIN_HOVER_TOP_PX,
          right: f.rect.left + f.rect.width + PIN_HOVER_MARGIN_PX,
          bottom: f.rect.top + f.rect.height + PIN_HOVER_MARGIN_PX,
        })),
    [layout.baseFrames],
  );

  const flipItems: FlipItem[] = useMemo(() => {
    const out: FlipItem[] = layout.base.map((t) => ({ key: t.key, ctx: t.ctx, rect: t.rect }));
    for (const f of layout.baseFrames) {
      out.push({ key: f.key, ctx: f.ctx, rect: f.rect });
    }
    for (const panel of layout.panels) {
      out.push({ key: `${panel.ctx}:F`, ctx: panel.ctx, rect: panel.frame });
      for (const t of panel.tiles) out.push({ key: t.key, ctx: t.ctx, rect: t.rect });
    }
    return out;
  }, [layout]);

  useLayoutEffect(() => {
    flip.play(flipItems);
  });

  const withLock = useCallback((fn: () => void) => {
    if (lock.current) return;
    lock.current = true;
    fn();
    window.setTimeout(() => {
      lock.current = false;
    }, 340);
  }, []);

  const findRect = useCallback(
    (key: string): Rect | null => {
      for (const t of layout.base) if (t.key === key) return t.rect;
      for (const f of layout.baseFrames) if (f.key === key) return f.rect;
      for (const p of layout.panels) {
        if (`${p.ctx}:F` === key) return p.frame;
        for (const t of p.tiles) if (t.key === key) return t.rect;
      }
      return null;
    },
    [layout],
  );

  const openPanel = useCallback(
    (tile: PositionedTile) => {
      withLock(() => {
        const node = tile.item.node as GroupNode;
        const { x, y } = cellOf(tile.rect);
        const index = stack.length;
        flip.setEnter({ ctx: `L${index}`, origin: tile.rect });
        setStack((prev) => [...prev, { node, anchorX: x, anchorY: y, pctx: tile.ctx }]);
      });
    },
    [stack.length, flip, withLock],
  );

  const pinGroup = useCallback(
    (node: GroupNode, origin: Rect) => {
      withLock(() => {
        flip.setEnter({ ctx: `P:${node.path}`, origin, stagger: true });
        setExploded((prev) => new Set(prev).add(node.id));
      });
    },
    [flip, setExploded, withLock],
  );

  const unpinGroup = useCallback(
    (node: GroupNode, origin: Rect) => {
      withLock(() => {
        flip.playLeave(`P:${node.path}`, origin, () => {
          setExploded((prev) => {
            const next = new Set(prev);
            next.delete(node.id);
            return next;
          });
        });
      });
    },
    [flip, setExploded, withLock],
  );

  const closeTo = useCallback((i: number) => {
    setStack((prev) => (i >= prev.length ? prev : prev.slice(0, i)));
  }, []);

  const animClose = useCallback(
    (i: number, origin: Rect) => {
      withLock(() => {
        const ctx = `L${i}`;
        const scrim = scrims.current.get(ctx);
        if (scrim && !reduced) {
          scrim.style.transition = `opacity ${FADE_MS}ms`;
          scrim.style.opacity = "0";
        }
        flip.playLeave(ctx, origin, () => closeTo(i));
      });
    },
    [flip, withLock, closeTo, reduced],
  );

  const pinFromPanel = useCallback(
    (panelIndex: number) => {
      const panel = stack[panelIndex];
      if (!panel) return;
      const origin =
        findRect(`L${panelIndex}:p:${panel.node.path}`) ??
        findRect(`L${panelIndex}:c:${panel.node.path}`) ??
        findRect(`L${panelIndex}:F`) ??
        null;
      if (!origin) return;
      pinGroup(panel.node, origin);
    },
    [stack, findRect, pinGroup],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStack((prev) => prev.slice(0, -1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (hideGroups) setStack((prev) => (prev.length ? [] : prev));
  }, [hideGroups]);

  const renderTile = (tile: PositionedTile) => {
    const node = tile.item.node;
    const kind = tile.item.kind;
    const isPinnedGroup = isGroup(node) && effectivePinned.has(node.id);
    let status: Status = "ok";
    let color: string;

    if (kind === "pin") {
      color = CONTROL_COLORS.pin;
    } else if (kind === "closer") {
      color = CONTROL_COLORS.collapse;
    } else {
      status = statusOf(node, undefined, disabledPaths);
      if (!isGroup(node) && disabledPaths.has(node.path)) {
        color = "oklch(0.47 0.01 260)";
      } else {
        color =
          kind === "tile" && isGroup(node) && status === "ok"
            ? CONTROL_COLORS.collapse
            : colorForStatus(node, status);
      }
    }

    const isEntity = kind === "tile" && !isGroup(node);
    const selected = isEntity && node.path === selectedPath;

    const onActivate = () => {
      if (kind === "pin") {
        const idx = Number(tile.ctx.slice(1));
        if (isPinnedGroup) {
          const origin = findRect(`P:${node.path}:F`) ?? findRect(tile.key) ?? tile.rect;
          unpinGroup(node as GroupNode, origin);
        } else {
          pinFromPanel(idx);
        }
      } else if (kind === "closer") {
        const idx = Number(tile.ctx.slice(1));
        animClose(idx, tile.rect);
      } else if (isGroup(node)) {
        openPanel(tile);
      } else {
        onSelectEntity(node);
      }
    };

    const label =
      kind === "pin"
        ? `${isPinnedGroup ? "Unpin" : "Pin"} ${node.name}`
        : kind === "closer"
          ? `Close ${node.name}`
          : isGroup(node)
            ? `${node.name}, open`
            : node.name;

    return (
      <Tile
        key={tile.key}
        tile={tile}
        status={status}
        fill={tileFill(color)}
        selected={selected}
        disabled={kind === "tile" && !isGroup(node) && disabledPaths.has(node.path)}
        label={label}
        pinLabel={kind === "pin" ? (isPinnedGroup ? "Unpin" : "Pin") : undefined}
        disabledPaths={disabledPaths}
        onActivate={onActivate}
        register={flip.register(tile.key)}
      />
    );
  };

  const onBackgroundClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tile")) return;
    onDeselect();
  };

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = pinnedHoverAreas.find(
        (a) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom,
      );
      setHoveredPinnedKey((prev) => (prev === (hit?.key ?? null) ? prev : (hit?.key ?? null)));
    },
    [pinnedHoverAreas],
  );

  return (
    <div className="board-scroll" ref={containerRef} onClick={onBackgroundClick}>
      <div
        className="board"
        style={{ width: layout.width, height: layout.height }}
        onPointerMove={onBoardPointerMove}
        onPointerLeave={() => setHoveredPinnedKey(null)}
      >
        {layout.baseFrames.map((frame) => {
          const status = statusOf(frame.node, undefined, disabledPaths);
          const frameColor = colorForStatus(frame.node, status);
          return (
            <div key={frame.key} className="pinned-block">
              <div
                ref={flip.register(frame.key)}
                data-key={frame.key}
                className="panel-frame pinned-frame"
                style={{
                  left: frame.rect.left,
                  top: frame.rect.top,
                  width: frame.rect.width,
                  height: frame.rect.height,
                  borderColor: frameColor,
                  background: `color-mix(in oklch, ${frameColor} 14%, var(--surface-1))`,
                }}
              />
              {frame.pinned && (
                <div
                  className={`pinned-header${hoveredPinnedKey === frame.key ? " active" : ""}`}
                  style={{
                    left: frame.rect.left + PIN_LABEL_LEFT_PX,
                    top: frame.rect.top + PIN_LABEL_TOP_PX,
                    width: Math.max(0, frame.rect.width - 4),
                  }}
                >
                  <div className="pinned-title">
                    <Icon name={frame.node.display?.icon} size={13} />
                    <span>{frame.node.name}</span>
                  </div>
                  <button
                    type="button"
                    className="pinned-close"
                    title={`Unpin ${frame.node.name}`}
                    aria-label={`Unpin ${frame.node.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const origin = findRect(frame.key) ?? frame.rect;
                      unpinGroup(frame.node, origin);
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {layout.base.map(renderTile)}

        {layout.panels.map((panel, i) => {
          const status = statusOf(panel.node, undefined, disabledPaths);
          const frameColor = colorForStatus(panel.node, status);
          return (
            <div key={panel.ctx} className="panel-layer">
              <div
                ref={(el) => {
                  if (el) scrims.current.set(panel.ctx, el);
                  else scrims.current.delete(panel.ctx);
                }}
                className={`scrim${blur ? " blur" : ""}${reduced ? "" : " frostIn"}`}
                style={{ width: layout.width, height: layout.height }}
                onClick={() => {
                  const closerRect =
                    panel.tiles.find((t) => t.item.kind === "closer")?.rect ?? panel.frame;
                  animClose(i, closerRect);
                }}
              />
              <div
                ref={flip.register(`${panel.ctx}:F`)}
                data-key={`${panel.ctx}:F`}
                className="panel-frame"
                style={{
                  left: panel.frame.left,
                  top: panel.frame.top,
                  width: panel.frame.width,
                  height: panel.frame.height,
                  borderColor: frameColor,
                  background: `color-mix(in oklch, ${frameColor} 14%, var(--surface-1))`,
                }}
              />
              {panel.tiles.map(renderTile)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
