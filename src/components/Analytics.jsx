import { useState, useEffect } from "react";

function CustomSVGLineChart({ data, width = 500, height = 150 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - 40) + 20;
    const y = height - ((val - min) / range) * (height - 40) - 20;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      <line x1="20" y1="20" x2={width - 20} y2="20" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
      <line x1="20" y1={height / 2} x2={width - 20} y2={height / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
      <line x1="20" y1={height - 20} x2={width - 20} y2={height - 20} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      <polyline
        fill="none"
        stroke="var(--color-lime)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.12"
        points={points}
      />
      <polyline
        fill="none"
        stroke="var(--color-lime)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chart-line"
        points={points}
      />

      {data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * (width - 40) + 20;
        const y = height - ((val - min) / range) * (height - 40) - 20;
        return (
          <g key={idx}>
            <circle
              cx={x}
              cy={y}
              r="6"
              fill="var(--bg-card)"
              stroke="var(--color-lime)"
              strokeWidth="2"
            />
            <circle
              cx={x}
              cy={y}
              r="2"
              fill="var(--color-lime)"
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function Analytics({ leads }) {
  const [stats, setStats] = useState({
    leadsCount: leads.length,
    emailsSent: 0,
    openRate: 0,
    replyRate: 0,
    interestRate: 0,
    interested: 0,
    revenue: 0,
    weeklyLeads: [0, 0, 0, 0, 0, 0, 0],
    opensByDay: [0, 0, 0, 0, 0, 0, 0]
  });
  const [recommendation, setRecommendation] = useState("Loading AI copywriting insights...");


  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/analytics");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to load analytics:", err);
      }
    }
    
    async function loadRecommendations() {
      try {
        const res = await fetch("/api/analytics/recommendations");
        if (res.ok) {
          const data = await res.json();
          setRecommendation(data.recommendation || "No recommendation found.");
        }
      } catch (err) {
        console.error("Failed to load recommendations:", err);
        setRecommendation("Unable to connect to Antigravity Recommendations Engine.");
      }
    }

    loadAnalytics();
    loadRecommendations();
  }, [leads]);

  // regional conversion metrics calculation
  const regionalData = stats.regionalData || [];

  const funnelStages = [
    { label: "Scraped Leads Discovered", val: stats.leadsCount, pct: 100, color: "var(--color-indigo)" },
    { label: "Emails Delivered & Sent", val: stats.emailsSent, pct: stats.emailsSent > 0 ? 100 : 0, color: "var(--color-amber)" },
    { label: "Outreach Opened & Tracked", val: Math.round(stats.emailsSent * (stats.openRate / 100)), pct: stats.openRate, color: "var(--color-indigo)" },
    { label: "Inbound Responses Labeled", val: Math.round(stats.emailsSent * (stats.replyRate / 100)), pct: stats.replyRate, color: "var(--color-emerald)" },
    { label: "Hot Leads Labeled Interested", val: stats.interested, pct: stats.interestRate, color: "var(--color-lime)" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", animation: "fadeIn 0.4s ease" }}>
      
      <div>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Advanced Campaign Analytics</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Track delivery metrics, email open rates, regional conversion rates, and automated strategy tuning logs.
        </p>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
        {[
          { label: "Total Leads", val: stats.leadsCount, desc: "Scraped profiles", color: "var(--text-primary)" },
          { label: "Emails Sent", val: stats.emailsSent, desc: "Outbound dispatches", color: "var(--color-indigo)" },
          { label: "Open Rate", val: `${stats.openRate}%`, desc: "Tracked pixel opens", color: "var(--color-amber)" },
          { label: "Conversion Rate", val: `${stats.replyRate}%`, desc: "Engaged replies", color: "var(--color-lime)" }
        ].map((kpi, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>{kpi.label}</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: kpi.color }}>{kpi.val}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{kpi.desc}</span>
          </div>
        ))}
      </div>

      {/* Main Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr", gap: "24px" }}>
        
        {/* Line Chart glass panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Daily Open Rate Trends</h3>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>A/B test variations active across regions.</span>
          </div>
          
          <div style={{ padding: "10px", background: "var(--bg-translucent-subtle)", border: "var(--border-subtle)", borderRadius: "12px" }}>
            <CustomSVGLineChart data={stats.opensByDay} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", borderTop: "1px solid var(--border-translucent)", paddingTop: "14px" }}>
            {[
              { label: "Peak Open Day", val: "Thursday" },
              { label: "Best Hour", val: "10:30 AM" },
              { label: "Avg Delivery", val: "99.4%" },
              { label: "Opt-Out Rate", val: "0.4%" }
            ].map((stat, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "2px", textAlign: "center" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{stat.label}</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{stat.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel chart glass panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Outreach Funnel Analysis</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {funnelStages.map((stage, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px",
                  padding: "10px 14px",
                  background: "var(--bg-translucent-subtle)",
                  border: "var(--border-subtle)",
                  borderRadius: "8px"
                }}
              >
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: `${stage.color}15`, color: stage.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "12px" }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{stage.label}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{stage.val} prospects reached</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: stage.color }}>{stage.pct}%</div>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase" }}>CONVERSION</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Gemini AI Recommendations & Regional Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr", gap: "24px" }}>
        
        {/* Gemini Grounded copy recommendation widget */}
        <div className="glass-panel" style={{ border: "var(--border-glow)", background: "var(--color-indigo-glow)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-indigo)", fontWeight: 800, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span>Antigravity Copywriting Insights</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.6", whiteSpace: "pre-line" }}>
            {recommendation}
          </p>
        </div>

        {/* Regional performance */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Campaign Breakdown by Region</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {regionalData.length > 0 ? (
              regionalData.map((reg, idx) => (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{reg.city}</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {reg.opened} opened · <strong>{reg.replied} engaged</strong> ({reg.conversion}% open rate)
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "var(--bg-translucent-mild)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      width: `${reg.conversion}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--color-indigo), var(--color-lime))",
                      borderRadius: "3px"
                    }} />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "40px 10px", textAlign: "center" }}>
                No regional data available yet. Scrape leads in different cities to populate this map.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
