import type {
  LogEntry,
  ReloadResult,
  SchedulerStatus,
  StatsData,
  TreeNode,
} from "./types";

// Base URL for API calls. Empty string = same origin (dev proxy or served
// behind the backend). Override with VITE_API_BASE (e.g. http://host:8080).
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
  });
  if (res.status === 204) {
    throw new ApiError("Tree not loaded yet (204)", 204);
  }
  if (!res.ok) {
    throw await ApiError.fromResponse(res);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw await ApiError.fromResponse(res);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "error" in body) {
        detail = `${res.status} ${(body as { error: string }).error}`;
      }
    } catch {
      // ignore non-JSON bodies
    }
    return new ApiError(detail, res.status);
  }
}

// --- Tree views ---

export function getStatusTree(): Promise<TreeNode> {
  return getJson<TreeNode>("/api/tree/status");
}

export function getFullTree(): Promise<TreeNode> {
  return getJson<TreeNode>("/api/tree/full");
}

export function getConfigRaw(): Promise<unknown> {
  return getJson<unknown>("/api/tree/config");
}

export function getConfigDefaultsRaw(): Promise<unknown> {
  return getJson<unknown>("/api/tree/config-defaults");
}

// --- Logs ---

export function getLogs(path?: string, limit = 200): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  params.set("limit", String(limit));
  return getJson<LogEntry[]>(`/api/logs?${params.toString()}`);
}

/**
 * Open an SSE stream of log entries. The backend emits a named `log` event with
 * the entry seq as the id and a single LogEntry as JSON data. There is no
 * backlog replay, so callers should fetch getLogs() first and dedupe by seq.
 *
 * Returns a cleanup function that closes the stream.
 */
export function streamLogs(
  path: string | undefined,
  onEntry: (entry: LogEntry) => void,
  onError?: (err: Event) => void,
): () => void {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  const url = apiUrl(`/api/logs/stream?${params.toString()}`);
  const source = new EventSource(url);

  const handler = (ev: MessageEvent<string>) => {
    try {
      onEntry(JSON.parse(ev.data) as LogEntry);
    } catch {
      // ignore malformed payloads
    }
  };

  source.addEventListener("log", handler as EventListener);
  if (onError) source.addEventListener("error", onError);

  return () => {
    source.removeEventListener("log", handler as EventListener);
    source.close();
  };
}

// --- Scheduler / control ---

export function getScheduler(): Promise<SchedulerStatus> {
  return getJson<SchedulerStatus>("/api/scheduler");
}

export function startScheduler(): Promise<SchedulerStatus> {
  return postJson<SchedulerStatus>("/api/scheduler/start");
}

export function stopScheduler(): Promise<SchedulerStatus> {
  return postJson<SchedulerStatus>("/api/scheduler/stop");
}

export function reload(): Promise<ReloadResult> {
  return postJson<ReloadResult>("/api/reload");
}

// --- Stats ---

export function getStats(): Promise<StatsData> {
  return getJson<StatsData>("/api/stats");
}
