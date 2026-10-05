import { useCallback, useEffect, useRef, useState } from "react";
import { getStatusTree } from "../api/client";
import type { TreeNode } from "../api/types";

interface StatusTreeState {
  tree: TreeNode | null;
  error: string | null;
  loading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}

/** Polls /api/tree/status on an interval and exposes the latest tree. */
export function useStatusTree(intervalMs = 5000): StatusTreeState {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getStatusTree();
      setTree(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => void load(), intervalMs);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [load, intervalMs]);

  return { tree, error, loading, lastUpdated, refresh: () => void load() };
}
