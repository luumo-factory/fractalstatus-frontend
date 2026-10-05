import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isEntity,
  isGroup,
  type EntityNode,
  type GroupNode,
  type State,
  type TreeNode,
} from "./api/types";
import { useStatusTree } from "./hooks/useStatusTree";
import { getConfigDefaultsRaw, getConfigRaw } from "./api/client";
import { Board } from "./components/Board";
import { DetailPane } from "./components/DetailPane";
import { Controls } from "./components/Controls";
import { LogPanel } from "./components/LogPanel";
import { ConfigOverlay } from "./components/ConfigOverlay";

function findByPath(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  if (isGroup(node)) {
    for (const child of node.children) {
      const found = findByPath(child, path);
      if (found) return found;
    }
  }
  return null;
}

function allGroupIds(node: TreeNode, into: string[] = [], isRoot = true): string[] {
  if (isGroup(node)) {
    if (!isRoot) into.push(node.id);
    node.children.forEach((c) => allGroupIds(c, into, false));
  }
  return into;
}

/** Map of every entity path to its current state. */
function entityStates(
  node: TreeNode,
  disabledPaths: Set<string>,
  into = new Map<string, State>(),
): Map<string, State> {
  if (isEntity(node)) {
    if (!disabledPaths.has(node.path)) into.set(node.path, node.runtime.state);
  } else if (isGroup(node)) {
    node.children.forEach((c) => entityStates(c, disabledPaths, into));
  }
  return into;
}

const isBad = (s: State): boolean => s === "warning" || s === "offline";

const MIN_PANE = 280;
const MAX_PANE = 680;

export default function App() {
  const { tree, error, loading, lastUpdated, refresh } = useStatusTree(5000);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [exploded, setExploded] = useState<Set<string>>(new Set());
  const [autoExplode, setAutoExplode] = useState(true);
  const [hideGroups, setHideGroups] = useState(false);
  const [disabledPaths, setDisabledPaths] = useState<Set<string>>(new Set());
  const [paneWidth, setPaneWidth] = useState(360);
  const [logVisible, setLogVisible] = useState(false);
  const [configOverlayVisible, setConfigOverlayVisible] = useState(false);
  const [configDefaultsTree, setConfigDefaultsTree] = useState<unknown>(null);
  const [configDefaultsLoading, setConfigDefaultsLoading] = useState(false);
  const [configDefaultsError, setConfigDefaultsError] = useState<string | null>(null);
  const [configRawTree, setConfigRawTree] = useState<unknown>(null);
  const [configRawLoading, setConfigRawLoading] = useState(false);
  const [configRawError, setConfigRawError] = useState<string | null>(null);
  const blur = true;

  const root = tree && isGroup(tree) ? (tree as GroupNode) : null;

  const selectedEntity = useMemo<EntityNode | null>(() => {
    if (!tree || !selectedPath) return null;
    const node = findByPath(tree, selectedPath);
    return node && isEntity(node) ? node : null;
  }, [tree, selectedPath]);

  // Auto-select / auto-deselect tracking.
  // autoSelectedPath - the path we selected automatically (null if user-driven).
  // preAutoPath      - what was selected before the auto-selection fired.
  const autoSelectedPath = useRef<string | null>(null);
  const preAutoPath = useRef<string | null>(null);

  // Any user-driven selection change cancels the auto-select tracking so we
  // no longer auto-deselect that node when it recovers.
  const selectByUser = useCallback((path: string | null) => {
    autoSelectedPath.current = null;
    preAutoPath.current = null;
    setSelectedPath(path);
  }, []);

  // Auto-select a node when it transitions into warning/offline, but only when
  // exactly one node changes in a single update (avoid stealing focus on a
  // broad outage). Skips the first load so existing failures do not grab it.
  // Auto-deselects when the node recovers, reverting to the previous selection.
  const prevStates = useRef<Map<string, State> | null>(null);
  useEffect(() => {
    if (!tree) return;
    const states = entityStates(tree, disabledPaths);
    const prev = prevStates.current;
    prevStates.current = states;
    if (!prev) return;

    // Auto-deselect if the currently auto-selected node has recovered.
    if (autoSelectedPath.current !== null) {
      const state = states.get(autoSelectedPath.current);
      if (state !== undefined && !isBad(state)) {
        autoSelectedPath.current = null;
        setSelectedPath(preAutoPath.current);
        preAutoPath.current = null;
        return;
      }
    }

    const newlyBad: string[] = [];
    for (const [path, state] of states) {
      const was = prev.get(path);
      if (was !== undefined && was !== state && isBad(state) && !isBad(was)) {
        newlyBad.push(path);
      }
    }
    if (newlyBad.length === 1) {
      setSelectedPath((prev) => {
        preAutoPath.current = prev;
        autoSelectedPath.current = newlyBad[0];
        return newlyBad[0];
      });
    }
  }, [tree, disabledPaths]);

  const onExplodeAll = useCallback(() => {
    if (!root) return;
    setExploded(new Set(allGroupIds(root)));
  }, [root]);

  const onCollapseAll = useCallback(() => setExploded(new Set()), []);

  const onToggleDisabled = useCallback((path: string) => {
    setDisabledPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const loadConfigDefaults = useCallback(async () => {
    if (configDefaultsTree || configDefaultsLoading) return;
    setConfigDefaultsLoading(true);
    setConfigDefaultsError(null);
    try {
      const data = await getConfigDefaultsRaw();
      setConfigDefaultsTree(data);
    } catch (err) {
      setConfigDefaultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfigDefaultsLoading(false);
    }
  }, [configDefaultsTree, configDefaultsLoading]);

  const loadConfigRaw = useCallback(async () => {
    if (configRawTree || configRawLoading) return;
    setConfigRawLoading(true);
    setConfigRawError(null);
    try {
      const data = await getConfigRaw();
      setConfigRawTree(data);
    } catch (err) {
      setConfigRawError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfigRawLoading(false);
    }
  }, [configRawTree, configRawLoading]);

  const onShowConfig = useCallback(() => {
    setConfigOverlayVisible(true);
    void loadConfigDefaults();
  }, [loadConfigDefaults]);

  // Resizable right pane.
  const dragging = useRef(false);
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const fromRight = window.innerWidth - e.clientX;
    setPaneWidth(Math.min(MAX_PANE, Math.max(MIN_PANE, fromRight)));
  }, []);
  const onResizeEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" />
          <h1>Fractal Status</h1>
        </div>
        <div className="header-meta">
          {error && <span className="header-error">backend unreachable</span>}
          {lastUpdated && (
            <span className="updated">updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      </header>

      <div className="layout">
        <div className="center">
          <div className="board-area">
            {loading && !root && <div className="banner">Loading tree...</div>}
            {error && !root && (
              <div className="banner error">Cannot reach backend: {error}</div>
            )}
            {root && (
              <Board
                root={root}
                exploded={exploded}
                setExploded={setExploded}
                autoExplode={autoExplode}
                hideGroups={hideGroups}
                blur={blur}
                selectedPath={selectedPath}
                disabledPaths={disabledPaths}
                onSelectEntity={(n) =>
                  selectByUser(selectedPath === n.path ? null : n.path)
                }
                onDeselect={() => selectByUser(null)}
              />
            )}
          </div>

          <LogPanel
            path={selectedPath ?? undefined}
            visible={logVisible}
            onClearFilter={() => selectByUser(null)}
            onHide={() => setLogVisible(false)}
            onShow={() => setLogVisible(true)}
          />
        </div>

        <div
          className="pane-resizer"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          role="separator"
          aria-orientation="vertical"
        />

        <aside className="sidebar" style={{ width: paneWidth }}>
          <DetailPane
            node={selectedEntity}
            disabled={selectedEntity ? disabledPaths.has(selectedEntity.path) : false}
            onToggleDisabled={onToggleDisabled}
            onShowConfig={onShowConfig}
          />
          <Controls
            autoExplode={autoExplode}
            onAutoExplodeChange={setAutoExplode}
            hideGroups={hideGroups}
            onToggleGroups={() => setHideGroups((v) => !v)}
            onExplodeAll={onExplodeAll}
            onCollapseAll={onCollapseAll}
            onSchedulerChanged={refresh}
          />
        </aside>
      </div>

      <ConfigOverlay
        visible={configOverlayVisible}
        path={selectedEntity?.path ?? null}
        defaultsTree={configDefaultsTree}
        defaultsLoading={configDefaultsLoading}
        defaultsError={configDefaultsError}
        rawTree={configRawTree}
        rawLoading={configRawLoading}
        rawError={configRawError}
        onLoadDefaults={loadConfigDefaults}
        onLoadRaw={loadConfigRaw}
        onClose={() => setConfigOverlayVisible(false)}
      />
    </div>
  );
}
