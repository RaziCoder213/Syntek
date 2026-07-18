import { useMemo } from "react";

function MiniBarChart({ data, color = "var(--brand)" }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 36 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.round((v / max) * 100)}%`,
            minHeight: 3,
            background: color,
            borderRadius: 3,
            opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.4,
            transition: "height 0.5s",
          }}
        />
      ))}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Dashboard({ leads, analytics, settings, onNavigate }) {
  const stats = useMemo(() => {
    const total       = leads.length;
    const contacted   = leads.filter(l => l.status === "contacted" || l.status === "replied").length;
    const noEmail     = leads.filter(l => l.status === "no_email" || !l.email).length;
    const pending     = leads.filter(l => l.status === "not contacted").length;
    const replied     = leads.filter(l => l.status === "replied").length;
    const convRate    = contacted > 0 ? ((replied / contacted) * 100).toFixed(1) : 0;
    return { total, contacted, noEmail, pending, replied, convRate };
  }, [leads]);

  const recentLeads = useMemo(() =>
    [...leads].sort((a, b) => b.id - a.id).slice(0, 6),
  [leads]);

  const weeklyData  = analytics.weeklyLeads || [0,0,0,0,0,0,0];
  const opensByDay  = analytics.opensByDay  || [0,0,0,0,0,0,0];

  const statusColor = { "not contacted": "badge-neutral", contacted: "badge-brand", replied: "badge-success", no_email: "badge-warning", won: "badge-success" };
  const wsColor = { active: "badge-success", no_website: "badge-danger", down: "badge-warning" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-title">Dashboard</div>
          <div className="section-desc">Overview of your outreach pipeline.</div>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("Leads")}>
          ◎ Find New Leads
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid-4">
        <div className="metric-card">
          <div className="metric-icon brand">◎</div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-label">Total Leads</div>
          <div className="metric-delta flat">{stats.pending} pending contact</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon success">✉</div>
          <div className="metric-value">{analytics.emailsSent || stats.contacted}</div>
          <div className="metric-label">Emails Sent</div>
          <div className="metric-delta up">↑ {analytics.openRate || 0}% open rate</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon info">↩</div>
          <div className="metric-value">{stats.replied}</div>
          <div className="metric-label">Replies Received</div>
          <div className="metric-delta up">↑ {stats.convRate}% conversion</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon warning">⚡</div>
          <div className="metric-value">{settings.isActive ? "ON" : "OFF"}</div>
          <div className="metric-label">Autopilot</div>
          <div className={`metric-delta ${settings.isActive ? "up" : "flat"}`}>
            {settings.isActive ? "Running daily" : "Configure in Automation"}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Leads This Week</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Daily</span>
          </div>
          <MiniBarChart data={weeklyData} color="var(--brand)" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {DAYS.map(d => (
              <span key={d} style={{ fontSize: 10, color: "var(--text-4)" }}>{d}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Email Opens</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Daily</span>
          </div>
          <MiniBarChart data={opensByDay} color="var(--success)" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {DAYS.map(d => (
              <span key={d} style={{ fontSize: 10, color: "var(--text-4)" }}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline overview + recent leads */}
      <div className="grid-2">
        {/* Pipeline summary */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Pipeline Summary</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("Pipeline")}>View board →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Not Contacted", value: stats.pending,   color: "var(--text-3)" },
              { label: "Contacted",     value: stats.contacted, color: "var(--brand)" },
              { label: "Replied",       value: stats.replied,   color: "var(--success)" },
              { label: "No Email",      value: stats.noEmail,   color: "var(--warning)" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text-3)", width: 110, flexShrink: 0 }}>{s.label}</span>
                <div style={{ flex: 1, height: 6, background: "var(--bg-overlay)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: stats.total ? `${(s.value / stats.total) * 100}%` : "0%",
                    background: s.color,
                    borderRadius: 99,
                    transition: "width 0.6s",
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", minWidth: 24, textAlign: "right" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Automation status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Automation Status</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("Automation")}>Configure →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Autopilot</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`status-dot ${settings.isActive ? "green pulse" : "gray"}`} />
                <span style={{ fontSize: 12, fontWeight: 600, color: settings.isActive ? "var(--success)" : "var(--text-3)" }}>
                  {settings.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Mode</span>
              <span className="badge badge-brand" style={{ textTransform: "capitalize" }}>
                {(settings.autopilotMode || "both").replace("_", " ")}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Target niche</span>
              <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500 }}>{settings.niche || "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Location</span>
              <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500 }}>{settings.location || "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Gmail</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`status-dot ${settings.gmailUser ? "green" : "red"}`} />
                <span style={{ fontSize: 12, color: settings.gmailUser ? "var(--success)" : "var(--danger)" }}>
                  {settings.gmailUser ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent leads table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
          <span className="card-title">Recent Leads</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("Leads")}>View all →</button>
        </div>
        {recentLeads.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-state-icon">◎</div>
            <div className="empty-state-title">No leads yet</div>
            <div className="empty-state-desc">Go to Lead Finder to scrape your first batch of qualified leads.</div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => onNavigate("Leads")}>
              Start Scraping
            </button>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Location</th>
                  <th>Email</th>
                  <th>Website</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type}</div>
                    </td>
                    <td>{l.city}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {l.email ? (
                        <a href={`mailto:${l.email}`} style={{ color: "var(--brand)" }}>{l.email}</a>
                      ) : (
                        <span style={{ color: "var(--text-4)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {l.website ? (
                        <span className={`badge ${wsColor[l.website_status] || "badge-neutral"}`}>
                          {l.website_status || "active"}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-4)", fontSize: 12 }}>No website</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${statusColor[l.status] || "badge-neutral"}`}>
                        {l.status?.replace("_", " ") || "new"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
