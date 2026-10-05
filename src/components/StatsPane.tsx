import { useStats } from "../hooks/useStats";
import type { JvmInfo } from "../api/types";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function mb(value: number): string {
  return `${Math.round(value).toLocaleString()} MB`;
}

function JvmSection({ jvm }: { jvm: JvmInfo }) {
  return (
    <div className="stats-jvm">
      <div className="stats-subheading">JVM Memory</div>
      <table className="stats-table stats-mem-table">
        <tbody>
          <tr>
            <td className="stats-module">heap used</td>
            <td className="stats-count">{mb(jvm.heap.usedMb)}</td>
          </tr>
          <tr>
            <td className="stats-module">heap committed</td>
            <td className="stats-count">{mb(jvm.heap.committedMb)}</td>
          </tr>
          <tr>
            <td className="stats-module">heap max</td>
            <td className="stats-count">{mb(jvm.heap.maxMb)}</td>
          </tr>
          <tr>
            <td className="stats-module">non-heap used</td>
            <td className="stats-count">{mb(jvm.nonHeapUsedMb)}</td>
          </tr>
        </tbody>
      </table>
      <div className="stats-jvm-meta">
        JVM {jvm.version} -- {jvm.vendor} -- up {formatUptime(jvm.uptimeSeconds)}
      </div>
    </div>
  );
}

export function StatsPane() {
  const { data, loading } = useStats(5000);

  if (loading && !data) {
    return (
      <div className="detail placeholder">
        <p>Loading stats...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="detail placeholder">
        <p>Stats unavailable.</p>
      </div>
    );
  }

  const modules = Object.entries(data.modules).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="detail stats-pane">
      <div className="stats-heading">
        Probes in the last {data.windowSeconds}s
      </div>
      <table className="stats-table">
        <tbody>
          {modules.map(([name, count]) => (
            <tr key={name}>
              <td className="stats-module">{name}</td>
              <td className="stats-count">{count.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="stats-total-row">
            <td className="stats-module">total</td>
            <td className="stats-count">{data.total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      {data.jvm && <JvmSection jvm={data.jvm} />}
    </div>
  );
}
