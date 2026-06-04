import React, { useState } from "react";

export default function Inbox({ leads, setLeads, emails, setEmails, showToast, geminiKey, gmailUser, gmailPass }) {
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailFilter, setEmailFilter] = useState("all");
  const [replyText, setReplyText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncMailbox = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/emails/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to sync inbox");
      }
      
      showToast(data.message || `Inbox synced successfully!`, "success");
      
      // Refresh emails list
      const emailsRes = await fetch("/api/emails");
      if (emailsRes.ok) {
        const emailData = await emailsRes.json();
        const mapped = emailData.map(e => ({
          id: e.id,
          from: e.from_name,
          email: e.from_email,
          company: e.company,
          subject: e.subject,
          preview: e.preview,
          time: e.time_received,
          read: e.is_read,
          category: e.category,
          labels: e.labels || []
        }));
        setEmails(mapped);
      }
      
      // Refresh leads list
      const leadsRes = await fetch("/api/leads");
      if (leadsRes.ok) {
        const latestLeads = await leadsRes.json();
        const parsed = latestLeads.map(l => ({
          ...l,
          rating: l.rating ? parseFloat(l.rating) : 4.0,
          reviews: l.reviews ? parseInt(l.reviews) : 0
        }));
        setLeads(parsed);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to sync inbox", "danger");
    } finally {
      setSyncing(false);
    }
  };

  const [threadWidth, setThreadWidth] = useState(360);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const startResizeSidebar = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    
    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(160, Math.min(400, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startResizeThread = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = threadWidth;
    
    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(240, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      setThreadWidth(newWidth);
    };
    
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Filter messages based on side-bar clicks
  const filteredEmails = emails.filter(email => {
    if (emailFilter === "all") return true;
    if (emailFilter === "unread") return !email.read && email.category !== "sent";
    if (emailFilter === "interested") return email.category === "interested" || email.labels.includes("hot-lead");
    if (emailFilter === "not-interested") return email.category === "not-interested";
    if (emailFilter === "sent") return email.category === "sent" || email.labels.includes("sent");
    return true;
  });

  const getLabelStyle = (label) => {
    switch (label) {
      case "hot-lead":
        return { bg: "rgba(239, 68, 68, 0.1)", text: "var(--color-crimson)", border: "rgba(239, 68, 68, 0.25)" };
      case "demo-requested":
        return { bg: "rgba(200, 255, 0, 0.1)", text: "var(--color-lime)", border: "rgba(200, 255, 0, 0.25)" };
      case "follow-up":
        return { bg: "rgba(245, 158, 11, 0.1)", text: "var(--color-amber)", border: "rgba(245, 158, 11, 0.25)" };
      default:
        return { bg: "rgba(255, 255, 255, 0.05)", text: "var(--text-secondary)", border: "rgba(255,255,255,0.1)" };
    }
  };

  // Generate Smart Reply with Gemini API or fallback simulator
  const generateSmartReply = async (email) => {
    setAiLoading(true);
    setReplyText("");

    try {
      const response = await fetch(`/api/emails/${email.id}/generate-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate smart reply");
      }
      setReplyText(data.replyText);
      showToast("AI Smart Reply generated!", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not generate reply using API. Using local draft.", "warn");
      setReplyText(`Hi ${email.from.split(" ")[0]},\n\nThanks for getting back to me! I'd love to jump on a quick 10-minute call to answer any questions you have and demonstrate our AI reservation assistant.\n\nAre you free this Thursday around 11:00 AM?\n\nBest,\nMuhammad Razi\nIndependent Developer`);
    } finally {
      setAiLoading(false);
    }
  };

  const sendEmailReply = async () => {
    if (!replyText.trim()) return;
    try {
      const response = await fetch(`/api/emails/${selectedEmail.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText, gmailUser, gmailPass })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send reply");
      }
      
      if (gmailUser && gmailPass) {
        showToast("Smart reply successfully sent through secure SMTP!", "success");
      } else {
        showToast("Simulated reply processed successfully!", "success");
      }
      
      // Refresh emails and leads in the parent component
      const emailsRes = await fetch("/api/emails");
      if (emailsRes.ok) {
        const data = await emailsRes.json();
        const mapped = data.map(e => ({
          id: e.id,
          from: e.from_name,
          email: e.from_email,
          company: e.company,
          subject: e.subject,
          preview: e.preview,
          time: e.time_received,
          read: e.is_read,
          category: e.category,
          labels: e.labels || []
        }));
        setEmails(mapped);
      }
      
      const leadsRes = await fetch("/api/leads");
      if (leadsRes.ok) {
        const latestLeads = await leadsRes.json();
        const parsed = latestLeads.map(l => ({
          ...l,
          rating: l.rating ? parseFloat(l.rating) : 4.0,
          reviews: l.reviews ? parseInt(l.reviews) : 0
        }));
        setLeads(parsed);
      }
      
      setReplyText("");
      setSelectedEmail(null);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to send reply to backend", "danger");
    }
  };

  const tagEmailCategory = async (cat) => {
    if (!selectedEmail) return;
    const newLabels = [...new Set([...selectedEmail.labels, cat])];
    try {
      const emailRes = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, labels: newLabels })
      });
      if (!emailRes.ok) throw new Error("Failed to update email category");
      
      setEmails(es => es.map(e => e.id === selectedEmail.id ? { ...e, category: cat, labels: newLabels } : e));
      setSelectedEmail(prev => ({ ...prev, category: cat, labels: newLabels }));

      // Promote the lead in the Leads Database
      const matchedLead = leads.find(l => 
        l.name.toLowerCase().includes(selectedEmail.company.toLowerCase()) || 
        selectedEmail.email.includes(l.email)
      );

      if (matchedLead) {
        const leadRes = await fetch(`/api/leads/${matchedLead.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: cat })
        });
        if (!leadRes.ok) throw new Error("Failed to update lead status");
        
        setLeads(ls => ls.map(l => l.id === matchedLead.id ? { ...l, status: cat } : l));
        showToast(`Automatically updated ${matchedLead.name}'s status to ${cat.toUpperCase()} in pipeline!`, "success");
      } else {
        showToast(`Categorized email as ${cat.toUpperCase()}`, "info");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save email category tagging", "danger");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {/* Horizontal Folders nav visible on <= 1024px */}
      <div className="inbox-folders-horizontal">
        {[
          { id: "all", label: "All Threads", count: emails.length },
          { id: "unread", label: "Unread", count: emails.filter(e => !e.read && e.category !== "sent").length, color: "var(--color-lime)" },
          { id: "interested", label: "Leads", count: emails.filter(e => e.category === "interested" || e.labels.includes("hot-lead")).length, color: "var(--color-emerald)" },
          { id: "not-interested", label: "Not Interested", count: emails.filter(e => e.category === "not-interested").length, color: "var(--text-muted)" },
          { id: "sent", label: "Sent Outreach", count: emails.filter(e => e.category === "sent" || e.labels.includes("sent")).length, color: "var(--color-indigo)" }
        ].map((folder) => (
          <button
            key={folder.id}
            onClick={() => { setEmailFilter(folder.id); setSelectedEmail(null); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: emailFilter === folder.id ? "var(--bg-translucent-strong)" : "transparent",
              border: "none",
              color: emailFilter === folder.id ? "var(--color-lime)" : "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: emailFilter === folder.id ? 700 : 500,
              padding: "8px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            <span>{folder.label}</span>
            {folder.count > 0 && (
              <span className="badge" style={{
                background: folder.color ? `${folder.color}15` : "var(--bg-translucent-mild)",
                color: folder.color || "var(--text-muted)",
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "3px"
              }}>{folder.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className={`inbox-layout ${selectedEmail ? 'show-detail' : 'show-list'}`}>
        
        {/* 1. Inbox sidebar folders - visible on desktop */}
        <div 
          className="glass-panel inbox-sidebar-vertical" 
          style={{ 
            width: sidebarCollapsed ? "0px" : `${sidebarWidth}px`, 
            display: sidebarCollapsed ? "none" : "flex", 
            flexDirection: "column", 
            gap: "16px", 
            padding: sidebarCollapsed ? "0px" : "16px", 
            overflow: "hidden" 
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", paddingLeft: "8px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Inbox</h3>
            <button 
              onClick={() => setSidebarCollapsed(true)} 
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "12px",
                padding: "4px"
              }}
              title="Collapse Folders"
            >
              ◀
            </button>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              { id: "all", label: "All Threads", count: emails.length },
              { id: "unread", label: "Unread Replies", count: emails.filter(e => !e.read && e.category !== "sent").length, color: "var(--color-lime)" },
              { id: "interested", label: "Interested / Leads", count: emails.filter(e => e.category === "interested" || e.labels.includes("hot-lead")).length, color: "var(--color-emerald)" },
              { id: "not-interested", label: "Not Interested", count: emails.filter(e => e.category === "not-interested").length, color: "var(--text-muted)" },
              { id: "sent", label: "Sent Outreach", count: emails.filter(e => e.category === "sent" || e.labels.includes("sent")).length, color: "var(--color-indigo)" }
            ].map((folder) => (
              <button
                key={folder.id}
                onClick={() => { setEmailFilter(folder.id); setSelectedEmail(null); }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: emailFilter === folder.id ? "var(--bg-translucent-mild)" : "transparent",
                  border: "none",
                  color: emailFilter === folder.id ? "var(--color-lime)" : "var(--text-secondary)",
                  fontSize: "13px",
                  fontWeight: emailFilter === folder.id ? 700 : 500,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s"
                }}
              >
                <span>{folder.label}</span>
                {folder.count > 0 && (
                  <span 
                    className="badge" 
                    style={{ 
                      background: folder.color ? `${folder.color}15` : "var(--bg-translucent-mild)", 
                      color: folder.color || "var(--text-muted)",
                      padding: "2px 6px",
                      borderRadius: "4px"
                    }}
                  >
                    {folder.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {!sidebarCollapsed && (
          <div 
            onMouseDown={startResizeSidebar}
            className="inbox-resizer"
            style={{
              width: "4px",
              cursor: "col-resize",
              background: "var(--bg-translucent-mild)",
              transition: "background 0.2s",
              alignSelf: "stretch",
              zIndex: 10,
              margin: "0 -2px",
              position: "relative"
            }}
            onMouseEnter={(e) => e.target.style.background = "var(--color-lime)"}
            onMouseLeave={(e) => e.target.style.background = "var(--bg-translucent-mild)"}
          />
        )}

        {/* 2. Middle Pane: Email Thread List */}
        <div className="glass-panel inbox-list-pane" style={{ width: `${threadWidth}px`, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "12px" }}>
            {sidebarCollapsed && (
              <button 
                onClick={() => setSidebarCollapsed(false)}
                className="btn btn-outline btn-sm"
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                ▶ Folders
              </button>
            )}
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>Outreach Responses</h4>
            <button
              onClick={syncMailbox}
              disabled={syncing}
              className="btn btn-outline btn-sm"
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              {syncing ? "Syncing..." : "🔄 Sync Inbox"}
            </button>
          </div>
          
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredEmails.map((email) => {
              const isSelected = selectedEmail?.id === email.id;
              const matchedLead = leads.find(l => l.email && l.email.toLowerCase() === email.email?.toLowerCase());
              return (
                <div
                  key={email.id}
                  onClick={async () => {
                    setSelectedEmail(email);
                    if (!email.read) {
                      try {
                        const response = await fetch(`/api/emails/${email.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_read: true })
                        });
                        if (response.ok) {
                          setEmails(es => es.map(e => e.id === email.id ? { ...e, read: true } : e));
                        }
                      } catch (err) {
                        console.error("Failed to mark email as read on server:", err);
                      }
                    }
                  }}
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    cursor: "pointer",
                    background: isSelected ? "rgba(99, 102, 241, 0.05)" : email.read ? "transparent" : "rgba(200, 255, 0, 0.01)",
                    borderLeft: isSelected ? "4px solid var(--color-lime)" : "4px solid transparent",
                    transition: "background 0.2s"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13px", fontWeight: email.read ? 600 : 800, color: email.read ? "var(--text-secondary)" : "var(--text-primary)" }}>
                      {email.from}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{email.time}</span>
                  </div>
                  
                  <div style={{ fontSize: "12px", fontWeight: email.read ? 500 : 700, color: email.read ? "var(--text-secondary)" : "var(--color-lime)", marginBottom: "4px" }}>
                    {email.subject}
                  </div>
                  
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineClamp: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {email.preview}
                  </div>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                    {email.labels.map(l => (
                      <span 
                        key={l}
                        className="badge" 
                        style={{ 
                          fontSize: "9px", 
                          backgroundColor: getLabelStyle(l).bg, 
                          color: getLabelStyle(l).text, 
                          border: `1px solid ${getLabelStyle(l).border}`,
                          padding: "1px 6px"
                        }}
                      >
                        {l}
                      </span>
                    ))}
                    {matchedLead && (
                      <span 
                        className="badge" 
                        style={{ 
                          fontSize: "9px", 
                          backgroundColor: matchedLead.is_opened ? "rgba(16, 185, 129, 0.12)" : "var(--bg-translucent-mild)", 
                          color: matchedLead.is_opened ? "var(--color-emerald)" : "var(--text-muted)", 
                          border: matchedLead.is_opened ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid var(--border-translucent)",
                          padding: "1px 6px",
                          fontWeight: matchedLead.is_opened ? 700 : 500
                        }}
                      >
                        {matchedLead.is_opened ? "✉️ Opened" : "✉️ Not Opened"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredEmails.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", padding: "40px 20px" }}>
                No messages found under this filter.
              </div>
            )}
          </div>
        </div>

        <div 
          onMouseDown={startResizeThread}
          className="inbox-resizer"
          style={{
            width: "4px",
            cursor: "col-resize",
            background: "var(--bg-translucent-mild)",
            transition: "background 0.2s",
            alignSelf: "stretch",
            zIndex: 10,
            margin: "0 -2px",
            position: "relative"
          }}
          onMouseEnter={(e) => e.target.style.background = "var(--color-lime)"}
          onMouseLeave={(e) => e.target.style.background = "var(--bg-translucent-mild)"}
        />

        {/* 3. Right Pane: Reading Thread & Composer */}
        <div className="glass-panel inbox-detail-pane" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          {selectedEmail ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              
              {/* Header info */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: "12px" }}>
                <button 
                  onClick={() => setSelectedEmail(null)}
                  className="btn btn-outline btn-sm mobile-back-btn"
                  style={{ display: "none", alignItems: "center", gap: "6px", alignSelf: "flex-start" }}
                >
                  ← Back to List
                </button>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{selectedEmail.subject}</h3>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        From: <strong style={{ color: "var(--text-primary)" }}>{selectedEmail.from}</strong> ({selectedEmail.email})
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>·</span>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        Company: <strong style={{ color: "var(--color-lime)" }}>{selectedEmail.company}</strong>
                      </span>
                      {(() => {
                        const matchedLead = leads.find(l => 
                          (selectedEmail.email && l.email && selectedEmail.email.includes(l.email)) ||
                          (selectedEmail.company && l.name && l.name.toLowerCase().includes(selectedEmail.company.toLowerCase()))
                        );
                        if (!matchedLead) return null;
                        return (
                          <>
                            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>·</span>
                            <span className="badge" style={{ 
                              fontSize: "10px", 
                              backgroundColor: matchedLead.is_opened ? "rgba(16, 185, 129, 0.12)" : "var(--bg-translucent-mild)", 
                              color: matchedLead.is_opened ? "var(--color-emerald)" : "var(--text-muted)", 
                              border: matchedLead.is_opened ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid var(--border-translucent)",
                              padding: "2px 8px",
                              fontWeight: matchedLead.is_opened ? 700 : 500
                            }}>
                              {matchedLead.is_opened ? "✉️ Opened" : "✉️ Not Opened"}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{selectedEmail.time}</span>
                </div>
              </div>

              {/* Content pane */}
              <div style={{ flex: 1, padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Customer message bubble */}
                <div style={{ background: "var(--bg-translucent-subtle)", border: "var(--border-subtle)", borderRadius: "12px", padding: "20px", position: "relative" }}>
                  <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: "1.7", whiteSpace: "pre-line" }}>
                    {selectedEmail.preview}
                  </p>
                </div>

                {/* AI Autopilot control panel */}
                {(() => {
                  const matchedLead = leads.find(l => 
                    (selectedEmail.company && l.name && l.name.toLowerCase().includes(selectedEmail.company.toLowerCase())) || 
                    (selectedEmail.email && l.email && selectedEmail.email.includes(l.email))
                  );
                  if (!matchedLead) return null;
                  return (
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "12px 18px", 
                      background: "var(--bg-translucent-subtle)", 
                      borderRadius: "10px", 
                      border: "var(--border-subtle)", 
                      marginTop: "-12px",
                      animation: "fadeIn 0.2s" 
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "18px" }}>🤖</span>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>AI Autopilot Responder</div>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Auto-reply to incoming emails for this lead</div>
                        </div>
                      </div>
                      <button 
                        className={`btn btn-sm ${matchedLead.ai_enabled ? "btn-lime" : "btn-outline"}`}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/leads/${matchedLead.id}/toggle-ai`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ai_enabled: !matchedLead.ai_enabled })
                            });
                            if (!res.ok) throw new Error();
                            const updated = await res.json();
                            setLeads(ls => ls.map(l => l.id === matchedLead.id ? { ...l, ai_enabled: updated.ai_enabled } : l));
                            showToast(`AI Autopilot ${updated.ai_enabled ? 'enabled' : 'disabled'} for ${matchedLead.name}`, "success");
                          } catch (e) {
                            showToast("Failed to toggle AI Autopilot status", "danger");
                          }
                        }}
                      >
                        {matchedLead.ai_enabled ? "Active" : "Paused"}
                      </button>
                    </div>
                  );
                })()}

                {/* Categorize actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Tag & Promote:</span>
                  <button className="btn btn-outline btn-sm" onClick={() => tagEmailCategory("interested")} style={{ borderColor: "rgba(16, 185, 129, 0.4)", color: "var(--color-emerald)" }}>
                    Interested 🎯
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => tagEmailCategory("follow-up")} style={{ borderColor: "rgba(245, 158, 11, 0.4)", color: "var(--color-amber)" }}>
                    Follow Up ⏳
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => tagEmailCategory("not-interested")} style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "var(--color-crimson)" }}>
                    Not Interested
                  </button>
                </div>

                {/* AI Reply generator & composer */}
                <div className="glass-panel" style={{ padding: "16px", background: "rgba(99, 102, 241, 0.02)", borderColor: "rgba(99, 102, 241, 0.15)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Draft Smart Reply</h4>
                    
                    <button 
                      className="btn btn-indigo btn-sm" 
                      onClick={() => {
                        if (selectedEmail.category === "not-interested") {
                          showToast("AI Smart Reply is disabled for 'Not Interested' leads.", "warn");
                          return;
                        }
                        generateSmartReply(selectedEmail);
                      }}
                      disabled={aiLoading || selectedEmail.category === "not-interested"}
                    >
                      {aiLoading ? "✨ Gemini composing..." : "✨ Gemini Smart Reply"}
                    </button>
                  </div>

                  <textarea
                    className="input-field"
                    style={{ minHeight: "130px", fontFamily: "var(--font-sans)", lineHeight: "1.6", background: "#060608" }}
                    placeholder="Enter your reply draft here or use Gemini Smart Reply to brainstorm details..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />

                  {replyText && (
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px", animation: "fadeIn 0.2s" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setReplyText("")}>Discard</button>
                      <button className="btn btn-lime btn-sm" onClick={sendEmailReply}>📧 Send SMTP Reply</button>
                    </div>
                  )}
                </div>

              </div>

            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "14px", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "28px" }}>📧</span>
              Select an outreach response thread from the list to reply
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
