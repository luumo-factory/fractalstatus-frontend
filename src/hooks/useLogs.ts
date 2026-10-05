import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLogs, streamLogs } from "../api/client";
import type { LogEntry } from "../api/types";

const MAX_ENTRIES = 500;
const MAX_MARKERS = 50;

/** A synthetic, highlighted row injected into the stream (e.g. pause/resume). */
export interface LogMarker {
  id: string;
  order: number;
  afterSeq: number; // sorts directly after the entry with this seq
  ts: string;
  text: string;
}

/** A rendered row: either a real log entry or a synthetic marker. */
export type LogRow =
  | { kind: "entry"; entry: LogEntry }
  | { kind: "marker"; marker: LogMarker };

interface LogsState {
  rows: LogRow[];
  connected: boolean;
  error: string | null;
}

/**
 * Loads a backlog snapshot via /api/logs then attaches the live SSE stream,
 * both filtered by the given path prefix. Entries are deduped by seq and capped
 * at MAX_ENTRIES so the buffer never grows without bound.
 *
 * When `paused` is true the SSE stream is closed to save resources (e.g. while
 * the panel is minimised); existing history is retained. Each pause/resume
 * transition injects a highlighted marker row so it is clear in the stream.
 */
export function useLogs(path: string | undefined, paused: boolean): LogsState {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [markers, setMarkers] = useState<LogMarker[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Highest seq currently held, used to anchor markers to "now" in the stream.
  const lastSeqRef = useRef(0);
  const markerCounter = useRef(0);
  // Transition tracking for pause/resume markers (StrictMode-safe: never fires
  // on mount or on a path change, only on an actual paused -> !paused toggle).
  const mounted = useRef(false);
  const prevPaused = useRef(paused);

  // The updater stays pure (no external side effects): React may invoke it more
  // than once per commit. Dedupe is derived from `prev` each time.
  const append = useCallback((incoming: LogEntry[]) => {
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.seq));
      const merged = [...prev];
      for (const entry of incoming) {
        if (seen.has(entry.seq)) continue;
        seen.add(entry.seq);
        merged.push(entry);
      }
      merged.sort((a, b) => a.seq - b.seq);
      if (merged.length > MAX_ENTRIES) {
        merged.splice(0, merged.length - MAX_ENTRIES);
      }
      return merged;
    });
  }, []);

  const addMarker = useCallback((text: string) => {
    const order = markerCounter.current++;
    setMarkers((prev) => {
      const next = [
        ...prev,
        {
          id: `m${order}`,
          order,
          afterSeq: lastSeqRef.current,
          ts: new Date().toISOString(),
          text,
        },
      ];
      if (next.length > MAX_MARKERS) next.splice(0, next.length - MAX_MARKERS);
      return next;
    });
  }, []);

  // Track the newest seq so markers anchor to the current tail of the stream.
  useEffect(() => {
    if (entries.length) lastSeqRef.current = entries[entries.length - 1].seq;
  }, [entries]);

  // Reset history whenever the filter path changes (idempotent under StrictMode).
  useEffect(() => {
    setEntries([]);
    setMarkers([]);
    setError(null);
  }, [path]);

  // Manage the live stream and pause/resume markers.
  useEffect(() => {
    // Emit a marker only on a genuine pause/resume toggle, not on mount or when
    // the path changes.
    if (mounted.current && prevPaused.current !== paused) {
      addMarker(
        paused
          ? "Log stream paused (panel minimised)"
          : "Log stream resumed",
      );
    }
    mounted.current = true;
    prevPaused.current = paused;

    if (paused) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    // Fetch a backlog snapshot on (re)start to fill any gap while paused.
    void getLogs(path, 200)
      .then((backlog) => {
        if (!cancelled) append(backlog);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    const stop = streamLogs(
      path,
      (entry) => {
        if (!cancelled) {
          setConnected(true);
          append([entry]);
        }
      },
      () => {
        if (!cancelled) setConnected(false);
      },
    );

    // EventSource fires onopen implicitly; mark connected optimistically once
    // the stream object exists (status flips to false on error above).
    setConnected(true);

    return () => {
      cancelled = true;
      stop();
    };
  }, [path, paused, append, addMarker]);

  const rows = useMemo<LogRow[]>(() => {
    const minSeq = entries.length ? entries[0].seq : Number.NEGATIVE_INFINITY;
    const tagged: { sort: number; order: number; row: LogRow }[] = [];
    for (const entry of entries) {
      tagged.push({ sort: entry.seq, order: 0, row: { kind: "entry", entry } });
    }
    for (const marker of markers) {
      // Drop markers that have scrolled out of the retained entry window.
      if (entries.length && marker.afterSeq < minSeq) continue;
      tagged.push({
        sort: marker.afterSeq + 0.5,
        order: marker.order,
        row: { kind: "marker", marker },
      });
    }
    tagged.sort((a, b) => a.sort - b.sort || a.order - b.order);
    return tagged.map((t) => t.row);
  }, [entries, markers]);

  return { rows, connected, error };
}
