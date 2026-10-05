import { useEffect, useState } from "react";
import { getStats } from "../api/client";
import type { StatsData } from "../api/types";

/**
 * Polls /api/stats every `intervalMs` milliseconds (default: 5000).
 * Returns the latest snapshot plus a loading flag.
 */
export function useStats(intervalMs = 5000): { data: StatsData | null; loading: boolean } {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const result = await getStats();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    const timer = setInterval(fetch, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { data, loading };
}
