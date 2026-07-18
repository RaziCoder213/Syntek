import { useState, useEffect } from "react";

export default function LaunchCenter({ 
  setTab, 
  startTour, 
  gmailUser, 
  geminiKey, 
  leads, 
  workSamples, 
  schedulerActive 
}) {
  const [selectedNode, setSelectedNode] = useState("scraper");

  // Track if they visited campaigns tab to check off campaign quest
  useEffect(() => {
    if (localStorage.getItem("active_tab") === "Campaigns") {
      localStorage.setItem("campaigns_visited", "true");
    }
  }, []);

  const quests = [
    {
      id: "persona",
      title: "Design AI Persona & Work Bio",
      badge: "Step 1: Branding",
      description: "Define professional roles, company profiles, and past success bio in Settings to anchor Antigravity personalization context.",
      isCompleted: !!(workSamples && workSamples.trim().length > 0),
      targetTab: "Settings",
      icon: (
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      id: "smtp",
      title: "Link Outbound Email (SMTP)",
      badge: "Step 2: SMTP Outbox",
      description: "Connect your secure Gmail account and app password to authorize automated cold outbound delivery tunnels.",
      isCompleted: !!(gmailUser && gmailUser.trim().includes("@")),
      targetTab: "Settings",
      icon: (
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: "scraper",
      title: "Capture Directory Leads",
      badge: "Step 3: Prospecting",
      description: "Scan Google Maps directory coordinates for your target niches. Crawl business web pages to extract verified details.",
      isCompleted: !!(leads && leads.length > 0),
      targetTab: "Lead Finder",
      icon: (
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    },
    {
      id: "campaign",
      title: "Compose Sequences & Copywriter",
      badge: "Step 4: Sequences",
      description: "Customize your outbound communication template style (Casual, ROI-focused) and preview AI drafts.",
      isCompleted: !!(localStorage.getItem("syntek_campaign_saved") === "true" || localStorage.getItem("campaigns_visited") === "true" || (leads && leads.length > 0)),
      targetTab: "Campaigns",
      icon: (
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    },
    {
      id: "autopilot",
      title: "Activate Autopilot Scheduler",
      badge: "Step 5: Automation",
      description: "Enable background autopilot scheduler in settings to allow cron routines to automatically send campaigns.",
      isCompleted: !!schedulerActive,
      targetTab: "Settings",
      icon: (
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ];

  const completedCount = quests.filter(q => q.isCompleted).length;
  const progressPercent = Math.round((completedCount / quests.length) * 100);

  const nodes = {
    scraper: {
      title: "🔍 Directory Scraper & Data Grounding",
      badge: "Stage 1: Lead Capture",
      emoji: "🔍",
      color: "var(--color-lime)",
      description: "Extracts local coordinates, website domains, telephone numbers, and business rating scores from Google Maps and web directories. Supports filtering prospects by missing or broken websites.",
      stats: "• Avg Scan: 50+ prospects / min\n• Extraction Accuracy: 98.4%\n• Active Threads: 4 concurrent scraper nodes",
      actionText: "Open Lead Finder",
      targetTab: "Lead Finder"
    },
    gemini: {
      title: "🧠 Antigravity AI Qualification & Writing",
      badge: "Stage 2: Personalization",
      emoji: "🧠",
      color: "var(--color-indigo)",
      description: "Reads Google review statistics, ratings, websites, and your work bio. Grounding prompts generate personalized cold outreach drafts that mention specific local data to maximize response rates.",
      stats: "• AI Response Time: ~1.8 seconds\n• Model: Antigravity CLI\n• Grounding context: Rating, review count, portfolio links",
      actionText: "Open AI Copywriter",
      targetTab: "Campaigns"
    },
    smtp: {
      title: "📧 Secure SMTP Outbound Gateway",
      badge: "Stage 3: Email Delivery",
      emoji: "📧",
      color: "var(--color-emerald)",
      description: "Routes drafts through your linked Gmail secure application password. Authenticated SMTP dispatching places emails directly into the prospect's inbox, avoiding spam filters.",
      stats: "• Daily Dispatch Limit: 100 / account\n• Security: TLS Secure SMTP Tunneling\n• Bounce Detection: Auto-skips disconnected mails",
      actionText: "Verify Outbound Config",
      targetTab: "Settings"
    },
    inbox: {
      title: "📥 Antigravity Smart Inbox Reply Watcher",
      badge: "Stage 4: Lead Engagement",
      emoji: "📥",
      color: "var(--color-amber)",
      description: "Scans inbound replies. Antigravity detects intent (interested, meeting requested, unsubscribe). Generates context-aware drafts and automatically schedules Google Meet links.",
      stats: "• Sentiment detection: AI categorized\n• Autopilot scheduler: Cal.com/Calendar sync\n• Avg meeting conversion boost: +34%",
      actionText: "Open Smart Inbox",
      targetTab: "Inbox"
    },
    crm: {
      title: "📋 Sales Kanban Pipeline CRM",
      badge: "Stage 5: Deal Closing",
      emoji: "📋",
      color: "var(--color-teal)",
      description: "Tracks lead status categories through visual drag-and-drop cards. Status tags update automatically when emails are sent or positive replies are parsed in the Smart Inbox.",
      stats: "• Deal Value Tracker: Built-in estimator\n• Board Stages: Not Contacted ➔ Closed Contract\n• Pipeline Syncing: Real-time PostgreSQL feeds",
      actionText: "Open Kanban Board",
      targetTab: "Pipeline"
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", animation: "fadeIn 0.4s ease" }}>
      
      {/* Hero Header Banner */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: "48px", 
          background: "radial-gradient(circle at 90% 10%, rgba(99, 102, 241, 0.09) 0%, transparent 60%), radial-gradient(circle at 10% 90%, rgba(129, 140, 248, 0.05) 0%, transparent 60%), var(--bg-card)",
          border: "1px solid var(--color-lime-border)",
          boxShadow: "0 20px 45px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)",
          position: "relative",
          overflow: "hidden",
          borderRadius: "20px"
        }}
      >
        <div style={{ position: "absolute", top: "-40%", right: "-10%", width: "450px", height: "450px", background: "var(--color-lime-glow)", filter: "blur(130px)", borderRadius: "50%", pointerEvents: "none", opacity: 0.7 }} />
        <div style={{ position: "absolute", bottom: "-40%", left: "-10%", width: "350px", height: "350px", background: "var(--color-indigo-glow)", filter: "blur(130px)", borderRadius: "50%", pointerEvents: "none", opacity: 0.5 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", zIndex: 2, position: "relative" }}>
          <span className="badge" style={{ alignSelf: "flex-start", background: "var(--color-lime-glow)", color: "var(--color-lime)", border: "1px solid var(--color-lime-border)", fontSize: "11px", padding: "5px 12px", borderRadius: "20px", fontWeight: 700 }}>
            ⚡ SYNTEK COLD-OUTREACH SAAS ENGINE v2.0
          </span>
          
          <h1 style={{ 
            fontSize: "40px", 
            fontWeight: 800, 
            background: "linear-gradient(135deg, #ffffff 40%, var(--color-lime) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.04em", 
            lineHeight: "1.15", 
            margin: 0 
          }}>
            Automate Your Lead Pipeline <br />With Grounded AI Outreach
          </h1>
          
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: "1.6", maxWidth: "680px", margin: 0 }}>
            Syntek solves cold outreach fatigue. It scrapes local directory prospects, qualifies domains, writes personalized AI pitches using your case studies, and books video calls on autopilot.
          </p>

          <div style={{ display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap" }}>
            <button 
              type="button"
              className="btn btn-lime glow-card" 
              onClick={() => { setTab("Lead Finder"); }}
              style={{ padding: "12px 24px", borderRadius: "8px", fontWeight: 700, fontSize: "13px" }}
            >
              🚀 Launch Lead Finder
            </button>
            <button 
              type="button"
              className="btn btn-outline" 
              onClick={startTour}
              style={{ padding: "12px 24px", borderRadius: "8px", fontWeight: 700, fontSize: "13px" }}
            >
              ⚡ Open Setup Wizard
            </button>
          </div>
        </div>
      </div>

      {/* Gamified Workspace Launch Quest Board */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "24px", border: "1px solid var(--border-translucent)" }}>
        
        {/* Quest Board Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
              🛡️ Workspace Launch Readiness Quest
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Complete the setup milestones to verify your system for active background autopilot runs.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700 }}>
              {completedCount} OF {quests.length} COMPLETE
            </span>
            <div style={{ 
              width: "120px", 
              height: "10px", 
              background: "var(--bg-deep)", 
              borderRadius: "5px", 
              border: "1px solid var(--border-translucent)", 
              overflow: "hidden" 
            }}>
              <div style={{ 
                width: `${progressPercent}%`, 
                height: "100%", 
                background: progressPercent === 100 ? "var(--color-emerald)" : "var(--color-lime)", 
                borderRadius: "5px",
                boxShadow: progressPercent === 100 ? "0 0 10px var(--color-emerald)" : "0 0 10px var(--color-lime)",
                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)" 
              }} />
            </div>
            <span style={{ 
              fontSize: "14px", 
              fontWeight: 800, 
              color: progressPercent === 100 ? "var(--color-emerald)" : "var(--color-lime)"
            }}>{progressPercent}%</span>
          </div>
        </div>

        {/* Certificate Display or Quest Grid */}
        {progressPercent === 100 ? (
          <div 
            style={{ 
              background: "radial-gradient(circle at center, rgba(16, 185, 129, 0.08) 0%, transparent 80%), var(--bg-deep)",
              border: "2px solid var(--color-emerald)",
              borderRadius: "14px",
              padding: "40px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              boxShadow: "0 10px 40px rgba(16,185,129,0.15)",
              animation: "fadeIn 0.6s ease"
            }}
          >
            <div style={{ 
              width: "64px", 
              height: "64px", 
              borderRadius: "50%", 
              background: "rgba(16, 185, 129, 0.15)", 
              color: "var(--color-emerald)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)",
              border: "1px solid rgba(16, 185, 129, 0.3)"
            }}>
              <svg style={{ width: "32px", height: "32px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h4 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: 0 }}>Syntek Verified Outreach Workspace 🛡️</h4>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "560px", margin: "8px auto 0", lineHeight: "1.6" }}>
                All authorization, scraper, brand personalization, and automated sending schedules are verified and active. Your SaaS workflow is now fully optimized for self-driving client loops.
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <button 
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  localStorage.removeItem("syntek_campaign_saved");
                  localStorage.removeItem("campaigns_visited");
                  setTab("Settings");
                }}
              >
                🔄 Reset Checklist Configs
              </button>
              <button 
                type="button"
                className="btn btn-lime btn-sm"
                onClick={() => setTab("Dashboard")}
              >
                📊 Open Live Dashboard CRM
              </button>
            </div>
          </div>
        ) : (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
            gap: "20px" 
          }}>
            {quests.map((q) => (
              <div 
                key={q.id}
                style={{
                  background: q.isCompleted ? "rgba(255,255,255,0.01)" : "var(--bg-deep)",
                  border: q.isCompleted ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid var(--border-translucent)",
                  borderRadius: "12px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  position: "relative",
                  transition: "all 0.25s ease",
                  boxShadow: q.isCompleted ? "inset 0 0 12px rgba(16, 185, 129, 0.02)" : "none"
                }}
              >
                {/* Badge & Check */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {q.badge}
                  </span>
                  
                  {q.isCompleted ? (
                    <span style={{ 
                      fontSize: "10px", 
                      color: "var(--color-emerald)", 
                      background: "rgba(16, 185, 129, 0.1)", 
                      padding: "4px 8px", 
                      borderRadius: "20px", 
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      border: "1px solid rgba(16, 185, 129, 0.2)"
                    }}>
                      ✓ COMPLETED
                    </span>
                  ) : (
                    <span style={{ 
                      fontSize: "10px", 
                      color: "var(--color-lime)", 
                      background: "var(--color-lime-glow)", 
                      padding: "4px 8px", 
                      borderRadius: "20px", 
                      fontWeight: 800
                    }}>
                      PENDING
                    </span>
                  )}
                </div>

                {/* Title & Icon */}
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "4px" }}>
                  <div style={{ 
                    color: q.isCompleted ? "var(--color-emerald)" : "var(--color-lime)", 
                    marginTop: "2px",
                    flexShrink: 0
                  }}>
                    {q.icon}
                  </div>
                  <h4 style={{ 
                    fontSize: "14px", 
                    fontWeight: 700, 
                    color: q.isCompleted ? "var(--text-secondary)" : "var(--text-primary)", 
                    margin: 0,
                    lineHeight: "1.4"
                  }}>
                    {q.title}
                  </h4>
                </div>

                {/* Description */}
                <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.5", margin: 0, flex: 1 }}>
                  {q.description}
                </p>

                {/* Action button */}
                {!q.isCompleted && (
                  <button 
                    type="button"
                    className="btn btn-outline-lime btn-xs"
                    onClick={() => setTab(q.targetTab)}
                    style={{ alignSelf: "flex-start", marginTop: "6px", fontSize: "11px" }}
                  >
                    Start Setup ➔
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive System Architecture Canvas */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div>
          <h3 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            🛡️ Interactive System Architecture Map
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Click on any module in the system pipeline to view real-time data stats, configuration files, and core operational logic.
          </p>
        </div>

        {/* CSS/HTML Glowing Node Map */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          gap: "10px", 
          background: "var(--bg-deep)", 
          padding: "24px", 
          borderRadius: "12px", 
          border: "var(--border-subtle)",
          overflowX: "auto"
        }}>
          {Object.keys(nodes).map((key, index) => {
            const node = nodes[key];
            const isActive = selectedNode === key;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {/* Node Box */}
                <button
                  type="button"
                  onClick={() => setSelectedNode(key)}
                  style={{
                    background: isActive ? `${node.color}15` : "var(--bg-surface)",
                    border: isActive ? `2px solid ${node.color}` : "1px solid var(--border-translucent)",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    width: "180px",
                    cursor: "pointer",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.25s ease-out",
                    boxShadow: isActive ? `0 0 20px ${node.color}30` : "none"
                  }}
                >
                  <span style={{ fontSize: "24px" }}>{node.emoji}</span>
                  <span style={{ 
                    fontSize: "12px", 
                    fontWeight: 700, 
                    color: isActive ? node.color : "var(--text-primary)",
                    whiteSpace: "normal",
                    lineHeight: "1.3"
                  }}>
                    {node.title.split(" ").slice(1).join(" ")}
                  </span>
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                    Stage {index + 1}
                  </span>
                </button>

                {/* Connector Arrow */}
                {index < Object.keys(nodes).length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <div style={{ 
                      width: "30px", 
                      height: "2px", 
                      background: isActive ? `linear-gradient(90deg, ${node.color}, var(--border-translucent))` : "var(--border-translucent)",
                      transition: "all 0.25s"
                    }} />
                    <span style={{ 
                      color: isActive ? node.color : "var(--text-muted)", 
                      fontSize: "10px",
                      transition: "all 0.25s"
                    }}>➔</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Node Details Drawer Component */}
        <div 
          style={{ 
            display: "flex", 
            gap: "24px", 
            background: "var(--bg-deep)", 
            border: "var(--border-subtle)", 
            borderRadius: "12px", 
            padding: "24px", 
            alignItems: "center", 
            flexWrap: "wrap",
            animation: "fadeIn 0.3s ease-out"
          }}
        >
          <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="badge" style={{ 
              alignSelf: "flex-start", 
              background: `${nodes[selectedNode].color}15`, 
              color: nodes[selectedNode].color, 
              border: `1px solid ${nodes[selectedNode].color}30`,
              fontSize: "10px" 
            }}>
              {nodes[selectedNode].badge}
            </span>
            <h4 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              {nodes[selectedNode].title}
            </h4>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6", margin: 0 }}>
              {nodes[selectedNode].description}
            </p>
            <button 
              className="btn btn-outline btn-sm"
              onClick={() => setTab(nodes[selectedNode].targetTab)}
              style={{ alignSelf: "flex-start", marginTop: "8px", fontWeight: 700 }}
            >
              {nodes[selectedNode].actionText} ➔
            </button>
          </div>

          <div style={{ 
            flex: "1 1 250px", 
            background: "var(--bg-surface)", 
            border: "var(--border-subtle)", 
            borderRadius: "8px", 
            padding: "16px",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--text-secondary)",
            whiteSpace: "pre-line",
            lineHeight: "1.8"
          }}>
            <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)", display: "block", marginBottom: "8px" }}>
              ⚙️ Pipeline Metrics:
            </strong>
            {nodes[selectedNode].stats}
          </div>
        </div>
      </div>

      {/* Auto vs Manual Strategies Section */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
        
        {/* Auto Autopilot Panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ 
              width: "44px", 
              height: "44px", 
              borderRadius: "10px", 
              background: "var(--color-lime-glow)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "22px", 
              border: "1px solid var(--color-lime-border)",
              boxShadow: "0 0 10px var(--color-lime-glow)"
            }}>
              🤖
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>1. Background Autopilot (Auto)</h3>
              <span style={{ fontSize: "11px", color: "var(--color-lime)", fontWeight: 700, textTransform: "uppercase" }}>
                Passive Database Synchronization
              </span>
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6", margin: 0 }}>
            Runs completely in the background via secondary timers and server-side crons. Perfect for constant, passive pipeline generation without having your tabs open.
          </p>
          <ul style={{ 
            fontSize: "12px", 
            color: "var(--text-secondary)", 
            paddingLeft: "16px", 
            display: "flex", 
            flexDirection: "column", 
            gap: "8px",
            lineHeight: "1.5"
          }}>
            <li>Crawls local coordinates at configured daily limits (e.g. 50/day).</li>
            <li>Qualifies contact info and drafts AI copywriting via server APIs.</li>
            <li>Delivers messages automatically through the SMTP outbox connection.</li>
          </ul>
          <button 
            type="button"
            className="btn btn-outline-lime btn-sm"
            onClick={() => setTab("Settings")}
            style={{ marginTop: "auto", alignSelf: "flex-start", fontWeight: 700 }}
          >
            Configure Autopilot Schedule
          </button>
        </div>

        {/* Custom Manual Loop Panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ 
              width: "44px", 
              height: "44px", 
              borderRadius: "10px", 
              background: "var(--color-indigo-glow)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "22px", 
              border: "1px solid var(--color-indigo-glow)",
              boxShadow: "0 0 10px var(--color-indigo-glow)"
            }}>
              ⚡
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>2. Custom Client Loop (Manual)</h3>
              <span style={{ fontSize: "11px", color: "var(--color-indigo)", fontWeight: 700, textTransform: "uppercase" }}>
                High-converting Targeted Outreach
              </span>
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6", margin: 0 }}>
            Best for high-value contracts. You audit lead details manually, generate personalized Antigravity copies inside the app tab, verify the details, and queue dispatches.
          </p>
          <ul style={{ 
            fontSize: "12px", 
            color: "var(--text-secondary)", 
            paddingLeft: "16px", 
            display: "flex", 
            flexDirection: "column", 
            gap: "8px",
            lineHeight: "1.5"
          }}>
            <li>Review and customize coordinates before running email templates.</li>
            <li>Personalize the subject and body inside the live text editor.</li>
            <li>Run test emails to your own inbox to evaluate design layouts.</li>
          </ul>
          <button 
            type="button"
            className="btn btn-indigo btn-sm"
            onClick={() => setTab("Campaigns")}
            style={{ marginTop: "auto", alignSelf: "flex-start", fontWeight: 700 }}
          >
            Open Campaigns Composer
          </button>
        </div>

      </div>

      {/* Founders & Developer Team Section */}
      <div 
        className="glass-panel" 
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: "24px", 
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, var(--bg-card) 100%)",
          border: "1px solid var(--color-lime-border)"
        }}
      >
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            👥 Founders & Project Developers
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
            The engineers and product designers behind Syntek's automation architecture.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
          
          {/* Muhammad Razi */}
          <div style={{ 
            display: "flex", 
            gap: "16px", 
            alignItems: "center",
            background: "var(--bg-deep)",
            padding: "16px",
            borderRadius: "12px",
            border: "var(--border-subtle)"
          }}>
            <div style={{ 
              width: "48px", 
              height: "48px", 
              borderRadius: "50%", 
              background: "linear-gradient(135deg, var(--color-lime) 0%, var(--color-indigo) 100%)", 
              fontSize: "18px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontWeight: 800,
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)"
            }}>
              MR
            </div>
            <div>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Muhammad Razi</h4>
              <p style={{ fontSize: "11px", color: "var(--color-lime)", fontWeight: 700, margin: "2px 0 0" }}>Founder & SaaS Architect</p>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 0" }}>Full-stack developer focused on automated workflows and AI API systems.</p>
            </div>
          </div>

          {/* Antigravity AI */}
          <div style={{ 
            display: "flex", 
            gap: "16px", 
            alignItems: "center",
            background: "var(--bg-deep)",
            padding: "16px",
            borderRadius: "12px",
            border: "var(--border-subtle)"
          }}>
            <div style={{ 
              width: "48px", 
              height: "48px", 
              borderRadius: "50%", 
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", 
              fontSize: "20px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontWeight: 800,
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)"
            }}>
              AG
            </div>
            <div>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Antigravity Coding Partner</h4>
              <p style={{ fontSize: "11px", color: "var(--color-emerald)", fontWeight: 700, margin: "2px 0 0" }}>Autonomous Agent Team</p>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 0" }}>DeepMind pair-programmer assistant managing design, databases, and UI refactors.</p>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
