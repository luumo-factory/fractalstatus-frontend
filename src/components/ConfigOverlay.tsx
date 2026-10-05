import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

type ConfigMode = "defaults" | "raw";

interface ConfigOverlayProps {
  visible: boolean;
  path: string | null;
  defaultsTree: unknown;
  defaultsLoading: boolean;
  defaultsError: string | null;
  rawTree: unknown;
  rawLoading: boolean;
  rawError: string | null;
  onLoadDefaults: () => void;
  onLoadRaw: () => void;
  onClose: () => void;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapTree(root: unknown): unknown {
  if (!isObject(root)) return root;
  if ("tree" in root && isObject(root.tree)) return root.tree;
  return root;
}

function findNodeByPathField(node: unknown, path: string): unknown {
  if (!isObject(node)) return null;
  if (node.path === path) return node;
  const children = node.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const found = findNodeByPathField(child, path);
    if (found) return found;
  }
  return null;
}

function findNodeByIdPath(root: unknown, path: string): unknown {
  const unwrapped = unwrapTree(root);
  if (!isObject(unwrapped)) return null;
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return null;

  let cur: unknown = unwrapped;
  if (!isObject(cur) || cur.id !== segments[0]) return null;

  for (let i = 1; i < segments.length; i++) {
    if (!isObject(cur)) return null;
    const children = cur.children;
    if (!Array.isArray(children)) return null;
    const next = children.find((c) => isObject(c) && c.id === segments[i]);
    if (!next) return null;
    cur = next;
  }

  return cur;
}

function findNode(root: unknown, path: string): unknown {
  const unwrapped = unwrapTree(root);
  const byPath = findNodeByPathField(unwrapped, path);
  if (byPath) return byPath;
  return findNodeByIdPath(unwrapped, path);
}

function stripRuntime(node: unknown): unknown {
  if (!isObject(node)) return node;
  const out: Record<string, unknown> = {};
  const keys = ["id", "name", "path", "type", "display", "config", "children"];
  for (const key of keys) {
    if (key in node) out[key] = node[key];
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderHighlightedJson(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match, strToken, boolOrNull, num) => {
      if (strToken) {
        const isKey = strToken.endsWith(":");
        return `<span class="json-${isKey ? "key" : "string"}">${strToken}</span>`;
      }
      if (boolOrNull) {
        const cls = boolOrNull === "null" ? "null" : "bool";
        return `<span class="json-${cls}">${boolOrNull}</span>`;
      }
      if (num) return `<span class="json-num">${num}</span>`;
      return match;
    },
  );
}

export function ConfigOverlay({
  visible,
  path,
  defaultsTree,
  defaultsLoading,
  defaultsError,
  rawTree,
  rawLoading,
  rawError,
  onLoadDefaults,
  onLoadRaw,
  onClose,
}: ConfigOverlayProps) {
  const [mode, setMode] = useState<ConfigMode>("defaults");

  useEffect(() => {
    if (!visible) return;
    if (mode === "defaults") onLoadDefaults();
    else onLoadRaw();
  }, [visible, mode, onLoadDefaults, onLoadRaw]);

  const activeTree = mode === "defaults" ? defaultsTree : rawTree;
  const activeLoading = mode === "defaults" ? defaultsLoading : rawLoading;
  const activeError = mode === "defaults" ? defaultsError : rawError;
  const activeLabel = mode === "defaults" ? "resultant" : "original";

  const nodeConfigText = useMemo(() => {
    if (activeLoading) {
      return mode === "defaults"
        ? "Loading /api/tree/config-defaults..."
        : "Loading /api/tree/config...";
    }
    if (activeError) return `Error loading ${activeLabel} config: ${activeError}`;
    if (!path) return "No node selected.";
    if (!activeTree) return `${activeLabel} config unavailable.`;
    const node = findNode(activeTree, path);
    if (!node) {
      return mode === "defaults"
        ? "Node not found in /api/tree/config-defaults"
        : "Node not found in /api/tree/config (path match failed; check id hierarchy)";
    }
    return JSON.stringify(stripRuntime(node), null, 2);
  }, [path, activeTree, activeLoading, activeError, activeLabel, mode]);

  const highlighted = useMemo(
    () => renderHighlightedJson(nodeConfigText),
    [nodeConfigText],
  );

  if (!visible) return null;

  return (
    <div className="config-overlay" onClick={onClose}>
      <div className="config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-head">
          <div className="config-modal-title">Config{path ? `: ${path}` : ""}</div>
          <button
            type="button"
            className="ctrl-btn icon-only"
            onClick={onClose}
            title="Close config"
          >
            <X size={15} />
          </button>
        </div>

        <div className="config-tabs" role="tablist" aria-label="Config source">
          <button
            type="button"
            className={`config-tab${mode === "defaults" ? " active" : ""}`}
            onClick={() => setMode("defaults")}
            role="tab"
            aria-selected={mode === "defaults"}
          >
            Resultant config
          </button>
          <button
            type="button"
            className={`config-tab${mode === "raw" ? " active" : ""}`}
            onClick={() => setMode("raw")}
            role="tab"
            aria-selected={mode === "raw"}
          >
            Original config
          </button>
        </div>

        <pre className="config-editor" aria-label={`${activeLabel} config json`}>
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  );
}
