import { useEffect, useRef } from "react";
import { ChevronDown, PanelBottom } from "lucide-react";
import { useLogs } from "../hooks/useLogs";

interface LogPanelProps {
  path: string | undefined;
  visible: boolean;
  onClearFilter: () => void;
  onHide: () => void;
  onShow: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

export function LogPanel({
  path,
  visible,
  onClearFilter,
  onHide,
  onShow,
}: LogPanelProps) {
  // Stream is paused while minimised; history and pause/resume markers persist.
  const { rows, connected, error } = useLogs(path, !visible);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [rows, visible]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  if (!visible) {
    return (
      <button type="button" className="log-show" onClick={onShow}>
        <PanelBottom size={15} /> Show log
      </button>
    );
  }

  return (
    <div className="log-panel">
      <div className="log-header">
        <span className="log-title">Log</span>
        <span className={`log-live ${connected ? "on" : "off"}`}>
          <span className="state-dot" />
          {connected ? "live" : "offline"}
        </span>
        <span className="log-filter">
          {path ? (
            <>
              filter <code>{path}</code>
              <button type="button" className="link-btn" onClick={onClearFilter}>
                clear
              </button>
            </>
          ) : (
            <span className="log-filter-all">all nodes</span>
          )}
        </span>
        <button
          type="button"
          className="ctrl-btn icon-only log-hide"
          onClick={onHide}
          title="Hide log"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      {error && <div className="log-error">{error}</div>}
      <div className="log-body" ref={bodyRef} onScroll={onScroll}>
        {rows.length === 0 ? (
          <div className="log-empty">No log entries.</div>
        ) : (
          rows.map((row) =>
            row.kind === "marker" ? (
              <div key={`m-${row.marker.id}`} className="log-marker">
                <span className="log-ts">{formatTime(row.marker.ts)}</span>
                <span className="log-marker-text">{row.marker.text}</span>
              </div>
            ) : (
              <div
                key={row.entry.seq}
                className={`log-line level-${row.entry.level}`}
              >
                <span className="log-ts">{formatTime(row.entry.ts)}</span>
                <span className={`log-level lvl-${row.entry.level}`}>
                  {row.entry.level}
                </span>
                <span className="log-path">{row.entry.path}</span>
                <span className="log-msg">{row.entry.message}</span>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
