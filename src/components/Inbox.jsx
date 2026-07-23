import { useState, useEffect, useRef, useCallback } from "react";

const TABS = [
  { id: "inbox",   label: "📬 Inbox",          desc: "Replies from leads" },
  { id: "pending", label: "⏳ Pending Drafts",  desc: "AI draft replies to review" },
  { id: "sent",    label: "📤 Sent",            desc: "Your outreach emails" },
];

export default function Inbox({ settings, showToast, refreshData }) {
  const [emails, setEmails]         = useState([]);
  const [selected, setSelected]     = useState(null);
  const [tab, setTab]               = useState("inbox");
  const [search, setSearch]         = useState("");
  const [replyText, setReplyText]   = useState("");
  const [replying, setReplying]     = useState(false);
  const [sending, setSending]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [openFilter, setOpenFilter] = useState("all");
  const [tagFilter, setTagFilter]   = useState("all");
  const [lastSynced, setLastSynced] = useState(null);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [totalEmails, setTotalEmails] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [originalEmail, setOriginalEmail] = useState(null); // context email shown in pending tab
  const autoSyncRef = useRef(null);
  const PAGE_SIZE = 60;

  // ── Fetch emails for current tab ──
  const fetchEmails = useCallback(async (currentTab = tab, currentPage = 1, append = false) => {
    try {
      const params = new URLSearchParams({ tab: currentTab, page: currentPage, limit: PAGE_SIZE });
      const res = await fetch(`/api/emails?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      // Support both new paginated response { emails, total, hasMore } and legacy array
      const rows = Array.isArray(data) ? data : (data.emails || []);
      if (append) {
        setEmails(prev => [...prev, ...rows]);
      } else {
        setEmails(rows);
      }
      setHasMore(Array.isArray(data) ? false : (data.hasMore || false));
      setTotalEmails(Array.isArray(data) ? rows.length : (data.total || rows.length));
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    }
  }, [tab]);

  // ── Auto-sync every 2 minutes ──
  const triggerSync = useCallback(async (silent = false) => {
    if (syncing) return;
    if (!silent) setSyncing(true);
    try {
      const res = await fetch("/api/emails/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLastSynced(new Date());
        if (data.newReplies > 0) {
          showToast(`📬 ${data.newReplies} new repl${data.newReplies === 1 ? "y" : "ies"} from leads!`, "success");
          // Refresh current tab
          await fetchEmails(tab, 1, false);
          if (typeof refreshData === "function") refreshData();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (!silent) showToast(`Sync: ${err.error || "Completed with warnings."}`, "warning");
      }
    } catch (err) {
      if (!silent) showToast("Network error syncing mailbox.", "danger");
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [syncing, tab, fetchEmails, showToast, refreshData]);

  // On mount + tab change: fetch emails and start auto-sync
  useEffect(() => {
    setPage(1);
    setSelected(null);
    setReplyText("");
    setOriginalEmail(null);
    fetchEmails(tab, 1, false);
  }, [tab]);

  useEffect(() => {
    triggerSync(true);
    // Auto-sync every 2 minutes
    autoSyncRef.current = setInterval(() => triggerSync(true), 120000);
    return () => clearInterval(autoSyncRef.current);
  }, []);

  // ── Load More ──
  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    await fetchEmails(tab, nextPage, true);
    setLoadingMore(false);
  };

  // ── Filters applied client-side ──
  const filtered = emails.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      if (!(
        (e.from_name || e.from || "").toLowerCase().includes(q) ||
        (e.company || "").toLowerCase().includes(q) ||
        (e.subject || "").toLowerCase().includes(q) ||
        (e.from_email || "").toLowerCase().includes(q)
      )) return false;
    }
    if (openFilter === "opened") {
      if (tab === "sent") { if (!e.lead_is_opened) return false; }
      else { if (!e.is_read && !e.read) return false; }
    } else if (openFilter === "unopened") {
      if (tab === "sent") { if (e.lead_is_opened) return false; }
      else { if (e.is_read || e.read) return false; }
    }
    if (tagFilter !== "all") {
      const labels = Array.isArray(e.labels) ? e.labels : [];
      if (tagFilter === "bounced") return labels.includes("bounced");
      if (tagFilter === "replied") return labels.includes("replied");
      if (tagFilter === "no_tag")  return labels.length === 0;
    }
    return true;
  });

  const unreadCount  = emails.filter(e => !e.is_read && !e.read).length;
  const pendingCount = emails.length; // pending tab already filtered server-side

  // ── Mark as read ──
  async function markRead(email) {
    if (email.is_read || email.read) return;
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ is_read: true }),
      });
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true, read: true } : e));
    } catch { /* silent */ }
  }

  // ── Load original email for context (Pending tab) ──
  async function loadOriginalEmail(draft) {
    if (!draft.from_email) return;
    try {
      const params = new URLSearchParams({ tab: "inbox", page: 1, limit: 10 });
      const res = await fetch(`/api/emails?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.emails || []);
      const orig = rows.find(e =>
        e.from_email?.toLowerCase() === draft.from_email?.toLowerCase() &&
        !(e.labels?.includes("pending_reply") || e.category === "draft")
      );
      setOriginalEmail(orig || null);
    } catch { /* silent */ }
  }

  // ── Select email ──
  async function handleSelect(email) {
    setSelected(email);
    const isDraft = email.labels?.includes("pending_reply") || email.category === "draft";
    if (isDraft) {
      setReplyText(email.preview || "");
      await loadOriginalEmail(email);
    } else {
      setReplyText("");
      setOriginalEmail(null);
    }
    await markRead(email);
  }

  // ── Send reply ──
  async function handleReply() {
    if (!replyText.trim() || !selected) return;
    if (!settings?.gmailUser) { showToast("Gmail not connected. Go to Settings.", "danger"); return; }
    setReplying(true);
    try {
      const isDraft = selected.labels?.includes("pending_reply") || selected.category === "draft";
      // Correct reply address: for drafts, the from_email IS the prospect's address
      const toEmail = selected.from_email || selected.email;
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          gmailUser: settings.gmailUser,
          gmailPass: settings.gmailPass,
          to: toEmail,
          subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`,
          body: replyText,
          draftId: isDraft ? selected.id : null,
        }),
      });
      if (res.ok) {
        showToast("Reply sent ✓", "success");
        setReplyText("");
        if (isDraft) {
          setEmails(prev => prev.filter(e => e.id !== selected.id));
          setSelected(null);
        }
        // Re-fetch sent tab to show the new sent email
        if (typeof refreshData === "function") refreshData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Failed to send: ${err.error || "Unknown error"}`, "danger");
      }
    } catch { showToast("Network error.", "danger"); }
    finally { setReplying(false); }
  }

  // ── Discard draft ──
  async function handleDiscardDraft() {
    if (!selected) return;
    try {
      await fetch(`/api/emails/${selected.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      setEmails(prev => prev.filter(e => e.id !== selected.id));
      setSelected(null);
      setOriginalEmail(null);
      showToast("Draft discarded.", "info");
    } catch { showToast("Failed to discard.", "danger"); }
  }

  // ── Regenerate draft ──
  async function handleRegenerateDraft() {
    if (!selected || regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/emails/${selected.id}/generate-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.replyText);
        setEmails(prev => prev.map(e => e.id === selected.id ? { ...e, preview: data.replyText } : e));
        showToast("Draft regenerated ✨", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Regen failed: ${err.error || "Unknown error"}`, "danger");
      }
    } catch { showToast("Network error.", "danger"); }
    finally { setRegenerating(false); }
  }

  // ── Generate AI Draft (with duplicate guard) ──
  async function handleGenerateAIDraft() {
    if (!selected || generatingDraft) return;

    // Guard: if a pending draft already exists for this sender, switch to it instead
    const existingDraft = emails.find(e =>
      e.from_email?.toLowerCase() === selected.from_email?.toLowerCase() &&
      (e.labels?.includes("pending_reply") || e.category === "draft") &&
      e.id !== selected.id
    );
    if (existingDraft) {
      showToast("Draft already exists — switching to Pending tab.", "info");
      setTab("pending");
      await fetchEmails("pending", 1, false);
      return;
    }

    setGeneratingDraft(true);
    try {
      const res = await fetch(`/api/emails/${selected.id}/generate-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.updated) {
          // Existing draft was updated
          showToast("Existing draft refreshed ✨ — check Pending tab.", "success");
          setTab("pending");
          await fetchEmails("pending", 1, false);
        } else if (data.newDraft) {
          const draft = { ...data.newDraft, read: data.newDraft.is_read };
          showToast("AI draft ready — review in Pending tab ✨", "success");
          setTab("pending");
          await fetchEmails("pending", 1, false);
          setTimeout(() => setSelected(draft), 300);
        } else {
          showToast("Draft generated but response was empty.", "warning");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Draft generation failed: ${err.error || "Unknown error"}`, "danger");
      }
    } catch { showToast("Network error.", "danger"); }
    finally { setGeneratingDraft(false); }
  }

  // ── Scoped Clear ──
  async function handleClearTab() {
    const label = tab === "inbox" ? "inbox replies" : tab === "pending" ? "pending drafts" : "sent emails";
    if (!window.confirm(`Clear all ${label} from this tab? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/emails?tab=${tab}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmails([]);
        setSelected(null);
        showToast(`Cleared ${data.deleted || 0} ${label}.`, "success");
      } else {
        showToast("Failed to clear tab.", "danger");
      }
    } catch { showToast("Network error.", "danger"); }
  }

  // ── Categorize email ──
  async function handleMarkCategory(emailId, cat) {
    try {
      await fetch(`/api/emails/${emailId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ category: cat }),
      });
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, category: cat } : e));
      showToast(`Categorized as ${cat.replace("_", " ")}`, "success");
    } catch { showToast("Failed to update category.", "danger"); }
  }

  // ── Helpers ──
  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000)    return "Just now";
    if (diffMs < 3600000)  return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatLastSynced() {
    if (!lastSynced) return null;
    const diffMs = new Date() - lastSynced;
    if (diffMs < 60000) return "just now";
    return `${Math.floor(diffMs / 60000)}m ago`;
  }

  const catBadge = {
    interested:     "badge-success",
    not_interested: "badge-danger",
    follow_up:      "badge-warning",
    spam:           "badge-neutral",
  };
  const displayName  = e => e.from_name || e.from || e.company || "Unknown";
  const displayEmail = e => e.from_email || e.email || "";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 104px)", gap: 16 }}>

      {/* ── Left Panel ── */}
      <div style={{ width: 320, minWidth: 320, display: "flex", flexDirection: "column", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-1)", background: "var(--bg-card)" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Smart Inbox</span>
            {lastSynced && (
              <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 1 }}>
                Synced {formatLastSynced()}
              </div>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={syncing}
            onClick={() => triggerSync(false)}
            style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px" }}
          >
            {syncing ? <><span className="spinner spinner-sm" /> Syncing</> : "🔄 Sync"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-1)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setOpenFilter("all"); setTagFilter("all"); setSearch(""); }}
              style={{
                flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? "var(--brand-subtle)" : "transparent",
                color: tab === t.id ? "var(--brand)" : "var(--text-3)",
                border: "none", borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s", position: "relative",
              }}
            >
              {t.id === "inbox"   ? "📬 Inbox" :
               t.id === "pending" ? "⏳ Pending" : "📤 Sent"}
              {t.id === "inbox" && unreadCount > 0 && tab !== "inbox" && (
                <span className="badge badge-brand" style={{ position: "absolute", top: 4, right: 4, fontSize: 9, padding: "1px 5px" }}>{unreadCount}</span>
              )}
              {t.id === "pending" && tab !== "pending" && pendingCount > 0 && (
                <span className="badge badge-warning" style={{ position: "absolute", top: 4, right: 4, fontSize: 9, padding: "1px 5px" }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-1)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="search-bar" style={{ flex: 1 }}>
              <span className="search-icon">⌕</span>
              <input
                placeholder="Search name, email, subject..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tab !== "pending" && (
              <select
                className="input"
                style={{ flex: 1, padding: "0 8px", fontSize: 11, height: 28 }}
                value={openFilter}
                onChange={e => setOpenFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="opened">{tab === "sent" ? "👁 Opened" : "✓ Read"}</option>
                <option value="unopened">{tab === "sent" ? "📩 Unopened" : "✉ Unread"}</option>
              </select>
            )}
            <select
              className="input"
              style={{ flex: 1, padding: "0 8px", fontSize: 11, height: 28 }}
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            >
              <option value="all">All Tags</option>
              <option value="replied">✅ Replied</option>
              <option value="bounced">🚫 Bounced</option>
              <option value="no_tag">🏷 No Tag</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>
              {filtered.length} of {totalEmails} emails
            </span>
            {emails.length > 0 && (
              <button
                onClick={handleClearTab}
                style={{ background: "transparent", border: "none", color: "var(--danger)", fontSize: 10.5, cursor: "pointer", padding: "2px 6px" }}
              >
                🗑 Clear {tab === "inbox" ? "Inbox" : tab === "pending" ? "Drafts" : "Sent"}
              </button>
            )}
          </div>
        </div>

        {/* Pending banner */}
        {tab === "pending" && emails.length > 0 && (
          <div style={{ padding: "8px 12px", background: "rgba(234,179,8,0.12)", borderBottom: "1px solid rgba(234,179,8,0.25)", fontSize: 11.5, color: "#ca8a04", lineHeight: 1.5 }}>
            ⚠ AI draft replies — review and click <strong>Send</strong> to approve.
          </div>
        )}

        {/* Email list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-state-icon">✉</div>
              <div className="empty-state-title">
                {tab === "inbox"   ? "No replies yet" :
                 tab === "pending" ? "No pending drafts" : "No sent emails"}
              </div>
              <div className="empty-state-desc">
                {tab === "inbox"   ? "Lead replies will appear here after sync." :
                 tab === "pending" ? "AI drafts await your approval here." :
                 "Your sent outreach emails will appear here."}
              </div>
            </div>
          ) : (
            <>
              {filtered.map(email => {
                const isUnread = !email.is_read && !email.read;
                const isDraft = email.labels?.includes("pending_reply") || email.category === "draft";
                return (
                  <div
                    key={email.id}
                    onClick={() => handleSelect(email)}
                    style={{
                      padding: "11px 16px",
                      borderBottom: "1px solid var(--border-2)",
                      cursor: "pointer",
                      background: selected?.id === email.id
                        ? "var(--brand-subtle)"
                        : isUnread ? "var(--bg-overlay)" : "transparent",
                      transition: "background 0.1s",
                      borderLeft: isDraft ? "3px solid #eab308" : isUnread ? "3px solid var(--brand)" : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: 12.5, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName(email)}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-4)", flexShrink: 0, marginLeft: 8 }}>
                        {formatTime(email.time_received || email.time)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {email.subject || "(no subject)"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {email.preview?.substring(0, 80) || ""}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                      {isDraft && (
                        <span style={{ fontSize: 9.5, background: "rgba(234,179,8,0.2)", color: "#ca8a04", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                          DRAFT · Awaits Approval
                        </span>
                      )}
                      {email.category && !isDraft && catBadge[email.category] && (
                        <span className={`badge ${catBadge[email.category]}`} style={{ fontSize: 9.5 }}>
                          {email.category === "interested" ? "🔥 Interested" :
                           email.category === "not_interested" ? "💤 Not Interested" :
                           email.category === "follow_up" ? "⏳ Follow Up" :
                           email.category === "spam" ? "🤖 Spam/Auto" :
                           email.category.replace("_", " ")}
                        </span>
                      )}
                      {tab === "sent" && (
                        email.lead_is_opened
                          ? <span className="badge badge-success" style={{ fontSize: 9.5 }}>👁 Opened</span>
                          : <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>📩 Unopened</span>
                      )}
                      {email.followup_count > 0 && tab === "sent" && (
                        <span className="badge badge-warning" style={{ fontSize: 9.5 }}>
                          FU #{email.followup_number || 1}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <div style={{ padding: 16, textAlign: "center" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{ fontSize: 12 }}
                  >
                    {loadingMore ? <><span className="spinner spinner-sm" /> Loading...</> : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", overflow: "hidden" }}>
        {!selected ? (
          <div className="empty-state" style={{ height: "100%" }}>
            <div className="empty-state-icon">✉</div>
            <div className="empty-state-title">Select an email</div>
            <div className="empty-state-desc">
              {tab === "pending"
                ? "Select a draft to review the AI suggestion and send it."
                : "Click an email to read it and reply."}
            </div>
          </div>
        ) : (
          <>
            {/* Email header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 6 }}>
                {selected.subject || "(no subject)"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand-subtle)", border: "1px solid var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--brand)", flexShrink: 0 }}>
                    {displayName(selected)[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{displayName(selected)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{displayEmail(selected)}</span>
                      {tab === "sent" && (
                        selected.lead_is_opened
                          ? <span className="badge badge-success" style={{ fontSize: 9.5 }}>👁 Opened</span>
                          : <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>📩 Unopened</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>
                      {formatTime(selected.time_received || selected.time)}
                    </div>
                  </div>
                </div>
                {tab === "inbox" && (
                  <select
                    className="input input-sm"
                    style={{ width: 150 }}
                    value={selected.category || ""}
                    onChange={e => { handleMarkCategory(selected.id, e.target.value); setSelected(prev => ({ ...prev, category: e.target.value })); }}
                  >
                    <option value="">— Categorize —</option>
                    <option value="interested">🔥 Interested</option>
                    <option value="follow_up">⏳ Follow Up</option>
                    <option value="not_interested">💤 Not Interested</option>
                    <option value="spam">🤖 Spam / Auto</option>
                  </select>
                )}
              </div>
            </div>

            {/* Pending approval banner */}
            {(selected.labels?.includes("pending_reply") || selected.category === "draft") && (
              <div style={{ padding: "10px 20px", background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.2)", fontSize: 12.5, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠</span>
                <span>This is an <strong>AI draft reply</strong>. Edit below and click <strong>Send Reply</strong> to send, or <strong>Discard</strong> to delete it.</span>
              </div>
            )}

            {/* Original email context panel (Pending tab only) */}
            {tab === "pending" && originalEmail && (
              <div style={{ padding: "12px 20px", background: "var(--bg-overlay)", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  📨 Original message from {displayName(originalEmail)}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 120, overflow: "auto", fontFamily: "var(--font)", whiteSpace: "pre-wrap" }}>
                  {originalEmail.preview || "No body content available."}
                </div>
              </div>
            )}

            {/* Email body */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {tab === "sent" && (
                <div style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--text-2)", whiteSpace: "pre-wrap", fontFamily: "var(--font)" }}>
                  {selected.preview || "Email content not available."}
                </div>
              )}
              {tab === "inbox" && (
                <div style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--text-2)", whiteSpace: "pre-wrap", fontFamily: "var(--font)" }}>
                  {selected.preview || "Email content not available."}
                </div>
              )}
              {tab === "pending" && (
                <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic", marginBottom: 8 }}>
                  Edit the AI draft reply in the box below before sending.
                </div>
              )}
            </div>

            {/* Reply / Send box */}
            {tab !== "sent" && (
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-1)", flexShrink: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3)", marginBottom: 8 }}>
                  {tab === "pending"
                    ? `✏ Edit draft reply → ${displayEmail(selected)}`
                    : `↩ Reply to ${displayEmail(selected)}`}
                </div>
                <textarea
                  className="input"
                  rows={tab === "pending" ? 7 : 4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={tab === "pending" ? "Edit the AI draft before sending..." : "Type your reply..."}
                  style={{ fontFamily: "var(--font)", lineHeight: 1.6, resize: "vertical" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  {tab === "pending" && (
                    <>
                      <button
                        className="btn btn-secondary"
                        onClick={handleRegenerateDraft}
                        disabled={regenerating}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {regenerating ? <><span className="spinner spinner-sm" /> Regenerating</> : "🪄 Regenerate"}
                      </button>
                      <button className="btn btn-ghost" onClick={handleDiscardDraft} style={{ color: "var(--danger)" }}>
                        🗑 Discard
                      </button>
                    </>
                  )}
                  {tab === "inbox" && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleGenerateAIDraft}
                      disabled={generatingDraft}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      {generatingDraft ? <><span className="spinner spinner-sm" /> Drafting...</> : "🪄 AI Draft"}
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleReply}
                    disabled={replying || !replyText.trim() || regenerating || generatingDraft}
                  >
                    {replying ? <><span className="spinner spinner-sm" /> Sending...</> : "↑ Send Reply"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
