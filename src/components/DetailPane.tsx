import type { EntityNode } from "../api/types";
import { colorForStatus, metricOf, statusOf, type Status } from "../board/model";
import { Icon } from "./Icon";
import { StatsPane } from "./StatsPane";

const STATUS_LABEL: Record<Status, string> = {
  ok: "OK",
  warn: "Warning",
  crit: "Critical",
  unknown: "Unknown",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatTime(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function DetailPane({
  node,
  disabled,
  onToggleDisabled,
  onShowConfig,
}: {
  node: EntityNode | null;
  disabled: boolean;
  onToggleDisabled: (path: string) => void;
  onShowConfig: () => void;
}) {
  if (!node) {
    return <StatsPane />;
  }

  const status = disabled ? "unknown" : statusOf(node);
  const metric = disabled ? null : metricOf(node);
  const swatchColor = disabled ? "oklch(0.47 0.01 260)" : colorForStatus(node, status);

  return (
    <div className="detail">
      <div className="detail-head">
        <span
          className="detail-swatch"
          style={{ background: swatchColor }}
        />
        <Icon name={node.display?.icon} size={20} />
        <div className="detail-title">
          <div className="detail-name">{node.name}</div>
          <code className="detail-path">{node.path}</code>
        </div>
        <span className="detail-status">{disabled ? "Disabled" : STATUS_LABEL[status]}</span>
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className={`ctrl-btn${disabled ? " active" : ""}`}
          onClick={() => onToggleDisabled(node.path)}
        >
          {disabled ? "Disabled" : "Enabled"}
        </button>
        <button
          type="button"
          className="ctrl-btn"
          onClick={onShowConfig}
        >
          Show Config
        </button>
      </div>

      {metric && (
        <div className="detail-metric">
          <span className="detail-metric-value">{metric.value}</span>
          {metric.unit && <span className="detail-metric-unit">{metric.unit}</span>}
        </div>
      )}

      {disabled ? (
        <p className="detail-empty">Disabled</p>
      ) : node.runtime.checks.length === 0 ? (
        <p className="detail-empty">No checks configured.</p>
      ) : (
        <div className="checks">
          {node.runtime.checks.map((check) => (
            <div key={check.name} className="check">
              <div className="check-head">
                <span className="check-name">{check.name}</span>
                <span className={`check-flag ${check.online ? "ok" : "down"}`}>
                  {check.online ? "online" : "down"}
                </span>
                <span className="check-time">{formatTime(check.lastUpdate)}</span>
              </div>
              {check.message && <div className="check-message">{check.message}</div>}
              {Object.keys(check.output).length > 0 && (
                <table className="output">
                  <tbody>
                    {Object.entries(check.output).map(([key, value]) => (
                      <tr key={key}>
                        <td className="output-key">{key}</td>
                        <td className="output-value">{formatValue(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
