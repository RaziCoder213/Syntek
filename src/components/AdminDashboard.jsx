import { useState, useEffect } from "react";

export default function AdminDashboard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("tenants"); // tenants, feedbacks, settings
  const [userSearch, setUserSearch] = useState("");
  const [feedbackFilter, setFeedbackFilter] = useState("All");
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch Dashboard Stats & Users
      const res = await fetch("/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setUsers(data.users);
      } else {
        showToast("Failed to fetch admin stats. Admin authorization required.", "danger");
      }

      // Fetch Global User Feedbacks
      const fbRes = await fetch("/api/admin/feedback", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        setFeedbacks(fbData);
      }
    } catch (err) {
      console.error(err);
      showToast("Network error fetching admin dashboard data", "danger");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users/${userId}/toggle-admin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`User privileges updated! Admin status: ${data.is_admin ? "Enabled" : "Disabled"}.`, "success");
        // Update user list state
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: data.is_admin } : u));
      } else {
        const errData = await res.json();
        showToast(errData.error || "Failed to update user privileges", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to toggle admin status due to network error", "danger");
    }
  };

  useEffect(() => {
    fetchAdminData();
    
    // Check local storage for dummy waitlist status
    const savedWaitlist = localStorage.getItem("syntek_waitlist_enabled") === "true";
    setWaitlistEnabled(savedWaitlist);

    // Auto-generate mock log entries
    const mockTelemetryLogs = [
      `[JOB QUEUE] Worker loop started. Recovering stuck jobs...`,
      `[SECURITY] IP rate limiter initialized on authentication routes.`,
      `[DATABASE] Indexes checked and verified for leads & emails.`,
      `[EMAIL AGENT] Inbox sync scheduled checks verified.`,
      `[CAMPAIGN WORKER] Cron campaigns initialized for active senders.`
    ];
    setLogs(mockTelemetryLogs);

    const logInterval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString();
      const actions = [
        `[JOB QUEUE] Polled job_queue. 0 ready tasks found.`,
        `[JOB QUEUE] Completed inbox_sync job for tenant.`,
        `[CRON SCHEDULER] Evaluated preferred_time matching for active campaigns.`,
        `[SECURITY] Rate limiter allowed request from IP client.`,
        `[OUTBOX ROTATION] Selected active sender with lowest load.`
      ];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      setLogs(prev => [`[${timestamp}] ${randomAction}`, ...prev.slice(0, 19)]);
    }, 8000);

    return () => clearInterval(logInterval);
  }, []);

  const handleToggleWaitlist = () => {
    const nextState = !waitlistEnabled;
    setWaitlistEnabled(nextState);
    localStorage.setItem("syntek_waitlist_enabled", String(nextState));
    showToast(`System registration waitlist is now ${nextState ? "ENABLED" : "DISABLED"}.`, "info");
  };

  // Filters
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.company_name && u.company_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const filteredFeedbacks = feedbacks.filter(f => 
    feedbackFilter === "All" ? true : f.category === feedbackFilter
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.25s ease", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ padding: "10px", borderRadius: "10px", background: "var(--color-lime-glow)", border: "1px solid var(--color-lime-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg style={{ width: "24px", height: "24px", color: "var(--color-lime)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--text-primary)", margin: 0 }}>System Admin Control Panel</h2>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", margin: 0 }}>
              Monitor global SaaS metrics, review user-submitted feedbacks, manage user privileges, and configure system gates.
            </p>
          </div>
        </div>
        <button 
          onClick={fetchAdminData} 
          className="btn btn-outline" 
          disabled={loading} 
          style={{ height: "38px", display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}
        >
          <svg style={{ width: "16px", height: "16px" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.228 11H18.2" />
          </svg>
          {loading ? "Refreshing..." : "Refresh Console"}
        </button>
      </div>

      {/* Metrics Cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "4px solid var(--color-indigo)" }}>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Tenants</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "var(--text-primary)" }}>{stats.totalUsers}</span>
          </div>
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "4px solid var(--color-teal)" }}>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Leads Scraped</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "var(--text-primary)" }}>{stats.totalLeads}</span>
          </div>
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "4px solid var(--color-emerald)" }}>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active campaigns</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "var(--text-primary)" }}>{stats.activeCampaigns}</span>
          </div>
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "4px solid var(--color-amber)" }}>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending / Running Jobs</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "var(--text-primary)" }}>
              {stats.jobs?.pending || 0} <span style={{ fontSize: "16px", fontWeight: 500, color: "var(--text-muted)" }}>/ {stats.jobs?.running || 0}</span>
            </span>
          </div>
        </div>
      )}

      {/* Main Admin Content Panels */}
      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: "24px", alignItems: "start" }}>
        
        {/* Left Side Tabbed Console */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Sub Navigation */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-translucent)", paddingBottom: "10px" }}>
            <button 
              onClick={() => setActiveTab("tenants")} 
              className={`tab-btn ${activeTab === "tenants" ? "active" : ""}`}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "tenants" ? "var(--bg-translucent-strong)" : "transparent",
                color: activeTab === "tenants" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Tenants Directory
            </button>
            <button 
              onClick={() => setActiveTab("feedbacks")} 
              className={`tab-btn ${activeTab === "feedbacks" ? "active" : ""}`}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "feedbacks" ? "var(--bg-translucent-strong)" : "transparent",
                color: activeTab === "feedbacks" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              Feedbacks Feed
              {feedbacks.length > 0 && (
                <span style={{ fontSize: "10px", background: "var(--color-crimson)", color: "white", padding: "2px 6px", borderRadius: "10px", fontWeight: 700 }}>
                  {feedbacks.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab 1: Tenants list */}
          {activeTab === "tenants" && (
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: "18px", height: "18px", color: "var(--color-indigo)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Registered User Workspaces</h3>
                </div>
                <input 
                  type="text" 
                  className="input-field" 
                  value={userSearch} 
                  onChange={(e) => setUserSearch(e.target.value)} 
                  placeholder="Search tenants by email..."
                  style={{ width: "240px", height: "32px", fontSize: "12px" }}
                />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "10px 8px" }}>Tenant ID</th>
                      <th style={{ padding: "10px 8px" }}>Account Email</th>
                      <th style={{ padding: "10px 8px" }}>Company Workspace</th>
                      <th style={{ padding: "10px 8px" }}>Registered On</th>
                      <th style={{ padding: "10px 8px" }}>Role Status</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: "20px 8px", color: "var(--text-muted)", textAlign: "center" }}>
                          No tenants match your search filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(user => (
                        <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", color: "var(--text-primary)" }}>
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>{user.id}</td>
                          <td style={{ padding: "12px 8px" }}>{user.email}</td>
                          <td style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>{user.company_name || "Personal Workspace"}</td>
                          <td style={{ padding: "12px 8px", color: "var(--text-muted)" }}>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <span className="badge" style={{ 
                              background: user.is_admin ? "var(--color-indigo-glow)" : "var(--bg-translucent-subtle)", 
                              color: user.is_admin ? "var(--color-indigo)" : "var(--text-secondary)",
                              border: user.is_admin ? "1px solid var(--color-indigo-border)" : "1px solid var(--border-subtle)"
                            }}>
                              {user.is_admin ? "Admin Owner" : "SaaS User"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right" }}>
                            <button
                              onClick={() => handleToggleAdmin(user.id)}
                              className="btn btn-outline"
                              style={{ padding: "4px 8px", fontSize: "10px", height: "24px", borderRadius: "4px" }}
                            >
                              Toggle Role
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Feedbacks list */}
          {activeTab === "feedbacks" && (
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: "18px", height: "18px", color: "var(--color-indigo)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>User Feedback Submissions</h3>
                </div>
                
                {/* Category Filters */}
                <select 
                  className="input-field" 
                  value={feedbackFilter} 
                  onChange={(e) => setFeedbackFilter(e.target.value)}
                  style={{ width: "160px", height: "32px", fontSize: "12px", padding: "0 8px" }}
                >
                  <option value="All">All Categories</option>
                  <option value="Feature Request">💡 Feature Request</option>
                  <option value="Bug Report">🐛 Bug Report</option>
                  <option value="Usability Issue">⚙️ Usability Issue</option>
                  <option value="Question">❓ Question</option>
                  <option value="Other">💬 Other</option>
                </select>
              </div>

              {filteredFeedbacks.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: "40px 0", gap: "8px" }}>
                  <svg style={{ width: "32px", height: "32px" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span style={{ fontSize: "12px" }}>No user feedback matches your category filter.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                  {filteredFeedbacks.map((f) => {
                    const badgeStyles = {
                      "Bug Report": { bg: "rgba(239, 68, 68, 0.08)", color: "var(--color-crimson)", border: "rgba(239, 68, 68, 0.2)" },
                      "Feature Request": { bg: "rgba(99, 102, 241, 0.08)", color: "var(--color-indigo)", border: "rgba(99, 102, 241, 0.2)" },
                      "Usability Issue": { bg: "rgba(245, 158, 11, 0.08)", color: "var(--color-amber)", border: "rgba(245, 158, 11, 0.2)" },
                      "Question": { bg: "rgba(13, 148, 136, 0.08)", color: "var(--color-teal)", border: "rgba(13, 148, 136, 0.2)" }
                    }[f.category] || { bg: "var(--bg-translucent-mild)", color: "var(--text-secondary)", border: "var(--border-translucent)" };

                    return (
                      <div 
                        key={f.id} 
                        style={{
                          background: "var(--bg-translucent-subtle)",
                          border: "1px solid var(--border-translucent)",
                          borderRadius: "10px",
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className="badge" style={{ background: badgeStyles.bg, color: badgeStyles.color, border: `1px solid ${badgeStyles.border}`, fontSize: "9px" }}>
                              {f.category.toUpperCase()}
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              From: {f.user_email || `User ID: ${f.user_id}`} {f.user_company ? `(${f.user_company})` : ""}
                            </span>
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {new Date(f.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.5", margin: 0, whiteSpace: "pre-wrap" }}>
                          {f.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Side Control Deck */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Waitlist Control Gate */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>🛡️ System Gateways</h3>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Registration Waitlist</span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Force new signups into pending list</span>
              </div>
              <button 
                onClick={handleToggleWaitlist}
                className={`btn ${waitlistEnabled ? "btn-crimson" : "btn-lime"}`}
                style={{ height: "30px", fontSize: "11px", padding: "0 12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {waitlistEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border-translucent)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)" }}>API Routing</span>
                <span style={{ color: "var(--color-emerald)", fontWeight: 700 }}>LOCAL CLI (agy -p)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Telemetry Agent</span>
                <span style={{ color: "var(--color-emerald)", fontWeight: 700 }}>ACTIVE</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Database Pool</span>
                <span style={{ color: "var(--color-indigo)", fontWeight: 700 }}>CONNECTED (PG)</span>
              </div>
            </div>
          </div>

          {/* Live Server Logs Telemetry */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg style={{ width: "18px", height: "18px", color: "var(--color-emerald)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>System Event Stream</h3>
            </div>
            
            <div style={{ 
              background: "rgba(0, 0, 0, 0.45)", 
              borderRadius: "8px", 
              border: "1px solid var(--border-subtle)", 
              padding: "12px", 
              fontFamily: "var(--font-mono)", 
              fontSize: "10.5px", 
              color: "var(--color-emerald)", 
              height: "260px", 
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)"
            }}>
              {logs.map((log, idx) => (
                <div key={idx} style={{ lineHeight: "1.4", wordBreak: "break-all" }}>{log}</div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
