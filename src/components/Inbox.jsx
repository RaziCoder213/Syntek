import { useState, useEffect } from "react";

const TABS = [
  { id: "inbox",   label: "📬 Inbox"   },
  { id: "pending", label: "⏳ Pending Replies" },
  { id: "sent",    label: "📤 Sent"    },
];

export default function Inbox({ emails, setEmails, settings, showToast, refreshData }) {
  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState("inbox");
  const [search, setSearch]       = useState("");
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying]   = useState(false);
  const [sending, setSending]     = useState(false);   // for pending-reply approval
  const [syncing, setSyncing]     = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [openFilter, setOpenFilter] = useState("all");
  const [tagFilter, setTagFilter]   = useState("all");

  const handleClearInbox = async () => {
    if (!window.confirm("Are you sure you want to delete all emails? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/emails", { method: "DELETE" });
      if (res.ok) {
        setEmails([]);
        setSelected(null);
        showToast("Inbox cleared successfully.", "success");
      } else {
        showToast("Failed to clear inbox.", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error clearing inbox.", "danger");
    }
  };

  const triggerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/emails/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.newReplies > 0) {
          showToast(`Synced! Found ${data.newReplies} new replies.`, "success");
        }
        if (typeof refreshData === "function") {
          await refreshData();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Sync warning: ${err.error || "Mailbox sync completed."}`, "warning");
      }
    } catch (err) {
      console.error("Sync failed:", err);
      showToast("Network error syncing mailbox.", "danger");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    triggerSync();
  }, []);

  /* ── Filter helpers ── */
  const inboxEmails   = emails.filter(e => e.labels?.includes("inbox") || e.category === "unread");
  const pendingEmails = emails.filter(e => e.labels?.includes("pending_reply") || e.category === "draft");
  const sentEmails    = emails.filter(e => e.labels?.includes("sent")  || e.category === "sent");

  const tabMap = { inbox: inboxEmails, pending: pendingEmails, sent: sentEmails };

  const filtered = (tabMap[tab] || []).filter(e => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const matchesSearch =
        (e.from_name  || e.from  || "").toLowerCase().includes(q) ||
        (e.company    || "").toLowerCase().includes(q) ||
        (e.subject    || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    // Open/Unopened filter — sent tab = did lead open our email, inbox tab = did we read it
    if (openFilter === "opened") {
      if (tab === "sent") {
        if (!e.lead_is_opened) return false;
      } else {
        if (!e.is_read && !e.read) return false;
      }
    } else if (openFilter === "unopened") {
      if (tab === "sent") {
        if (e.lead_is_opened) return false;
      } else {
        if (e.is_read || e.read) return false;
      }
    }

    // Tag/label filter
    if (tagFilter !== "all") {
      const labels = Array.isArray(e.labels) ? e.labels : [];
      if (tagFilter === "bounced")  return labels.includes("bounced");
      if (tagFilter === "replied")  return labels.includes("replied");
      if (tagFilter === "no_tag")   return labels.length === 0;
    }

    return true;
  });

  const unreadCount   = inboxEmails.filter(e => !e.is_read && !e.read).length;
  const pendingCount  = pendingEmails.length;

  /* ── Actions ── */
  async function markRead(email) {
    if (email.is_read || email.read) return;
    try {
      await fetch(`/api/emails/${email.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      });
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true, read: true } : e));
    } catch { /* silent */ }
  }

  async function handleSelect(email) {
    setSelected(email);
    setReplyText(tab === "pending" ? (email.preview || "") : "");
    await markRead(email);
  }

  async function handleReply() {
    if (!replyText.trim() || !selected) return;
    if (!settings?.gmailUser) { showToast("Gmail not connected.", "danger"); return; }
    setReplying(true);
    try {
      const toEmail = selected.from_email || selected.email;
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmailUser: settings.gmailUser,
          gmailPass: settings.gmailPass,
          to: toEmail,
          subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`,
          body: replyText,
          draftId: tab === "pending" ? selected.id : null,
        }),
      });
      if (res.ok) {
        showToast("Reply sent! ✓", "success");
        setReplyText("");
        // Remove from pending if it was a draft
        if (tab === "pending") {
          setEmails(prev => prev.filter(e => e.id !== selected.id));
          setSelected(null);
        }
      } else {
        showToast("Failed to send reply.", "danger");
      }
    } catch { showToast("Network error.", "danger"); }
    finally { setReplying(false); }
  }

  async function handleDiscardDraft() {
    if (!selected) return;
    try {
      await fetch(`/api/emails/${selected.id}`, { method: "DELETE" });
      setEmails(prev => prev.filter(e => e.id !== selected.id));
      setSelected(null);
      showToast("Draft discarded.", "info");
    } catch { showToast("Failed to discard.", "danger"); }
  }

  async function handleRegenerateDraft() {
    if (!selected || regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/emails/${selected.id}/generate-reply`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.replyText);
        setEmails(prev => prev.map(e => e.id === selected.id ? { ...e, preview: data.replyText } : e));
        showToast("Draft reply regenerated! ✨", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Regeneration failed: ${err.error || "Unknown error"}`, "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error regenerating draft.", "danger");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleMarkCategory(emailId, cat) {
    try {
      await fetch(`/api/emails/${emailId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat }),
      });
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, category: cat } : e));
      showToast(`Marked as ${cat}`, "success");
    } catch { showToast("Failed to update.", "danger"); }
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (isNaN(d)) return ts; // fallback if it's already a formatted string
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000)   return "Just now";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  const catBadge = {
    interested:     "badge-success",
    not_interested: "badge-danger",
    follow_up:      "badge-warning",
    spam:           "badge-neutral",
  };

  const displayName = (e) => e.from_name || e.from || e.company || "Unknown";
  const displayEmail = (e) => e.from_email || e.email || "";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 104px)", gap: 16 }}>

      {/* ── Left panel ── */}
      <div style={{ width: 320, minWidth: 320, display: "flex", flexDirection: "column", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", overflow: "hidden" }}>

        {/* Sync header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-1)", background: "var(--bg-card)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Smart Inbox</span>
          <button 
            className="btn btn-ghost btn-sm" 
            disabled={syncing} 
            onClick={triggerSync}
            style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px", cursor: "pointer" }}
          >
            {syncing ? <><span className="spinner spinner-sm" /> Syncing</> : "🔄 Sync"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-1)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null); setOpenFilter("all"); setTagFilter("all"); }}
              style={{
                flex: 1, padding: "10px 4px", fontSize: 11.5, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? "var(--brand-subtle)" : "transparent",
                color: tab === t.id ? "var(--brand)" : "var(--text-3)",
                border: "none", borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s", position: "relative",
              }}
            >
              {t.label}
              {t.id === "inbox" && unreadCount > 0 && (
                <span className="badge badge-brand" style={{ position: "absolute", top: 4, right: 4, fontSize: 9, padding: "1px 5px" }}>{unreadCount}</span>
              )}
              {t.id === "pending" && pendingCount > 0 && (
                <span className="badge badge-warning" style={{ position: "absolute", top: 4, right: 4, fontSize: 9, padding: "1px 5px" }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search & Filters */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-1)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="search-bar" style={{ flex: 1 }}>
              <span className="search-icon">⌕</span>
              <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {tab !== "pending" && (
              <select
                className="input"
                style={{ width: 110, padding: "0 8px", fontSize: 11.5, height: "auto", background: "var(--bg-surface)", border: "1px solid var(--border-1)" }}
                value={openFilter}
                onChange={e => setOpenFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="opened">{tab === "sent" ? "👁 Opened" : "✓ Read"}</option>
                <option value="unopened">{tab === "sent" ? "✉ Unopened" : "✉ Unread"}</option>
              </select>
            )}
            <select
              className="input"
              style={{ width: 110, padding: "0 8px", fontSize: 11.5, height: "auto", background: "var(--bg-surface)", border: "1px solid var(--border-1)" }}
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            >
              <option value="all">All Tags</option>
              <option value="replied">✅ Replied</option>
              <option value="bounced">🚫 Bounced</option>
              <option value="no_tag">🏷 No Tag</option>
            </select>
          </div>
          {(tab === "inbox" || tab === "sent") && emails.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button 
                onClick={handleClearInbox}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: 10.5,
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
                className="btn-ghost"
              >
                🗑 Clear Inbox
              </button>
            </div>
          )}
        </div>

        {/* Pending banner */}
        {tab === "pending" && pendingCount > 0 && (
          <div style={{ padding: "8px 12px", background: "rgba(234,179,8,0.12)", borderBottom: "1px solid rgba(234,179,8,0.25)", fontSize: 11.5, color: "#ca8a04", lineHeight: 1.5 }}>
            ⚠ AI draft replies — review and click <strong>Send</strong> to approve. Nothing is sent automatically.
          </div>
        )}

        {/* Email list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-state-icon">✉</div>
              <div className="empty-state-title">
                {tab === "inbox"   ? "No replies yet"      :
                 tab === "pending" ? "No pending drafts"   : "No sent emails"}
              </div>
              <div className="empty-state-desc">
                {tab === "inbox"   ? "Replies from leads will appear here when they respond." :
                 tab === "pending" ? "AI draft suggestions will appear here for your approval." :
                 "Emails you send will appear here."}
              </div>
            </div>
          ) : (
            filtered.map(email => {
              const isUnread = !email.is_read && !email.read;
              const isPending = email.labels?.includes("pending_reply") || email.category === "draft";
              return (
                <div
                  key={email.id}
                  onClick={() => handleSelect(email)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-2)",
                    cursor: "pointer",
                    background: selected?.id === email.id
                      ? "var(--brand-subtle)"
                      : isUnread ? "var(--bg-overlay)" : "transparent",
                    transition: "background 0.1s",
                    borderLeft: isPending ? "3px solid #eab308" : isUnread ? "3px solid var(--brand)" : "3px solid transparent",
                  }}
                >
                  <div className="flex-between" style={{ marginBottom: 3 }}>
                    <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: 13, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName(email)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-4)", flexShrink: 0, marginLeft: 8 }}>
                      {formatTime(email.time_received || email.time)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email.subject || "(no subject)"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email.preview || ""}
                  </div>
                  {isPending && (
                    <div style={{ marginTop: 5 }}>
                      <span style={{ fontSize: 10, background: "rgba(234,179,8,0.2)", color: "#ca8a04", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>DRAFT · Needs Approval</span>
                    </div>
                  )}
                  {email.category && !isPending && (
                    <div style={{ marginTop: 6 }}>
                      <span className={`badge ${catBadge[email.category] || "badge-neutral"}`} style={{ fontSize: 10 }}>
                        {email.category?.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  {tab === "sent" && (
                    <div style={{ marginTop: 6 }}>
                      {email.lead_is_opened ? (
                        <span className="badge badge-success" style={{ fontSize: 10 }}>
                          👁 Opened
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          ✉ Sent (Unopened)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", overflow: "hidden" }}>
        {!selected ? (
          <div className="empty-state" style={{ height: "100%" }}>
            <div className="empty-state-icon">✉</div>
            <div className="empty-state-title">Select an email</div>
            <div className="empty-state-desc">
              {tab === "pending"
                ? "Select a draft to review the AI suggestion and send it yourself."
                : "Click an email to read it and reply."}
            </div>
          </div>
        ) : (
          <>
            {/* Email header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-1)" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 6 }}>
                {selected.subject || "(no subject)"}
              </div>
              <div className="flex-between">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--brand-subtle)", border: "1px solid var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
                    {displayName(selected)[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{displayName(selected)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
                      {displayEmail(selected)}
                      {tab === "sent" && (
                        selected.lead_is_opened ? (
                          <span className="badge badge-success" style={{ fontSize: 10, padding: "1px 5px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            👁 Opened
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: 10, padding: "1px 5px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            ✉ Sent (Unopened)
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
                {/* Only show category picker for inbox emails */}
                {tab === "inbox" && (
                  <select
                    className="input input-sm"
                    style={{ width: 160 }}
                    value={selected.category || ""}
                    onChange={e => { handleMarkCategory(selected.id, e.target.value); setSelected(prev => ({ ...prev, category: e.target.value })); }}
                  >
                    <option value="">— Categorize —</option>
                    <option value="interested">Interested</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="spam">Spam</option>
                  </select>
                )}
              </div>
            </div>

            {/* Pending approval banner */}
            {(selected.labels?.includes("pending_reply") || selected.category === "draft") && (
              <div style={{ padding: "10px 20px", background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.2)", fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠</span>
                <span>This is an <strong>AI draft reply</strong>. Edit it below and click <strong>Send Reply</strong> to send it. Or click <strong>Discard</strong> to delete it.</span>
              </div>
            )}

            {/* Email body */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-2)", whiteSpace: "pre-wrap", fontFamily: "var(--font)" }}>
                {tab === "sent"
                  ? (selected.preview || "Email content not available.")
                  : (tab === "pending"
                    ? null  // body shown in textarea below for editing
                    : (selected.preview || "Email content not available.")
                  )
                }
              </div>
            </div>

            {/* Reply / send box — hidden for sent tab */}
            {tab !== "sent" && (
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-1)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 8 }}>
                  {tab === "pending" ? `✏ Edit draft reply to ${displayEmail(selected)}` : `Reply to ${displayEmail(selected)}`}
                </div>
                <textarea
                  className="input"
                  rows={tab === "pending" ? 6 : 4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={tab === "pending" ? "Edit the AI draft before sending..." : "Type your reply..."}
                  style={{ fontFamily: "var(--font)", lineHeight: 1.6 }}
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
                  <button className="btn btn-primary" onClick={handleReply} disabled={replying || !replyText.trim() || regenerating}>
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
