import {
  loadAgents,
  loadIntegrations,
  loadRoutingConfig,
  loadSystemConfig,
} from "@jarvis/config";

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active" || status === "connected"
      ? "var(--success)"
      : status === "paused" || status === "draft"
        ? "var(--warning)"
        : "var(--muted)";

  return (
    <span
      style={{
        fontSize: "0.75rem",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
      }}
    >
      {status}
    </span>
  );
}

export default function Home() {
  const system = loadSystemConfig();
  const agents = loadAgents();
  const integrations = loadIntegrations();
  const routing = loadRoutingConfig();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ marginBottom: "2.5rem" }}>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          v{system.version}
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 600 }}>{system.name}</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          AI agent command centre — config-driven orchestration
        </p>
      </header>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "1rem" }}>Agents</h2>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {agents.map((agent) => (
            <article
              key={agent.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  gap: "0.5rem",
                }}
              >
                <strong>{agent.name}</strong>
                <StatusBadge status={agent.status} />
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: 4 }}>
                {agent.provider} · {agent.model}
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 2 }}>
                {agent.supabase_id}
              </p>
              <p style={{ fontSize: "0.875rem", marginTop: 8 }}>
                {agent.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "1rem" }}>
          Integrations
        </h2>
        <ul
          style={{
            listStyle: "none",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {integrations.map((integration, i) => (
            <li
              key={integration.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              <span>{integration.name}</span>
              <StatusBadge status={integration.status} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "1rem" }}>Routing</h2>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.875rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "0.75rem 1rem" }}>Intent</th>
              <th style={{ padding: "0.75rem 1rem" }}>Agent</th>
              <th style={{ padding: "0.75rem 1rem" }}>Fallback</th>
            </tr>
          </thead>
          <tbody>
            {routing.routes.map((route) => (
              <tr key={route.intent} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 1rem" }}>{route.intent}</td>
                <td style={{ padding: "0.75rem 1rem" }}>{route.agent_id}</td>
                <td style={{ padding: "0.75rem 1rem", color: "var(--muted)" }}>
                  {route.fallback_agent_id ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
