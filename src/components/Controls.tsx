import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FolderTree,
  Maximize,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Ungroup,
} from "lucide-react";
import { getScheduler, reload, startScheduler, stopScheduler } from "../api/client";

interface ControlsProps {
  autoExplode: boolean;
  onAutoExplodeChange: (value: boolean) => void;
  hideGroups: boolean;
  onToggleGroups: () => void;
  onExplodeAll: () => void;
  onCollapseAll: () => void;
  onSchedulerChanged: () => void;
}

export function Controls({
  autoExplode,
  onAutoExplodeChange,
  hideGroups,
  onToggleGroups,
  onExplodeAll,
  onCollapseAll,
  onSchedulerChanged,
}: ControlsProps) {
  const [running, setRunning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await getScheduler();
      setRunning(status.running);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<{ running: boolean }>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        setRunning(result.running);
        onSchedulerChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [onSchedulerChanged],
  );

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="controls">
      <button
        type="button"
        className="controls-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        title={collapsed ? "Show controls" : "Hide controls"}
      >
        <span className="controls-toggle-label">Controls</span>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!collapsed && (<>
      <div className="controls-row options">
        <button
          type="button"
          className={`ctrl-btn${autoExplode ? " active" : ""}`}
          onClick={() => onAutoExplodeChange(!autoExplode)}
          disabled={hideGroups}
          title={hideGroups ? "Auto-pin unavailable when groups are hidden" : autoExplode ? "Disable auto-pin" : "Enable auto-pin"}
        >
          Auto-pin
        </button>
      </div>

      <div className="controls-row">
        <button
          type="button"
          className="ctrl-btn"
          onClick={onExplodeAll}
          disabled={hideGroups}
        >
          <Maximize size={15} /> Pin all
        </button>
        <button
          type="button"
          className="ctrl-btn"
          onClick={onCollapseAll}
          disabled={hideGroups}
        >
          <Minimize size={15} /> Unpin all
        </button>
        <button
          type="button"
          className={`ctrl-btn${hideGroups ? " active" : ""}`}
          onClick={onToggleGroups}
          title={hideGroups ? "Show groups" : "Hide groups (show all entities)"}
        >
          {hideGroups ? <FolderTree size={15} /> : <Ungroup size={15} />}
          Groups
        </button>
      </div>

      <div className="controls-row">
        <span className={`sched-state ${running ? "on" : "off"}`}>
          <span className="state-dot" />
          scheduler {running === null ? "..." : running ? "running" : "stopped"}
        </span>
      </div>

      <div className="controls-row">
        <button
          type="button"
          className="ctrl-btn"
          disabled={busy || running === true}
          onClick={() => void run(startScheduler)}
        >
          <Play size={15} /> Start
        </button>
        <button
          type="button"
          className="ctrl-btn"
          disabled={busy || running === false}
          onClick={() => void run(stopScheduler)}
        >
          <Pause size={15} /> Stop
        </button>
        <button
          type="button"
          className="ctrl-btn"
          disabled={busy}
          onClick={() => void run(reload)}
        >
          <RotateCw size={15} /> Reload
        </button>
        <button
          type="button"
          className="ctrl-btn icon-only"
          disabled={busy}
          onClick={() => void refresh()}
          title="Refresh scheduler status"
        >
          <RefreshCw size={15} />
        </button>
      </div>

        {error && <div className="ctrl-error">{error}</div>}
      </>)}
    </div>
  );
}
