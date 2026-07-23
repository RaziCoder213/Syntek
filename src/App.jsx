import { useState, useEffect, useRef, useCallback } from "react";
import Auth from "./components/Auth";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import LeadFinder from "./components/LeadFinder";
import Pipeline from "./components/Pipeline";
import Automation from "./components/Automation";
import Settings from "./components/Settings";
import Inbox from "./components/Inbox";
import Copilot from "./components/Copilot";

/* ─── Global fetch interceptor: inject auth headers ─── */
const _origFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const userId = localStorage.getItem("x-user-id");
  const token  = localStorage.getItem("auth_token");
  const rel    = typeof url === "string" ? url : url?.href || "";
  const path   = rel.replace(window.location.origin, "");
  if (userId && (path.startsWith("/api/") || rel.startsWith("/api/"))) {
    if (!options.headers) options.headers = {};
    options.headers = { ...options.headers, "x-user-id": userId };
    if (token) options.headers["Authorization"] = `Bearer ${token}`;
  }
  return _origFetch(url, options).then(r => {
    if (r.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("x-user-id");
      localStorage.removeItem("current_user");
      window.dispatchEvent(new Event("syntek-unauthorized"));
    }
    return r;
  });
};

/* ─── Navigation config ─── */
const NAV = [
  { id: "Dashboard",   icon: "⬡",  label: "Dashboard" },
  { id: "Leads",       icon: "◎",  label: "Lead Finder" },
  { id: "Pipeline",    icon: "▦",  label: "Pipeline",   badge: null },
  { id: "Inbox",       icon: "✉",  label: "Inbox",      badge: null },
  { id: "Automation",  icon: "⚡", label: "Automation" },
  { id: "Settings",    icon: "⚙",  label: "Settings" },
];

export default function App() {
  /* ─── Session ─── */
  const [currentUser, setCurrentUser]       = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [appReady, setAppReady]             = useState(false);

  /* ─── Navigation ─── */
  const [tab, setTab]                           = useState(() => localStorage.getItem("active_tab") || "Dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /* ─── Toast notifications ─── */
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  /* ─── Core data state ─── */
  const [leads, setLeads]   = useState([]);
  const [emails, setEmails] = useState([]);
  const [analytics, setAnalytics] = useState({
    emailsSent: 0, openRate: 0, replyRate: 0,
    interested: 0, revenue: 0, totalLeads: 0,
    weeklyLeads: [0,0,0,0,0,0,0], opensByDay: [0,0,0,0,0,0,0],
  });

  /* ─── Campaign settings ─── */
  const [settings, setSettings] = useState({
    gmailUser: "", gmailPass: "", geminiKey: "",
    senderName: "", senderRole: "", companyName: "",
    useCompanyBranding: false, outreachStyle: "casual",
    pitchOffer: "whatsapp_bot", customOfferDetails: "",
    niche: "Cafes & Brunch", location: "Austin, TX",
    senderLocation: "",
    dailyLeadLimit: 8, requiredContact: "email_or_phone",
    isActive: false, scheduleType: "custom",
    senderType: "developer", aboutText: "",
    portfolioUrl: "", socialLinkedin: "", socialGithub: "",
    socialTwitter: "", logoUrl: "", bannerUrl: "",
    profileIconUrl: "", workSamples: "",
    autopilotMode: "both", searchMode: "deepsearch",
    reviewBeforeSend: true,
    reResearchEnabled: true,
    kanbanStages: ["New", "Researched", "Drafted", "Contacted", "Opened", "Replied", "Won", "Archived"],
  });

  /* ─── Ref mirrors for async callbacks ─── */
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const leadsRef = useRef(leads);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  /* ─── Notifications state & handlers ─── */
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const d = await res.json();
        setNotifications(d);
      }
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [currentUser, fetchNotifications]);

  const markAllNotifRead = async () => {
    try {
      const res = await fetch("/api/notifications/mark-read", { method: "PUT" });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        showToast("All notifications marked as read", "success");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markNotifRead = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearAllNotifs = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "DELETE" });
      if (res.ok) {
        setNotifications([]);
        showToast("Notifications cleared", "info");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotifClick = (notif) => {
    markNotifRead(notif.id);
    setShowNotifDropdown(false);
    if (notif.link) {
      setTab(notif.link);
    }
  };

  /* ─── Unauthorized handler ─── */
  useEffect(() => {
    const h = () => { setCurrentUser(null); showToast("Session expired. Please log in again.", "danger"); };
    window.addEventListener("syntek-unauthorized", h);
    return () => window.removeEventListener("syntek-unauthorized", h);
  }, [showToast]);

  /* ─── Restore session on mount ─── */
  useEffect(() => {
    const saved = localStorage.getItem("current_user");
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch { localStorage.removeItem("current_user"); }
    }
    setAppReady(true);
  }, []);

  /* ─── Persist active tab ─── */
  useEffect(() => { localStorage.setItem("active_tab", tab); }, [tab]);

  /* ─── Load settings from server ─── */
  useEffect(() => {
    if (!currentUser) return;
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const c = await res.json();
        setSettings(prev => ({
          ...prev,
          gmailUser:          c.gmail_user        || prev.gmailUser,
          gmailPass:          c.gmail_pass        || prev.gmailPass,
          geminiKey:          c.gemini_key        || prev.geminiKey,
          senderName:         c.sender_name       || prev.senderName,
          senderRole:         c.sender_role       || prev.senderRole,
          companyName:        c.company_name      || prev.companyName,
          useCompanyBranding: c.use_company_branding ?? prev.useCompanyBranding,
          outreachStyle:      c.outreach_style    || prev.outreachStyle,
          pitchOffer:         c.pitch_offer       || prev.pitchOffer,
          customOfferDetails: c.custom_offer_details || prev.customOfferDetails,
          niche:              c.niche             || prev.niche,
          location:           c.location          || prev.location,
          dailyLeadLimit:     c.daily_lead_limit  ?? prev.dailyLeadLimit,
          requiredContact:    c.required_contact  || prev.requiredContact,
          isActive:           c.is_active         ?? prev.isActive,
          scheduleType:       c.schedule_type     || prev.scheduleType,
          senderType:         c.sender_type       || prev.senderType,
          aboutText:          c.about_text        || prev.aboutText,
          portfolioUrl:       c.portfolio_url     || prev.portfolioUrl,
          socialLinkedin:     c.social_linkedin   || prev.socialLinkedin,
          socialGithub:       c.social_github     || prev.socialGithub,
          socialTwitter:      c.social_twitter    || prev.socialTwitter,
          workSamples:        c.work_samples      || prev.workSamples,
          senderLocation:     c.sender_location   || prev.senderLocation,
          searchMode:         c.search_mode       || prev.searchMode,
          autopilotMode:      c.autopilot_mode    || prev.autopilotMode,
          kanbanStages:       c.kanbanStages      || prev.kanbanStages,
          reResearchEnabled:  c.re_research_enabled ?? prev.reResearchEnabled,
        }));
        // Show onboarding if no Gmail configured yet
        if (!c.gmail_user && !localStorage.getItem("syntek_onboarded")) {
          setShowOnboarding(true);
        }
      } catch (e) {
        console.error("Settings fetch failed:", e);
      }
    }
    fetchSettings();
  }, [currentUser]);

  /* ─── Load leads, emails, analytics ─── */
  const loadData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [leadsRes, emailsRes, analyticsRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/emails"),
        fetch("/api/analytics"),
      ]);
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setLeads(d.map(l => ({ ...l, rating: l.rating ? parseFloat(l.rating) : 4.0, reviews: l.reviews ? parseInt(l.reviews) : 0 })));
      }
      if (emailsRes.ok) {
        const d = await emailsRes.json();
        const rows = Array.isArray(d) ? d : (d.emails || []);
        setEmails(rows.map(e => ({
          // original DB fields (used by new Inbox.jsx)
          id: e.id,
          from_name:     e.from_name,
          from_email:    e.from_email,
          company:       e.company,
          subject:       e.subject,
          preview:       e.preview,
          time_received: e.time_received,
          is_read:       e.is_read,
          category:      e.category,
          labels:        e.labels || [],
          lead_is_opened: e.lead_is_opened,
          // legacy aliases (kept for any other components)
          from:  e.from_name,
          email: e.from_email,
          time:  e.time_received,
          read:  e.is_read,
        })));
      }
      if (analyticsRes.ok) {
        const d = await analyticsRes.json();
        setAnalytics(d);
      }
    } catch (e) { console.error("Data load failed:", e); }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    loadData();
    const iv = setInterval(loadData, 5000);
    return () => clearInterval(iv);
  }, [currentUser, loadData]);


  /* ─── Handlers ─── */
  function handleLogin(user) {
    setCurrentUser(user);
    localStorage.setItem("current_user", JSON.stringify(user));
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem("current_user");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("x-user-id");
    localStorage.removeItem("syntek_scrape_config");
    showToast("Logged out.", "info");
  }

  async function handleSaveSettings(updates) {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmail_user: updates.gmailUser ?? settings.gmailUser,
          gmail_pass: updates.gmailPass ?? settings.gmailPass,
          gemini_key: updates.geminiKey ?? settings.geminiKey,
          sender_name: updates.senderName ?? settings.senderName,
          sender_role: updates.senderRole ?? settings.senderRole,
          company_name: updates.companyName ?? settings.companyName,
          use_company_branding: updates.useCompanyBranding ?? settings.useCompanyBranding,
          outreach_style: updates.outreachStyle ?? settings.outreachStyle,
          pitch_offer: updates.pitchOffer ?? settings.pitchOffer,
          custom_offer_details: updates.customOfferDetails ?? settings.customOfferDetails,
          niche: updates.niche ?? settings.niche,
          location: updates.location ?? settings.location,
          daily_lead_limit: updates.dailyLeadLimit ?? settings.dailyLeadLimit,
          required_contact: updates.requiredContact ?? settings.requiredContact,
          is_active: updates.isActive ?? settings.isActive,
          schedule_type: updates.scheduleType ?? settings.scheduleType,
          sender_type: updates.senderType ?? settings.senderType,
          about_text: updates.aboutText ?? settings.aboutText,
          portfolio_url: updates.portfolioUrl ?? settings.portfolioUrl,
          social_linkedin: updates.socialLinkedin ?? settings.socialLinkedin,
          social_github: updates.socialGithub ?? settings.socialGithub,
          social_twitter: updates.socialTwitter ?? settings.socialTwitter,
          work_samples: updates.workSamples ?? settings.workSamples,
          sender_location: updates.senderLocation ?? settings.senderLocation,
          search_mode: updates.searchMode ?? settings.searchMode,
          autopilot_mode: updates.autopilotMode ?? settings.autopilotMode,
          kanban_stages: updates.kanbanStages ?? settings.kanbanStages,
          re_research_enabled: updates.reResearchEnabled ?? settings.reResearchEnabled,
        }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...updates }));
        showToast("Settings saved.", "success");
      } else {
        showToast("Failed to save settings.", "danger");
      }
    } catch (e) {
      showToast("Network error saving settings.", "danger");
    }
  }

  /* ─── Auth guard ─── */
  if (!appReady) return null;
  if (!currentUser) return <Auth onLogin={handleLogin} />;
  if (showOnboarding) {
    return (
      <Onboarding
        settings={settings}
        onComplete={(updates) => {
          handleSaveSettings(updates);
          localStorage.setItem("syntek_onboarded", "1");
          setShowOnboarding(false);
          setTab("Dashboard");
          showToast("Welcome to Syntek! 🎉", "success");
        }}
        onSkip={() => {
          localStorage.setItem("syntek_onboarded", "1");
          setShowOnboarding(false);
        }}
      />
    );
  }

  /* ─── Unread inbox count for badge ─── */
  const unreadCount = emails.filter(e => !e.read && e.category !== 'draft' && !(e.labels && e.labels.includes('pending_reply'))).length;
  const notContactedCount = leads.filter(l => l.status === "not contacted").length;

  const initials = (currentUser.company_name || currentUser.email || "U")
    .substring(0, 2).toUpperCase();

  /* ─── Toast icons ─── */
  const toastIcon = { success: "✓", danger: "✕", info: "ℹ", warning: "⚠" };

  /* ─── Page titles ─── */
  const pageTitle = {
    Dashboard:  "Dashboard",
    Leads:      "Lead Finder",
    Pipeline:   "Pipeline",
    Inbox:      "Inbox",
    Automation: "Automation",
    Settings:   "Settings",
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">S</div>
          <span className="sidebar-logo-text">Syntek</span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(n => {
            const badge = n.id === "Inbox" ? unreadCount : n.id === "Leads" ? null : null;
            return (
              <div
                key={n.id}
                className={`nav-item ${tab === n.id ? "active" : ""}`}
                onClick={() => setTab(n.id)}
                title={sidebarCollapsed ? n.label : undefined}
              >
                <span className="nav-item-icon">{n.icon}</span>
                <span className="nav-item-label">{n.label}</span>
                {badge > 0 && <span className="nav-item-badge">{badge}</span>}
              </div>
            );
          })}
        </nav>

        {/* User widget */}
        <div className="sidebar-bottom">
          <div className="user-widget" onClick={handleLogout} title="Click to sign out">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name truncate" style={{ maxWidth: 120 }}>
                {currentUser.company_name || currentUser.email}
              </div>
              <div className="user-tier">Agency Plan</div>
            </div>
          </div>
          <button
            className="collapse-btn"
            style={{ marginTop: 4, width: "100%" }}
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <span className="topbar-title">{pageTitle[tab] || tab}</span>
          <div className="topbar-actions">
            {/* Automation status pill */}
            {settings.isActive && (
              <div className="flex items-center gap-4" style={{ marginRight: 4 }}>
                <span className="status-dot green pulse" />
                <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>Autopilot On</span>
              </div>
            )}
            {/* Quick Gmail status */}
            <div
              className="badge"
              style={{ cursor: "pointer" }}
              onClick={() => setTab("Settings")}
              title="Gmail connection status"
            >
              <span className={`status-dot ${settings.gmailUser ? "green" : "red"}`} />
              <span style={{ marginLeft: 4, fontSize: 11 }}>
                {settings.gmailUser ? settings.gmailUser : "Connect Gmail"}
              </span>
            </div>

            {/* Notification Bell */}
            <div style={{ position: "relative" }}>
              <button 
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                style={{ 
                  background: "transparent", 
                  border: "none", 
                  fontSize: "16px", 
                  cursor: "pointer", 
                  padding: "6px 10px", 
                  display: "flex", 
                  alignItems: "center", 
                  position: "relative",
                  color: "var(--text-1)",
                  borderRadius: "6px",
                  transition: "background 0.2s"
                }}
                className="hover-bg-light"
                title="Notifications"
              >
                🔔
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{ 
                    position: "absolute", 
                    top: "-2px", 
                    right: "0px", 
                    background: "var(--danger)", 
                    color: "white", 
                    borderRadius: "50%", 
                    padding: "1px 5px", 
                    fontSize: "9px", 
                    fontWeight: "bold",
                    lineHeight: "1"
                  }}>
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <>
                  <div 
                    onClick={() => setShowNotifDropdown(false)}
                    style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                  />
                  <div style={{ 
                    position: "absolute", 
                    top: "35px", 
                    right: "0", 
                    width: "320px", 
                    background: "rgba(28, 28, 40, 0.95)", 
                    border: "1px solid rgba(255, 255, 255, 0.08)", 
                    borderRadius: "12px", 
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)", 
                    zIndex: 999, 
                    overflow: "hidden",
                    backdropFilter: "blur(12px)",
                    fontFamily: "inherit"
                  }}>
                    {/* Header */}
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "12px 16px", 
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      background: "rgba(255, 255, 255, 0.02)"
                    }}>
                      <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-1)" }}>Notifications</span>
                      <div style={{ display: "flex", gap: "10px" }}>
                        {notifications.length > 0 && (
                          <>
                            <button 
                              onClick={markAllNotifRead}
                              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "10.5px", cursor: "pointer", padding: 0 }}
                            >
                              Mark all read
                            </button>
                            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "10px" }}>|</span>
                            <button 
                              onClick={clearAllNotifs}
                              style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "10.5px", cursor: "pointer", padding: 0 }}
                            >
                              Clear all
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Scrollable list */}
                    <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            style={{ 
                              padding: "12px 16px", 
                              borderBottom: "1px solid rgba(255, 255, 255, 0.04)", 
                              cursor: "pointer",
                              display: "flex",
                              gap: "10px",
                              background: n.is_read ? "transparent" : "rgba(108, 92, 231, 0.08)",
                              transition: "background 0.2s"
                            }}
                            className="notif-item"
                          >
                            {/* Icon block */}
                            <div style={{ fontSize: "16px", marginTop: "2px" }}>
                              {n.type === 'reply' ? '💬' : n.type === 'reminder' ? '⏰' : n.type === 'campaign' ? '🚀' : '⚙️'}
                            </div>

                            {/* Info block */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "baseline",
                                marginBottom: "2px"
                              }}>
                                <span style={{ 
                                  fontWeight: n.is_read ? 500 : 600, 
                                  fontSize: "12px", 
                                  color: "var(--text-1)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}>
                                  {n.title}
                                </span>
                                <span style={{ fontSize: "9px", color: "var(--text-3)" }}>
                                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div style={{ 
                                fontSize: "11px", 
                                color: "var(--text-2)",
                                lineHeight: "1.4",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden"
                              }}>
                                {n.message}
                              </div>
                            </div>

                            {/* Action block */}
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <button 
                                onClick={(e) => deleteNotif(e, n.id)}
                                style={{ 
                                  background: "none", 
                                  border: "none", 
                                  color: "var(--text-3)", 
                                  fontSize: "12px", 
                                  cursor: "pointer",
                                  padding: "4px"
                                }}
                                title="Delete"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          {tab === "Dashboard" && (
            <Dashboard
              leads={leads}
              analytics={analytics}
              settings={settings}
              onNavigate={setTab}
            />
          )}
          {tab === "Leads" && (
            <LeadFinder
              leads={leads}
              setLeads={setLeads}
              settings={settings}
              showToast={showToast}
              onNavigate={setTab}
            />
          )}
          {tab === "Pipeline" && (
            <Pipeline
              leads={leads}
              setLeads={setLeads}
              settings={settings}
              showToast={showToast}
            />
          )}
          {tab === "Inbox" && (
            <Inbox
              emails={emails}
              setEmails={setEmails}
              settings={settings}
              showToast={showToast}
              refreshData={loadData}
            />
          )}
          {tab === "Automation" && (
            <Automation
              settings={settings}
              onSave={handleSaveSettings}
              showToast={showToast}
              refreshData={loadData}
            />
          )}
          {tab === "Settings" && (
            <Settings
              settings={settings}
              onSave={handleSaveSettings}
              showToast={showToast}
              currentUser={currentUser}
            />
          )}
        </main>
      </div>

      {/* ── Toast stack ── */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{toastIcon[t.type] || "ℹ"}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ opacity: 0.6, fontSize: 14, padding: "0 4px" }}
            >✕</button>
          </div>
        ))}
      </div>

      {/* ── Global AI Co-pilot Drawer ── */}
      {currentUser && (
        <Copilot showToast={showToast} onRefreshAll={loadData} />
      )}
    </div>
  );
}
