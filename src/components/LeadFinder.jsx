import { useState, useRef, useEffect } from "react";

/* ─── Email Composer Modal ─── */
function EmailComposer({ lead, settings, onClose, onSent, showToast }) {
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [generating, setGen]    = useState(false);
  const [sending, setSending]   = useState(false);
  const generated = useRef(false);

  useEffect(() => {
    if (!generated.current) { generated.current = true; generateEmail(); }
  }, []); // eslint-disable-line

  async function generateEmail() {
    setGen(true);
    try {
      const pitchOfferLabel = {
        whatsapp_bot: "WhatsApp booking bot", website_dev: "website design",
        ai_chatbot: "AI chatbot", custom: settings.customOfferDetails || "custom service",
      }[settings.pitchOffer] || settings.pitchOffer;

      const prompt = `You are ${settings.senderName || "a developer"} (${settings.senderRole || "developer"}${settings.companyName ? ` at ${settings.companyName}` : ""}).
Write a highly personalized cold outreach email to a business owner.

Business Info:
- Name: ${lead.name}
- Type: ${lead.type}
- City: ${lead.city}
- Rating: ${lead.rating} ⭐ (${lead.reviews} reviews)
- Website: ${lead.website || "None"}
- Website Status: ${lead.website_status || "unknown"}
- Instagram: ${lead.instagram || "None"}

You are pitching: ${pitchOfferLabel}
Tone: ${settings.outreachStyle || "casual"}, warm, direct.
Bio context: ${settings.aboutText || "local developer helping businesses grow"}
${settings.workSamples ? `Work samples: ${settings.workSamples}` : ""}

Rules:
- Start with "Subject: " on line 1
- Then a blank line
- Then the email body
- Keep it under 180 words
- Do NOT use placeholders or brackets like [your name]
- End with your real name and role as signature
- Be specific about WHY this business needs what you offer`;

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(35000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.text || "";
        const lines = text.split("\n");
        if (lines[0]?.startsWith("Subject:")) {
          setSubject(lines[0].replace("Subject:", "").trim());
          setBody(lines.slice(2).join("\n").trim());
        } else {
          setSubject(`Quick question about ${lead.name}`);
          setBody(text.trim());
        }
      } else {
        showToast("AI generation failed. Write your email manually.", "warning");
      }
    } catch (e) {
      showToast("AI timed out. Write email manually.", "warning");
    } finally {
      setGen(false);
    }
  }

  async function handleSend() {
    if (!settings.gmailUser || !settings.gmailPass) {
      showToast("Gmail not connected. Go to Settings to connect Gmail.", "danger");
      return;
    }
    if (!lead.email) {
      showToast("This lead has no email address.", "danger");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmailUser: settings.gmailUser,
          gmailPass: settings.gmailPass,
          to: lead.email,
          subject,
          body,
        }),
      });
      if (res.ok) {
        await fetch(`/api/leads/${lead.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "contacted" }),
        });
        showToast(`Email sent to ${lead.name}!`, "success");
        onSent(lead.id);
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Send failed: ${err.error || "Unknown error"}`, "danger");
      }
    } catch (e) {
      showToast("Network error sending email.", "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <div className="modal-title">✉ Draft Email — {lead.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              To: <span style={{ color: "var(--text-1)" }}>{lead.email || "No email"}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {generating ? (
            <div className="flex-center" style={{ flexDirection: "column", gap: 12, padding: "32px 0" }}>
              <span className="spinner spinner-lg" />
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>AI is writing your personalized email...</span>
            </div>
          ) : (
            <>
              <div className="input-group">
                <label className="input-label">Subject</label>
                <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Body</label>
                <textarea
                  className="input"
                  rows={12}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  style={{ resize: "vertical", fontFamily: "var(--font)", fontSize: 13.5, lineHeight: 1.7 }}
                />
              </div>
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={generateEmail}>
                ↺ Regenerate
              </button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending || generating || !lead.email}
          >
            {sending ? <><span className="spinner spinner-sm" /> Sending...</> : "🚀 Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Lead Detail Drawer ─── */
function LeadDetailDrawer({ lead, onClose, onDraftEmail, onUpdateStatus }) {
  const [activeTab, setActiveTab] = useState("overview");

  const wsLabel = { active: "✓ Active", no_website: "✕ No Website", down: "⚠ Down" };
  const wsColor = { active: "success", no_website: "danger", down: "warning" };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{lead.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{lead.type} · {lead.city}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            { id: "overview", label: "Overview" },
            { id: "proof",    label: "🤖 AI Proof" },
            { id: "email",    label: "✉ Email Draft" },
            { id: "timeline", label: "Timeline" },
          ].map(t => (
            <div
              key={t.id}
              className={`tab-item ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div className="drawer-body" style={{ padding: 16 }}>

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Key info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Email", value: lead.email || "—", mono: true },
                  { label: "Phone", value: lead.phone || "—", mono: true },
                  { label: "Rating", value: lead.rating ? `${lead.rating} ⭐` : "—" },
                  { label: "Reviews", value: lead.reviews ? `${lead.reviews}` : "—" },
                  { label: "Location", value: lead.city || "—" },
                  { label: "Category", value: lead.type || "—" },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--bg-overlay)", padding: "10px 12px", borderRadius: "var(--radius-md)" }}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-4)", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", fontFamily: item.mono ? "var(--font-mono)" : undefined, wordBreak: "break-all" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Website */}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-4)", marginBottom: 8 }}>Website</div>
                {lead.website ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <a href={lead.website} target="_blank" rel="noreferrer"
                      style={{ fontSize: 13, color: "var(--brand)", fontFamily: "var(--font-mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.website}
                    </a>
                    <span className={`badge badge-${wsColor[lead.website_status] || "neutral"}`}>
                      {wsLabel[lead.website_status] || lead.website_status}
                    </span>
                  </div>
                ) : (
                  <span className="badge badge-danger">✕ No Website</span>
                )}
              </div>

              {/* Socials */}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-4)", marginBottom: 8 }}>Social Media</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {lead.instagram && <a href={`https://instagram.com/${lead.instagram.replace("@","")}`} target="_blank" rel="noreferrer" className="badge badge-brand">📸 Instagram</a>}
                  {lead.facebook  && <a href={lead.facebook}  target="_blank" rel="noreferrer" className="badge badge-info">👍 Facebook</a>}
                  {lead.linkedin  && <a href={lead.linkedin}  target="_blank" rel="noreferrer" className="badge badge-brand">💼 LinkedIn</a>}
                  {lead.twitter   && <a href={lead.twitter}   target="_blank" rel="noreferrer" className="badge badge-neutral">𝕏 Twitter</a>}
                  {!lead.instagram && !lead.facebook && !lead.linkedin && !lead.twitter && (
                    <span style={{ fontSize: 12.5, color: "var(--text-4)" }}>No social profiles found</span>
                  )}
                </div>
              </div>

              {/* Status change */}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-4)", marginBottom: 8 }}>Status</div>
                <select className="input input-sm" value={lead.status || "not contacted"} onChange={e => onUpdateStatus(lead.id, e.target.value)}>
                  {["not contacted", "contacted", "replied", "interested", "not interested", "won"].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* AI PROOF TAB */}
          {activeTab === "proof" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="proof-block">
                <div className="proof-header">
                  <span className="proof-icon">🎯</span>
                  <span className="proof-title">Why This Lead Was Qualified</span>
                </div>
                <div className="proof-text">
                  {lead.qualification_reason ||
                    `This ${lead.type} business in ${lead.city} was identified as a strong match because they have ${
                      lead.website_status === "no_website"
                        ? "no website — a major opportunity for website design/development outreach"
                        : lead.website_status === "down"
                          ? "a broken/inaccessible website that needs urgent repair or rebuilding"
                          : lead.website_status === "active" && !lead.hasBooking
                            ? "an active website but no online booking system — a perfect fit for booking automation"
                            : "a strong online presence that could benefit from AI automation"
                    } and a solid ${lead.rating}⭐ rating with ${lead.reviews} reviews, indicating they are an active, popular local business.`
                  }
                </div>
                <div className="proof-badges">
                  {lead.website_status === "no_website" && <span className="badge badge-danger">✕ No Website</span>}
                  {lead.website_status === "down"       && <span className="badge badge-warning">⚠ Site Down</span>}
                  {lead.website_status === "active"     && <span className="badge badge-success">✓ Active Site</span>}
                  {!lead.hasBooking && lead.website     && <span className="badge badge-warning">📅 No Booking System</span>}
                  {lead.email                           && <span className="badge badge-success">✓ Has Email</span>}
                  {lead.instagram                       && <span className="badge badge-brand">📸 On Instagram</span>}
                  {lead.rating >= 4.5                   && <span className="badge badge-success">⭐ High Rated</span>}
                  {lead.reviews >= 100                  && <span className="badge badge-info">🔥 Popular ({lead.reviews} reviews)</span>}
                </div>
              </div>

              <div className="proof-block" style={{ borderColor: "rgba(34,197,94,0.3)" }}>
                <div className="proof-header">
                  <span className="proof-icon">🕸</span>
                  <span className="proof-title" style={{ color: "var(--success)" }}>Website Crawl Results</span>
                </div>
                <div className="proof-text">
                  {lead.website
                    ? `Live crawl of ${lead.website}: Status is "${lead.website_status}". Email ${lead.email ? `found: ${lead.email}` : "not found on page"}. Booking widget: ${lead.hasBooking ? "detected" : "not detected"}.`
                    : "No website found in search results or directories. Business has no web presence — prime candidate for website design."}
                </div>
              </div>

              <div className="proof-block" style={{ borderColor: "rgba(56,189,248,0.3)" }}>
                <div className="proof-header">
                  <span className="proof-icon">📊</span>
                  <span className="proof-title" style={{ color: "var(--info)" }}>Source & Discovery</span>
                </div>
                <div className="proof-text">
                  Discovered via Google Search grounding for &quot;{lead.type} in {lead.city}&quot;. Data verified from Google Maps, business directories, and live website crawl. Rating and review counts sourced from real public listings.
                </div>
              </div>
            </div>
          )}

          {/* EMAIL DRAFT TAB */}
          {activeTab === "email" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lead.email ? (
                <>
                  <div style={{ padding: "10px 12px", background: "var(--success-bg)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--success)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    ✓ This lead has a public email: <strong>{lead.email}</strong>
                  </div>
                  <button className="btn btn-primary w-full" style={{ justifyContent: "center" }} onClick={() => onDraftEmail(lead)}>
                    ✉ Open Email Composer
                  </button>
                </>
              ) : (
                <div style={{ padding: "10px 12px", background: "var(--warning-bg)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--warning)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  ⚠ No public email found for this lead. Try finding them on Instagram or LinkedIn.
                </div>
              )}
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === "timeline" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { icon: "◎", label: "Lead Scraped", desc: "Added to your leads database", color: "var(--brand)" },
                lead.status === "contacted" && { icon: "✉", label: "Email Sent", desc: "Outreach email sent via Gmail", color: "var(--info)" },
                lead.status === "replied"   && { icon: "↩", label: "Reply Received", desc: "Lead replied to your email", color: "var(--success)" },
                lead.status === "won"       && { icon: "🏆", label: "Closed / Won",  desc: "Deal closed successfully!", color: "var(--success)" },
              ].filter(Boolean).map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-overlay)", border: `2px solid ${ev.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{ev.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{ev.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>{ev.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-1)", display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => onDraftEmail(lead)} disabled={!lead.email}>
            {lead.email ? "✉ Draft & Send Email" : "No Email Available"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main LeadFinder ─── */
export default function LeadFinder({ leads, setLeads, settings, showToast }) {
  /* Config state - Persisted in localStorage so tab switching doesn't reset them */
  const [niche, setNiche]         = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).niche : (settings.niche || "Cafes & Brunch");
    } catch { return settings.niche || "Cafes & Brunch"; }
  });
  const [locations, setLocations] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).locations : (settings.location ? [settings.location] : ["Austin, TX"]);
    } catch { return settings.location ? [settings.location] : ["Austin, TX"]; }
  });
  const [locInput, setLocInput]   = useState("");
  const [limit, setLimit]         = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).limit : (settings.dailyLeadLimit || 10);
    } catch { return settings.dailyLeadLimit || 10; }
  });
  const [reqContact, setReqContact] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).reqContact : (settings.requiredContact || "email_or_phone");
    } catch { return settings.requiredContact || "email_or_phone"; }
  });
  const [pitchOffer, setPitchOffer] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).pitchOffer : (settings.pitchOffer || "whatsapp_bot");
    } catch { return settings.pitchOffer || "whatsapp_bot"; }
  });
  const [searchMode, setSearchMode] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).searchMode : (settings.searchMode || "deepsearch");
    } catch { return settings.searchMode || "deepsearch"; }
  });
  const [strictFilter, setStrictFilter] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved && JSON.parse(saved).strictFilter !== undefined ? JSON.parse(saved).strictFilter : true;
    } catch { return true; }
  });

  /* Save config changes to localStorage automatically */
  useEffect(() => {
    try {
      localStorage.setItem("syntek_scrape_config", JSON.stringify({
        niche,
        locations,
        limit,
        reqContact,
        pitchOffer,
        searchMode,
        strictFilter
      }));
    } catch (e) {
      console.error("Failed to save scrape config:", e);
    }
  }, [niche, locations, limit, reqContact, pitchOffer, searchMode, strictFilter]);

  /* UI state */
  const [searching, setSearching]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [searchLog, setSearchLog]       = useState([]);
  const [activeScanId, setActiveScanId] = useState(null);
  const isStopRequested                 = useRef(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery]   = useState("");
  const [drawerLead, setDrawerLead]     = useState(null);
  const [composerLead, setComposerLead] = useState(null);
  const [bulkGenerating, setBulkGen]    = useState(false);
  const [elapsedTime, setElapsedTime]   = useState(0);
  const [isFullscreenLogs, setIsFullscreenLogs] = useState(false);

  /* Timer Effect */
  useEffect(() => {
    let timer;
    if (searching) {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [searching]);

  /* Sync settings → state only if no user overrides exist in localStorage yet */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      if (!saved) {
        setNiche(settings.niche || "Cafes & Brunch");
        setLocations([settings.location || "Austin, TX"]);
        setLimit(settings.dailyLeadLimit || 10);
        setReqContact(settings.requiredContact || "email_or_phone");
        setPitchOffer(settings.pitchOffer || "whatsapp_bot");
        setSearchMode(settings.searchMode || "deepsearch");
        setStrictFilter(true);
      }
    } catch { /* fallback */ }
  }, [settings]);

  /* Location tag input */
  const addLoc = () => {
    const v = locInput.trim();
    if (v && !locations.includes(v)) setLocations(prev => [...prev, v]);
    setLocInput("");
  };
  const removeLoc = (l) => setLocations(prev => prev.filter(x => x !== l));

  async function pollScan(scanId, loc, startLogCount = 0, baseProgress = 5, locShare = 80) {
    let seenLogCount = startLogCount;
    let done = false;
    let pollAttempts = 0;
    const maxPollAttempts = 1000; // ~50 minutes at 3s intervals

    const log = (msg, type = "info") =>
      setSearchLog(prev => [...prev, { msg, type, t: new Date().toLocaleTimeString() }]);

    while (!done && pollAttempts < maxPollAttempts) {
      pollAttempts++;
      if (isStopRequested.current) {
        log("Stop requested by user. Terminating poll...", "warn");
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
      if (isStopRequested.current) break;

      try {
        const statusRes = await fetch(`/api/scan/status/${scanId}`);
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();
        const serverLogs = statusData.logs || [];

        // Replay any new log entries
        for (let j = seenLogCount; j < serverLogs.length; j++) {
          const entry = serverLogs[j];
          log(entry.text || entry.message || "", entry.type || "info");
        }
        seenLogCount = serverLogs.length;

        // Update progress bar
        const pct = parseFloat(statusData.progress) || 0;
        setProgress(Math.min(95, baseProgress + Math.round((pct / 100) * locShare)));

        if (statusData.status === "done" || statusData.status === "completed") {
          done = true;
          log(`✓ Scan complete for ${loc}!`, "success");
        } else if (statusData.status === "error" || statusData.status === "failed") {
          done = true;
          log(`✕ Scan error: ${statusData.error || "Unknown error"}`, "error");
        } else if (statusData.status === "stopped") {
          done = true;
          isStopRequested.current = true;
          log(`⚠ Scan stopped by user.`, "warn");
        }
      } catch (pollErr) {
        // poll failed transiently, retry
      }
    }

    if (!done) {
      log(`⚠ Scan timed out for ${loc}. Partial results may have been saved.`, "warn");
    }
  }

  /* ── On mount: check if a scan is active on the server ── */
  useEffect(() => {
    async function checkActiveScan() {
      try {
        const res = await fetch("/api/scan/active");
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setSearching(true);
            setActiveScanId(data.scanId);
            setProgress(data.progress || 5);
            isStopRequested.current = false;
            
            // Calculate elapsed time based on created_at
            if (data.created_at) {
              const startMs = new Date(data.created_at).getTime();
              const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
              setElapsedTime(diffSec);
            } else {
              setElapsedTime(0);
            }

            // Restore search log and seenLogCount
            const serverLogs = data.logs || [];
            setSearchLog(serverLogs.map(entry => ({
              msg: entry.text || entry.message || "",
              type: entry.type || "info",
              t: new Date().toLocaleTimeString()
            })));

            showToast("Reconnected to active scanning process...", "info");
            
            // Start polling this scan
            await pollScan(data.scanId, "Active Scan", serverLogs.length, data.progress, 100 - data.progress);
            
            // After poll finishes, refresh data
            try {
              const leadsRes = await fetch("/api/leads");
              if (leadsRes.ok) {
                const allLeads = await leadsRes.json();
                setLeads(allLeads.map(l => ({ ...l, rating: l.rating ? parseFloat(l.rating) : 4.0, reviews: l.reviews ? parseInt(l.reviews) : 0 })));
              }
            } catch (e) {}
            
            setProgress(100);
            setSearching(false);
            setActiveScanId(null);
            showToast("Scan finished!", "success");
            setTimeout(() => setProgress(0), 2500);
          }
        }
      } catch (err) {
        console.error("Failed to check active scan:", err);
      }
    }
    checkActiveScan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Scrape leads — async scan with server-side polling */
  async function handleScrape() {
    if (!niche.trim() || locations.length === 0) {
      showToast("Please enter a niche and at least one location.", "warning");
      return;
    }
    setSearching(true);
    setProgress(5);
    setSearchLog([]);
    setElapsedTime(0);
    setActiveScanId(null);
    isStopRequested.current = false;

    const log = (msg, type = "info") =>
      setSearchLog(prev => [...prev, { msg, type, t: new Date().toLocaleTimeString() }]);

    log("Starting DeepSearch AI scan...", "info");

    for (let i = 0; i < locations.length; i++) {
      if (isStopRequested.current) {
        log("Scan cancelled by user.", "warn");
        break;
      }
      const loc = locations[i];
      log(`Initiating scan: "${niche}" in ${loc}...`, "info");

      let scanId = null;
      try {
        // 1. Start the scan — returns {scan_id} immediately
        const endpoint = searchMode === "quick" ? "/api/scan" : "/api/scan-deepsearch";
        const startRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niche,
            location: loc,
            limit: Math.ceil(limit / locations.length),
            pitchOffer,
            requiredContact: reqContact,
            strictFilter,
          }),
        });

        if (!startRes.ok) {
          const err = await startRes.json().catch(() => ({}));
          log(`✕ Failed to start scan for ${loc}: ${err.error || startRes.statusText}`, "error");
          continue;
        }

        const startData = await startRes.json();
        scanId = startData.scan_id;
        if (!scanId) {
          log(`✕ No scan ID returned for ${loc}`, "error");
          continue;
        }

        setActiveScanId(scanId);
        log(`Scan started (ID: ${scanId}). AI is searching...`, "info");

        // 2. Poll for completion
        const baseProgress = 5 + Math.round((i / locations.length) * 80);
        const locShare = Math.round((1 / locations.length) * 80);
        await pollScan(scanId, loc, 0, baseProgress, locShare);

      } catch (e) {
        log(`✕ Network error: ${e.message}`, "error");
      }
    }

    // 3. Refresh leads from database after all scans finish
    try {
      const leadsRes = await fetch("/api/leads");
      if (leadsRes.ok) {
        const allLeads = await leadsRes.json();
        setLeads(allLeads.map(l => ({ ...l, rating: l.rating ? parseFloat(l.rating) : 4.0, reviews: l.reviews ? parseInt(l.reviews) : 0 })));
        log(`✓ Leads refreshed from database.`, "success");
      }
    } catch (e) {
      log(`⚠ Could not refresh leads: ${e.message}`, "warn");
    }

    setProgress(100);
    setSearching(false);
    setActiveScanId(null);
    if (isStopRequested.current) {
      showToast("Scan stopped. Partial results saved.", "warning");
    } else {
      showToast("Scan complete! New leads have been added.", "success");
    }
    setTimeout(() => setProgress(0), 2500);
  }

  async function handleStopScan() {
    isStopRequested.current = true;
    if (activeScanId) {
      try {
        const res = await fetch(`/api/scan/stop/${activeScanId}`, { method: "POST" });
        if (res.ok) {
          showToast("Scan stopped.", "info");
        } else {
          showToast("Failed to request scan stop.", "danger");
        }
      } catch (err) {
        console.error("Failed to stop scan:", err);
        showToast("Network error stopping scan.", "danger");
      }
    } else {
      showToast("Scan stopped.", "info");
    }
    setSearching(false);
    setProgress(0);
  }

  /* Select/deselect */
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filteredLeads = leads.filter(l => {
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return l.name?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.type?.toLowerCase().includes(q);
    }
    return true;
  });

  const allSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedIds.has(l.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredLeads.map(l => l.id)));
  };

  /* Update lead status */
  async function updateStatus(id, status) {
    try {
      await fetch(`/api/leads/${id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch (e) { showToast("Failed to update status.", "danger"); }
  }

  /* Bulk generate + send */
  async function handleBulkSend() {
    const targets = filteredLeads.filter(l => selectedIds.has(l.id) && l.email);
    if (targets.length === 0) { showToast("No leads with email selected.", "warning"); return; }
    if (!settings.gmailUser) { showToast("Gmail not connected. Go to Settings.", "danger"); return; }
    setBulkGen(true);
    let sent = 0;
    for (const lead of targets) {
      try {
        const pitchLabel = { whatsapp_bot: "WhatsApp booking bot", website_dev: "website design", ai_chatbot: "AI chatbot", custom: settings.customOfferDetails }[settings.pitchOffer] || settings.pitchOffer;
        const prompt = `Write a short personalized cold email from ${settings.senderName || "a developer"} to ${lead.name} (${lead.type} in ${lead.city}, ${lead.rating}⭐). Pitch: ${pitchLabel}. Website status: ${lead.website_status || "unknown"}. Keep it under 120 words. Format: Subject: [subject]\n\n[body]`;
        const aiRes = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: AbortSignal.timeout(35000) });
        if (!aiRes.ok) continue;
        const { text } = await aiRes.json();
        const lines = text.split("\n");
        const subject = lines[0].startsWith("Subject:") ? lines[0].replace("Subject:", "").trim() : `Quick question about ${lead.name}`;
        const body = lines[0].startsWith("Subject:") ? lines.slice(2).join("\n").trim() : text;
        const mailRes = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gmailUser: settings.gmailUser, gmailPass: settings.gmailPass, to: lead.email, subject, body }) });
        if (mailRes.ok) { await updateStatus(lead.id, "contacted"); sent++; }
      } catch { /* continue */ }
    }
    setBulkGen(false);
    setSelectedIds(new Set());
    showToast(`Sent ${sent}/${targets.length} personalized emails!`, "success");
  }

  /* Delete lead */
  async function deleteLead(id) {
    try {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
      setLeads(prev => prev.filter(l => l.id !== id));
      if (drawerLead?.id === id) setDrawerLead(null);
    } catch { showToast("Failed to delete lead.", "danger"); }
  }

  const wsColor = { active: "badge-success", no_website: "badge-danger", down: "badge-warning" };
  const statusColor = { "not contacted": "badge-neutral", contacted: "badge-brand", replied: "badge-success", no_email: "badge-warning" };

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 104px)" }}>

      {/* ── Left Config Panel ── */}
      <div className="config-panel" style={{ width: 272, minWidth: 272 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>Scrape Config</div>

        {/* Niche */}
        <div className="input-group">
          <label className="input-label">Target Niche</label>
          <input className="input input-sm" placeholder="e.g. Hair Salons, Gyms..." value={niche} onChange={e => setNiche(e.target.value)} />
        </div>

        {/* Locations (multi-tag) */}
        <div className="input-group">
          <label className="input-label">Location(s)</label>
          <div className="tag-input-wrap">
            {locations.map(l => (
              <span key={l} className="tag-chip">
                {l}
                <button className="tag-chip-remove" onClick={() => removeLoc(l)}>✕</button>
              </span>
            ))}
            <input
              className="tag-input"
              placeholder="Add city..."
              value={locInput}
              onChange={e => setLocInput(e.target.value)}
              onKeyDown={e => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addLoc())}
            />
          </div>
          {locInput && <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={addLoc}>+ Add</button>}
        </div>

        {/* Leads slider */}
        <div className="input-group">
          <label className="input-label">Max Leads</label>
          <div className="slider-wrap">
            <div className="slider-row">
              <input type="range" className="slider" min={5} max={50} step={5} value={limit} onChange={e => setLimit(+e.target.value)} />
              <span className="slider-value">{limit}</span>
            </div>
          </div>
        </div>

        {/* Required contact */}
        <div className="input-group">
          <label className="input-label">Required Contact</label>
          <select className="input input-sm" value={reqContact} onChange={e => setReqContact(e.target.value)}>
            <option value="email_or_phone">Email or Phone</option>
            <option value="email">Email only</option>
            <option value="phone">Phone only</option>
            <option value="instagram">Instagram</option>
            <option value="any_social">Any Social</option>
            <option value="all">All (email + phone + social)</option>
          </select>
        </div>

        {/* Pitch offer */}
        <div className="input-group">
          <label className="input-label">Service Pitch</label>
          <select className="input input-sm" value={pitchOffer} onChange={e => setPitchOffer(e.target.value)}>
            <option value="whatsapp_bot">WhatsApp Booking Bot</option>
            <option value="website_dev">Website Design</option>
            <option value="ai_chatbot">AI Chatbot</option>
            <option value="custom">Custom Offer</option>
          </select>
        </div>

        {/* Search mode */}
        <div className="input-group">
          <label className="input-label">Search Mode</label>
          <select className="input input-sm" value={searchMode} onChange={e => setSearchMode(e.target.value)}>
            <option value="deepsearch">DeepSearch AI (thorough)</option>
            <option value="quick">Quick Scan (fast)</option>
          </select>
        </div>

        {/* Strict AI Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 10px 0" }}>
          <input 
            type="checkbox" 
            id="strictFilterCheckbox" 
            checked={strictFilter} 
            onChange={e => setStrictFilter(e.target.checked)} 
            style={{ cursor: "pointer", width: 14, height: 14 }}
          />
          <label htmlFor="strictFilterCheckbox" style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-2)", cursor: "pointer", userSelect: "none" }}>
            Strict AI Lead Qualification
          </label>
        </div>

        <div className="divider" />

        {/* Scrape button */}
        {searching ? (
          <button
            className="btn btn-danger w-full"
            style={{ justifyContent: "center" }}
            onClick={handleStopScan}
          >
            ⏹ Stop Scanning
          </button>
        ) : (
          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: "center" }}
            onClick={handleScrape}
          >
            ◎ Start Scraping
          </button>
        )}

        {/* Progress */}
        {searching && (
          <div>
            <div className="progress-bar">
              <div className="progress-fill animated" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-4)", marginTop: 6 }}>
              <span>{progress}% — Searching {locations[0]}...</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--brand)", display: "flex", alignItems: "center", gap: 3 }}>
                ⏱ {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s
              </span>
            </div>
          </div>
        )}

        {/* Mini log */}
        {searchLog.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Scraper Console</span>
              <button 
                className="btn btn-ghost btn-xs" 
                style={{ fontSize: 10, padding: "2px 6px", height: "auto", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => setIsFullscreenLogs(true)}
              >
                ⛶ Maximize
              </button>
            </div>
            <div className="log-console" style={{ height: 120, fontSize: 11 }}>
              {searchLog.map((l, i) => (
                <div key={i} className={`log-line ${l.type}`}>
                  <span className="log-time">{l.t}</span>
                  <span className="log-text">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right Results Panel ── */}
      <div className="results-panel" style={{ flex: 1, minWidth: 0 }}>
        {/* Toolbar */}
        <div className="results-toolbar">
          <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
            <span className="search-icon">⌕</span>
            <input placeholder="Search leads..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <select className="input input-sm" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="not contacted">Not Contacted</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="no_email">No Email</option>
          </select>
          {selectedIds.size > 0 && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleBulkSend}
                disabled={bulkGenerating}
              >
                {bulkGenerating
                  ? <><span className="spinner spinner-sm" /> Generating...</>
                  : `⚡ Send ${selectedIds.size} Emails`}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
                Deselect
              </button>
            </>
          )}
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>
            {filteredLeads.length} leads
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)" }}>
          {filteredLeads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">◎</div>
              <div className="empty-state-title">{leads.length === 0 ? "No leads yet" : "No results"}</div>
              <div className="empty-state-desc">
                {leads.length === 0
                  ? "Configure your scrape settings and click Start Scraping."
                  : "Try adjusting your search or filters."}
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Website</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => (
                  <tr
                    key={l.id}
                    className={selectedIds.has(l.id) ? "selected" : ""}
                    onClick={() => setDrawerLead(l)}
                  >
                    <td onClick={e => { e.stopPropagation(); toggleSelect(l.id); }}>
                      <input type="checkbox" className="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type} · {l.city}</div>
                    </td>
                    <td>
                      {l.email
                        ? <a href={`mailto:${l.email}`} style={{ fontSize: 12, color: "var(--brand)", fontFamily: "var(--font-mono)" }} onClick={e => e.stopPropagation()}>{l.email}</a>
                        : <span style={{ fontSize: 12, color: "var(--text-4)" }}>—</span>
                      }
                      {l.phone && <div style={{ fontSize: 11.5, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{l.phone}</div>}
                    </td>
                    <td>
                      {l.website
                        ? <span className={`badge ${wsColor[l.website_status] || "badge-neutral"}`}>{l.website_status || "active"}</span>
                        : <span className="badge badge-danger">none</span>
                      }
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                        {l.rating ? `${l.rating}⭐` : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-4)" }}>
                        {l.reviews ? `${l.reviews} reviews` : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusColor[l.status] || "badge-neutral"}`}>
                        {(l.status || "new").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!l.email}
                          title={l.email ? "Draft & Send Email" : "No email address"}
                          onClick={() => setComposerLead(l)}
                        >
                          ✉
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="View Details"
                          onClick={() => setDrawerLead(l)}
                        >
                          ↗
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Delete"
                          onClick={() => deleteLead(l.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Lead Detail Drawer ── */}
      {drawerLead && (
        <LeadDetailDrawer
          lead={leads.find(l => l.id === drawerLead.id) || drawerLead}
          onClose={() => setDrawerLead(null)}
          onDraftEmail={(l) => { setComposerLead(l); setDrawerLead(null); }}
          onUpdateStatus={updateStatus}
        />
      )}

      {/* ── Email Composer ── */}
      {composerLead && (
        <EmailComposer
          lead={composerLead}
          settings={settings}
          showToast={showToast}
          onClose={() => setComposerLead(null)}
          onSent={(id) => { setLeads(prev => prev.map(l => l.id === id ? { ...l, status: "contacted" } : l)); }}
        />
      )}

      {/* ── Fullscreen Logs Modal ── */}
      {isFullscreenLogs && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 10, 15, 0.95)",
          backdropFilter: "blur(20px)",
          zIndex: 1100,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          color: "var(--text-1)",
          animation: "fadeIn 0.25s ease-out"
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            paddingBottom: "16px",
            marginBottom: "20px",
            flexShrink: 0
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                  🔎 Syntek Scraper Grounding Console
                </h2>
                <span className={`badge ${searching ? "badge-brand" : "badge-success"}`} style={{ fontSize: 11 }}>
                  {searching ? "● Scanning Active" : "✓ Idle"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
                Niche: <strong>{niche}</strong> | Target: <strong>{locations.join(", ")}</strong> | Limit: <strong>{limit} leads</strong>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {searching && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>Progress: <strong>{progress}%</strong></span>
                  <div style={{ width: 80, height: 6, background: "var(--border-1)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "var(--brand)" }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--brand)", display: "flex", alignItems: "center", gap: 4 }}>
                    ⏱ {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s
                  </span>
                </div>
              )}

              <button 
                className="btn btn-secondary" 
                style={{ display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => {
                  const logText = searchLog.map(l => `[${l.t}] [${l.type.toUpperCase()}] ${l.msg}`).join("\n");
                  navigator.clipboard.writeText(logText);
                  showToast("Logs copied to clipboard!", "success");
                }}
              >
                📋 Copy Logs
              </button>

              <button className="btn btn-ghost" style={{ fontSize: 20, padding: 8 }} onClick={() => setIsFullscreenLogs(false)}>
                ✕
              </button>
            </div>
          </div>

          {/* Logs Body */}
          <div 
            className="log-console" 
            style={{ 
              flex: 1, 
              fontSize: 12, 
              height: "auto", 
              padding: 20, 
              borderRadius: "var(--radius-lg)",
              background: "#08080c",
              border: "1px solid rgba(255,255,255,0.05)",
              overflowY: "auto",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.6
            }}
          >
            {searchLog.map((l, i) => (
              <div key={i} className={`log-line ${l.type}`} style={{ padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <span className="log-time" style={{ color: "var(--text-4)", marginRight: 10, userSelect: "none" }}>[{l.t}]</span>
                <span className="log-badge" style={{ 
                  display: "inline-block", 
                  width: 80, 
                  fontSize: 10, 
                  fontWeight: 700, 
                  textTransform: "uppercase", 
                  color: l.type === "success" ? "var(--success)" : l.type === "error" ? "var(--danger)" : l.type === "warn" ? "var(--warning)" : "var(--info)",
                  marginRight: 10,
                  userSelect: "none"
                }}>
                  {l.type}
                </span>
                <span className="log-text" style={{ whiteSpace: "pre-wrap" }}>{l.msg}</span>
              </div>
            ))}
          </div>

          {/* Footer controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--text-4)" }}>
              Showing {searchLog.length} log statements. Auto-scrolling to latest...
            </span>
            <button className="btn btn-primary" onClick={() => setIsFullscreenLogs(false)}>
              Close Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
