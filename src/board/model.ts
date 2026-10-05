// View-model helpers that derive board-level facts from the raw monitoring tree.
// The UI uses generic status language (ok / warn / crit / unknown) rather than
// the backend's IT-specific online / warning / offline / unknown.

import {
  isGroup,
  type DisplayColors,
  type EntityNode,
  type Metric,
  type State,
  type TreeNode,
} from "../api/types";

export type Status = "ok" | "warn" | "crit" | "unknown";

/** Map a backend state onto the generic UI status. */
export function toStatus(state: State): Status {
  switch (state) {
    case "online":
      return "ok";
    case "warning":
      return "warn";
    case "offline":
      return "crit";
    default:
      return "unknown";
  }
}

// Severity used for worst-child rollup. crit is worst; unknown ranks below ok so
// a group with any real result reflects that result.
const RANK: Record<Status, number> = { unknown: 0, ok: 1, warn: 2, crit: 3 };

/** A rollup function maps a group's children statuses to the group's status. */
export type Rollup = (childStatuses: Status[]) => Status;

/** Default rollup: worst child (pluggable per the product spec). */
export const worstChild: Rollup = (statuses) => {
  if (statuses.length === 0) return "unknown";
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "unknown");
};

/** Status of any node; groups roll up from their children via `rollup`. */
export function statusOf(
  node: TreeNode,
  rollup: Rollup = worstChild,
  disabledPaths?: Set<string>,
): Status {
  if (isGroup(node)) {
    return rollup(node.children.map((c) => statusOf(c, rollup, disabledPaths)));
  }
  if (disabledPaths?.has(node.path)) return "unknown";
  return toStatus(node.runtime.state);
}

/** Resolved per-state colour palette for a node (from the backend scheme). */
export function colorsOf(node: TreeNode): DisplayColors {
  return node.display?.colors ?? {};
}

/** Pick the colour for a node given a status; falls back to a safe default. */
const FALLBACK: Record<Status, string> = {
  ok: "oklch(0.56 0.13 152)",
  warn: "oklch(0.63 0.14 68)",
  crit: "oklch(0.55 0.17 25)",
  unknown: "oklch(0.58 0.02 250)",
};
const STATUS_TO_STATE: Record<Status, keyof DisplayColors> = {
  ok: "online",
  warn: "warning",
  crit: "offline",
  unknown: "unknown",
};
export function colorForStatus(node: TreeNode, status: Status): string {
  const colors = colorsOf(node);
  return colors[STATUS_TO_STATE[status]] ?? FALLBACK[status];
}

/** All leaf (entity) descendants of a node. */
export function leaves(node: TreeNode): EntityNode[] {
  if (isGroup(node)) return node.children.flatMap(leaves);
  return [node];
}

export interface GroupCounts {
  total: number;
  failing: number;
}

/** Leaf totals for a group tile ("9 all ok" vs "2 of 12 failing"). */
export function groupCounts(node: TreeNode, disabledPaths?: Set<string>): GroupCounts {
  const lv = leaves(node).filter((l) => !disabledPaths?.has(l.path));
  const failing = lv.filter((l) => {
    const s = toStatus(l.runtime.state);
    return s === "warn" || s === "crit";
  }).length;
  return { total: lv.length, failing };
}

/**
 * Primary metric for an entity. Prefers the backend-defined runtime.metric;
 * falls back to deriving one from known check modules so tiles are not blank
 * before the backend field is populated.
 */
export function metricOf(node: EntityNode): Metric | null {
  if (node.runtime.metric) return node.runtime.metric;
  return deriveMetric(node);
}

function deriveMetric(node: EntityNode): Metric | null {
  for (const check of node.runtime.checks) {
    const out = check.output ?? {};
    if (typeof out.rttMs === "number") {
      return { value: out.rttMs.toFixed(2), unit: "ms" };
    }
    if (typeof out.statusCode === "number" && out.statusCode > 0) {
      return { value: String(out.statusCode), unit: "HTTP" };
    }
    // DNS module: e.g. { recordCount: 2, type: "NS" } -> "2 NS".
    if (typeof out.recordCount === "number" && typeof out.type === "string") {
      return { value: String(out.recordCount), unit: out.type };
    }
  }
  return null;
}

/** True if a node has any warn/crit descendant (used for auto-pin). */
export function hasFailingDescendant(node: TreeNode, disabledPaths?: Set<string>): boolean {
  return leaves(node).some((l) => {
    if (disabledPaths?.has(l.path)) return false;
    const s = toStatus(l.runtime.state);
    return s === "warn" || s === "crit";
  });
}
