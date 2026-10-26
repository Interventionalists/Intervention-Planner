import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardTitle, PageHeading } from "../components/PageElements";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// checks run when the page opens, then every 10 minutes
const REFRESH_MS = 10 * 60_000;

const SERVICES = {
  database: { label: "Database", description: "Backend to Supabase round trip" },
  supabase: { label: "Supabase", description: "Supabase status page" },
  cloudflare: { label: "Cloudflare", description: "Workers & CDN (frontend hosting)" },
  render: { label: "Render", description: "Web services & deploys (backend hosting)" },
};
const SERVICE_ORDER = ["database", "supabase", "cloudflare", "render"];

// status is always shown as icon + text, never color alone
const STATUS_DISPLAY = {
  ok: { label: "Operational", icon: CheckCircle2 },
  degraded: { label: "Degraded", icon: AlertTriangle },
  down: { label: "Down", icon: XCircle },
  unknown: { label: "Unknown", icon: CircleHelp },
};

const REASONS = {
  timeout: "The check timed out.",
  unreachable: "Couldn't reach the service.",
  http_error: "The service returned an error.",
  bad_response: "The response couldn't be read.",
  not_found: "The watched components weren't listed.",
  error: "The check failed.",
};

function serviceLabel(service) {
  return SERVICES[service]?.label || service;
}

function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

// one short line explaining a result: the failure reason, or what's affected
function summarize(result) {
  const details = result.details || {};
  if (details.reason) return REASONS[details.reason] || REASONS.error;
  if (details.incidents?.length) return details.incidents[0];
  if (details.affected_components?.length) {
    return `Affected: ${details.affected_components.join(", ")}`;
  }
  if (result.service === "database" && result.latency_ms != null) {
    return `Responded in ${result.latency_ms} ms`;
  }
  return details.description || "No reported issues";
}

function StatusBadge({ status }) {
  const display = STATUS_DISPLAY[status] || STATUS_DISPLAY.unknown;
  const Icon = display.icon;
  return (
    <span className={`status-badge status-${status in STATUS_DISPLAY ? status : "unknown"}`}>
      <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
      {display.label}
    </span>
  );
}

function ServiceCard({ result }) {
  const service = SERVICES[result.service] || { label: result.service, description: "" };
  return (
    <section className="card status-card" aria-label={`${service.label} status`}>
      <div className="status-card-head">
        <h2>{service.label}</h2>
        <StatusBadge status={result.status} />
      </div>
      <p className="muted">{service.description}</p>
      <p className="status-card-summary">{summarize(result)}</p>
    </section>
  );
}

function LatencyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="latency-tooltip">
      <strong>{point.latency_ms} ms</strong>
      <span>{formatDateTime(point.checked_at)}</span>
    </div>
  );
}

function LatencyChart({ history, historyAvailable }) {
  if (!historyAvailable) {
    return (
      <p className="data-state">
        History is unavailable right now. Live status above is still current.
      </p>
    );
  }
  const points = history.filter((point) => point.latency_ms != null);
  if (points.length < 2) {
    return (
      <p className="data-state">
        Not enough history yet. A data point is saved each time this page checks.
      </p>
    );
  }

  return (
    <>
      <div className="latency-chart" role="img" aria-label="Database response time over the last 24 hours">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ececec" vertical={false} />
            <XAxis
              dataKey="checked_at"
              tickFormatter={formatTime}
              tick={{ fontSize: 11, fill: "#777" }}
              tickLine={false}
              axisLine={{ stroke: "#d9d9d9" }}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#777" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<LatencyTooltip />} cursor={{ stroke: "#bbb" }} />
            <Line
              type="monotone"
              dataKey="latency_ms"
              stroke="#2a78d6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="latency-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr><th scope="col">Checked</th><th scope="col">Response time</th></tr>
          </thead>
          <tbody>
            {[...points].reverse().slice(0, 50).map((point) => (
              <tr key={point.checked_at}>
                <td>{formatDateTime(point.checked_at)}</td>
                <td>{point.latency_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function EventsList({ events, historyAvailable }) {
  if (!historyAvailable) {
    return <p className="data-state">Event history is unavailable right now.</p>;
  }
  if (!events.length) {
    return <p className="data-state">No issues recorded in the last 5 days.</p>;
  }
  return (
    <ul className="health-events">
      {events.map((event, index) => (
        <li key={`${event.service}-${event.checked_at}-${index}`}>
          <StatusBadge status={event.status} />
          <div>
            <strong>{serviceLabel(event.service)}</strong>
            <span className="muted"> · {formatDateTime(event.checked_at)}</span>
            <p>{summarize(event)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SystemHealthPage({ role }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/admin/system-health`, {
        signal: controller.signal,
      });
      if (response.status === 403) {
        throw new Error("Admin access is required to view system status.");
      }
      if (!response.ok) {
        throw new Error("Couldn't load system status. Please try again.");
      }
      const result = await response.json();
      if (!Array.isArray(result.services)) {
        throw new Error("The status response has an unexpected format.");
      }
      setData(result);
      setError("");
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError(loadError.message || "Couldn't load system status.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (role !== "admin") {
      setError("Admin access is required to view system status.");
      setIsLoading(false);
      return undefined;
    }

    load();
    // skip refreshes while the browser tab is hidden
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);

    return () => {
      clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [role, load]);

  const services = data
    ? [...data.services].sort(
        (a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service)
      )
    : [];

  return (
    <div className="system-health-page">
      <PageHeading
        eyebrow="Admin"
        title="System status"
        subtitle="Live checks of the database and the services Interventioner runs on. Checks when this page opens, then every 10 minutes."
      />

      <div className="status-toolbar">
        <span className="muted" role="status">
          {isLoading
            ? "Checking services…"
            : data
              ? `Last checked ${formatTime(data.generated_at)}`
              : ""}
        </span>
        {role === "admin" && (
          <button type="button" className="status-refresh" onClick={load} disabled={isLoading}>
            <RefreshCw size={15} aria-hidden="true" className={isLoading ? "spinning" : ""} />
            Refresh
          </button>
        )}
      </div>

      {error && (
        <div className="card error-state status-error" role="alert">
          {error}
          {data && " Showing the last results that loaded."}
        </div>
      )}

      {!data && isLoading && (
        <div className="data-state" role="status">Loading system status…</div>
      )}

      {data && (
        <>
          <div className="status-grid">
            {services.length ? (
              services.map((result) => <ServiceCard key={result.service} result={result} />)
            ) : (
              <p className="data-state">No services were checked.</p>
            )}
          </div>

          <div className="status-detail-grid">
            <section className="card">
              <CardTitle title="Database response time, ms (24 hours)" />
              <LatencyChart
                history={data.latency_history || []}
                historyAvailable={data.history_available !== false}
              />
            </section>
            <section className="card">
              <CardTitle title="Recent issues (5 days)" />
              <EventsList
                events={data.events || []}
                historyAvailable={data.history_available !== false}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default SystemHealthPage;
