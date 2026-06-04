import React from "react";

function MiniBarChart({ data, color = "#c8ff00" }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "32px", marginTop: "12px" }}>
      {data.map((val, idx) => (
        <div
          key={idx}
          style={{
            flex: 1,
            height: `${(val / max) * 100}%`,
            backgroundColor: color,
            borderRadius: "3px",
            opacity: idx === data.length - 1 ? 1 : 0.45,
            transition: "height 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        />
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, chart, color = "#c8ff00" }) {
  return (
    <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ fontSize: "11px", color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>{sub}</span>}
      {chart && <MiniBarChart data={chart} color={color} />}
    </div>
  );
}

export default function Dashboard({ leads, emails, setTab, triggerSearch, analytics }) {
  const interestedCount = leads.filter(l => l.status === "interested").length;
  const contactedCount = leads.filter(l => l.status === "contacted").length;
  const repliedCount = leads.filter(l => l.status === "replied").length;
  const totalLeads = leads.length;
  
  // Pipeline Value = Closed deals * 1400 + Interested * 800
  const closedCount = leads.filter(l => l.status === "closed").length;
  const estPipelineValue = (closedCount * 1200) + (interestedCount * 450);

  // Recent simulated logs of activities
  const recentActivities = [
    { icon: "⚡", text: "AI Auto-Optimized: Adjusted Denver email subject lines", time: "10m ago", color: "var(--color-lime)" },
    { icon: "✉️", text: `${emails.filter(e => !e.read).length} new replies waiting in your Smart Inbox`, time: "1h ago", color: "var(--color-indigo)" },
    { icon: "🔍", text: `Yelp & Google Maps scan discovered ${leads.filter(l => l.status === 'not contacted').length} new business leads`, time: "3h ago", color: "var(--color-amber)" },
    { icon: "🔥", text: "Lead 'Salt & Oak' marked as Interested by AI strategy analyser", time: "5h ago", color: "var(--color-emerald)" },
    { icon: "✅", text: "Successfully connected to Outbox via Secure SMTP", time: "1d ago", color: "var(--color-teal)" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", animation: "fadeIn 0.4s ease" }}>
      {/* Welcome Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)", margin: 0 }}>
            Outreach Control Center
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Real-time status of your autonomous B2B restaurant campaigns.
          </p>
        </div>
        <button
          className="btn btn-lime glow-card"
          onClick={() => { setTab("Lead Finder"); setTimeout(() => triggerSearch(), 100); }}
        >
          <span style={{ fontSize: "14px" }}>⚡</span> Discover 100 Local Leads
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid-5">
        <StatCard 
          label="Total Scraped Leads" 
          value={totalLeads} 
          sub={`+${leads.filter(l => l.status === "not contacted").length} new profiles this week`} 
          chart={[12, 19, 23, 17, 32, 28, totalLeads]} 
          color="var(--color-indigo)" 
        />
        <StatCard 
          label="Outreach Sent" 
          value={analytics.emailsSent} 
          sub={`Avg. delivery success 98.4%`} 
          chart={analytics.weeklyLeads} 
          color="var(--color-amber)" 
        />
        <StatCard 
          label="Open Rate" 
          value={`${analytics.openRate}%`} 
          sub="🎯 Goal target: 45%" 
          chart={analytics.opensByDay} 
          color="var(--color-lime)" 
        />
        <StatCard 
          label="AI Smart Replies" 
          value={`${analytics.replyRate}%`} 
          sub={`Inbox: ${emails.length} active threads`} 
          chart={[8, 11, 10, 14, 12, 9, 12]} 
          color="var(--color-emerald)" 
        />
        <StatCard 
          label="Pipeline Value" 
          value={`$${estPipelineValue.toLocaleString()}`} 
          sub="Est. revenue in stages" 
          chart={[1500, 2400, 3100, 2900, 4200, 4800, estPipelineValue]} 
          color="var(--color-teal)" 
        />
      </div>

      {/* Main Grid: Activity & Pipeline overview */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", flexWrap: "wrap" }}>
        
        {/* Activity feed */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Autonomous Activity Log</h3>
            <span style={{ fontSize: "11px", color: "var(--color-lime)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              ● AI LIVE RUNNING
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {recentActivities.map((act, index) => (
              <div 
                key={index} 
                style={{ 
                  display: "flex", 
                  gap: "14px", 
                  alignItems: "center", 
                  padding: "12px", 
                  background: "var(--bg-translucent-subtle)", 
                  border: "1px solid var(--border-translucent)", 
                  borderRadius: "10px",
                  transition: "background 0.2s"
                }}
              >
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `${act.color}15`,
                  color: act.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: "bold"
                }}>
                  {act.icon}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 550 }}>{act.text}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{act.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline conversion summary */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Stage Conversion Ratio</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {[
              { label: "Scraped Leads", count: totalLeads, percent: 100, color: "var(--color-indigo)" },
              { label: "Contacted / In outreach", count: contactedCount + repliedCount + interestedCount + closedCount, percent: Math.round(((contactedCount + repliedCount + interestedCount + closedCount) / Math.max(totalLeads, 1)) * 100), color: "var(--color-amber)" },
              { label: "Replied Inquiries", count: repliedCount + interestedCount + closedCount, percent: Math.round(((repliedCount + interestedCount + closedCount) / Math.max(totalLeads, 1)) * 100), color: "var(--color-indigo)" },
              { label: "Hot / Interested Prospects", count: interestedCount + closedCount, percent: Math.round(((interestedCount + closedCount) / Math.max(totalLeads, 1)) * 100), color: "var(--color-emerald)" },
              { label: "Closed / Signed Contracts", count: closedCount, percent: Math.round((closedCount / Math.max(totalLeads, 1)) * 100), color: "var(--color-lime)" }
            ].map((stage, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{stage.label}</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{stage.count}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({stage.percent}%)</span>
                  </div>
                </div>
                <div style={{ height: "6px", background: "var(--bg-translucent-mild)", borderRadius: "3px", overflow: "hidden", display: "flex" }}>
                  <div style={{
                    width: `${stage.percent}%`,
                    height: "100%",
                    background: stage.color,
                    borderRadius: "3px",
                    boxShadow: `0 0 8px ${stage.color}40`,
                    transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
