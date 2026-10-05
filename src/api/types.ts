// Types mirroring the backend API contract (see backend/API_SPEC.md).

export type NodeType = "group" | "entity";

export type State = "unknown" | "online" | "warning" | "offline";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Per-state colour overrides. Absent keys fall back to the SPA default palette. */
export interface DisplayColors {
  online?: string;
  warning?: string;
  offline?: string;
  unknown?: string;
}

/** Layout metadata, present on every node in resolved views (incl. status). */
export interface Display {
  icon?: string; // Lucide icon name, kebab-case
  colors?: DisplayColors;
}

/** Result of the most recent run of a single check instance. */
export interface CheckResult {
  name: string;
  lastUpdate?: string; // ISO-8601 instant
  online: boolean;
  output: Record<string, unknown>; // module-specific, camelCase keys
  message?: string;
}

export interface GroupRuntime {
  state: State;
}

/** Primary display metric for an entity, defined in the backend config. */
export interface Metric {
  value: string;
  unit: string;
}

export interface EntityRuntime {
  state: State;
  checks: CheckResult[];
  metric?: Metric;
}

/** Common fields shared by every node (status view). */
interface NodeBase {
  id: string;
  name: string;
  type: NodeType;
  path: string;
  display?: Display;
}

export interface GroupNode extends NodeBase {
  type: "group";
  runtime: GroupRuntime;
  children: TreeNode[];
}

export interface EntityNode extends NodeBase {
  type: "entity";
  runtime: EntityRuntime;
}

export type TreeNode = GroupNode | EntityNode;

export function isGroup(node: TreeNode): node is GroupNode {
  return node.type === "group";
}

export function isEntity(node: TreeNode): node is EntityNode {
  return node.type === "entity";
}

export interface LogEntry {
  seq: number;
  ts: string; // ISO-8601 instant
  level: LogLevel;
  path: string; // node path or "system"
  message: string;
}

export interface SchedulerStatus {
  running: boolean;
}

export interface ReloadResult {
  reloaded: boolean;
  running: boolean;
}

export interface JvmHeap {
  usedMb: number;
  committedMb: number;
  maxMb: number;
}

export interface JvmInfo {
  version: string;
  vendor: string;
  uptimeSeconds: number;
  heap: JvmHeap;
  nonHeapUsedMb: number;
}

export interface StatsData {
  windowSeconds: number;
  modules: Record<string, number>;
  total: number;
  jvm?: JvmInfo;
}
