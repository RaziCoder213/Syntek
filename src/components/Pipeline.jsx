import { useState, useRef, useEffect } from "react";

const DEFAULT_STAGES = ["New", "Re-research", "Researched", "Drafted", "Contacted", "Follow Up", "Opened", "Replied", "Won", "Archived"];

const STAGE_COLORS = {
  "New":          "var(--text-3)",
  "Re-research":  "#f43f5e",
  "Researched":   "var(--info)",
  "Drafted":      "var(--warning)",
  "Contacted":    "var(--brand)",
  "Follow Up":    "#8b5cf6",
  "Opened":       "var(--brand)",
  "Replied":      "var(--success)",
  "Won":          "var(--success)",
  "Archived":     "var(--text-4)",
};

function getStageFromStatus(status) {
  const map = {
    "new":           "New",
    "not contacted": "New",
    "researched":    "Researched",
    "drafted":       "Drafted",
    "contacted":     "Contacted",
    "opened":        "Opened",
    "replied":       "Replied",
    "won":           "Won",
    "interested":    "Replied",
    "not interested":"Archived",
    "no_email":      "Re-research",
    "archived":      "Archived",
  };
  return map[status?.toLowerCase()] || "New";
}

function parseBoldText(text) {
  if (!text) return "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} style={{ color: "inherit", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function formatChatMessage(content) {
  if (!content) return "";
  const blocks = content.split(/\n\n+/);
  return blocks.map((block, bIdx) => {
    const lines = block.split("\n");
    
    // Check if it's a list
    const isList = lines.length > 0 && lines.every(line => {
      const trimmed = line.trim();
      return trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^\d+\.\s/.test(trimmed);
    });
    
    if (isList) {
      return (
        <ul key={bIdx} style={{ margin: "6px 0", paddingLeft: 20, listStyleType: "disc" }}>
          {lines.map((line, lIdx) => {
            const cleanLine = line.trim().replace(/^[\*\-\d\.\s]+/, "").trim();
            return (
              <li key={lIdx} style={{ marginBottom: 4 }}>
                {parseBoldText(cleanLine)}
              </li>
            );
          })}
        </ul>
      );
    }
    
    // Check if it's a key-value detail list
    const isKeyValue = lines.length > 1 && lines.every(line => {
      const trimmed = line.trim();
      return trimmed.includes(":") && trimmed.split(":")[0].length < 35;
    });
    
    if (isKeyValue) {
      return (
        <div key={bIdx} style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0", padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "8px", border: "1px solid var(--border-3)" }}>
          {lines.map((line, lIdx) => {
            const idx = line.indexOf(":");
            const key = line.substring(0, idx).trim();
            const val = line.substring(idx + 1).trim();
            return (
              <div key={lIdx} style={{ display: "flex", fontSize: "12px", gap: 8, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: "var(--text-2)", minWidth: 80 }}>{key}:</span>
                <span style={{ color: "var(--text-1)", wordBreak: "break-all" }}>{parseBoldText(val)}</span>
              </div>
            );
          })}
        </div>
      );
    }
    
    return (
      <p key={bIdx} style={{ margin: "4px 0", lineHeight: 1.5 }}>
        {parseBoldText(block)}
      </p>
    );
  });
}

export default function Pipeline({ leads, setLeads, settings, showToast }) {
  const stages = settings.kanbanStages || DEFAULT_STAGES;
  const [dragging, setDragging] = useState(null);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [activeColumnMenu, setActiveColumnMenu] = useState(null);

  const toggleSelectLead = (id) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkMove = async (targetStage) => {
    const statusMap = {
      "New":          "not contacted",
      "Re-research":  "no_email",
      "Researched":   "researched",
      "Drafted":      "drafted",
      "Contacted":    "contacted",
      "Follow Up":    "contacted",
      "Opened":       "opened",
      "Replied":      "replied",
      "Won":          "won",
      "Archived":     "archived",
    };
    const newStatus = statusMap[targetStage] || null;

    try {
      const res = await fetch("/api/leads/bulk-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeads, status: newStatus, pipeline_stage: targetStage })
      });
      if (res.ok) {
        setLeads(prev => prev.map(l =>
          selectedLeads.includes(l.id) ? { ...l, status: newStatus || l.status, pipeline_stage: targetStage } : l
        ));
        showToast(`Successfully moved ${selectedLeads.length} leads to ${targetStage}`, "success");
        setSelectedLeads([]);
      } else {
        showToast("Failed to bulk update leads.", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error updating leads.", "danger");
    }
  };
  const [drawerLead, setDrawerLead] = useState(null);
  const [search, setSearch] = useState("");
  const dragOver = useRef(null);

  const [activeTab, setActiveTab] = useState("details");
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const fetchChatHistory = async (leadId) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (err) {
      console.error("Error fetching chat history:", err);
    }
  };

  useEffect(() => {
    if (drawerLead && activeTab === "chat") {
      fetchChatHistory(drawerLead.id);
    }
  }, [drawerLead, activeTab]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatLoading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || chatLoading || !drawerLead) return;

    const userMsg = inputText.trim();
    setInputText("");
    
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/leads/${drawerLead.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        
        if (data.action && data.actionResult) {
          showToast(`AI executed: ${data.action}`, "success");
          
          if (data.action === "UPDATE_STATUS" || data.action === "TRASH_LEAD") {
            const { status, pipeline_stage } = data.actionResult;
            setLeads(prev => prev.map(l =>
              l.id === drawerLead.id ? { ...l, status, pipeline_stage } : l
            ));
            setDrawerLead(prev => ({ ...prev, status, pipeline_stage }));
          } else if (data.action === "SEND_EMAIL") {
            setLeads(prev => prev.map(l =>
              l.id === drawerLead.id ? { ...l, status: "contacted", pipeline_stage: "Contacted" } : l
            ));
            setDrawerLead(prev => ({ ...prev, status: "contacted", pipeline_stage: "Contacted" }));
          }
        }
      } else {
        showToast("Error getting AI response", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error occurred", "danger");
    } finally {
      setChatLoading(false);
    }
  };

  /* Group leads into stages */
  const grouped = {};
  stages.forEach(s => { grouped[s] = []; });
  leads.forEach(l => {
    const stage = l.pipeline_stage || getStageFromStatus(l.status);
    if (grouped[stage]) grouped[stage].push(l);
    else grouped["New"].push(l);
  });

  const filteredGrouped = {};
  stages.forEach(s => {
    filteredGrouped[s] = search
      ? grouped[s].filter(l =>
          l.name?.toLowerCase().includes(search.toLowerCase()) ||
          l.city?.toLowerCase().includes(search.toLowerCase()) ||
          l.email?.toLowerCase().includes(search.toLowerCase())
        )
      : grouped[s];
  });

  const visibleLeads = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.name?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q)
    );
  });

  const handleSelectAll = () => {
    const allVisibleIds = visibleLeads.map(l => l.id);
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedLeads.includes(id));
    if (allSelected) {
      setSelectedLeads(prev => prev.filter(id => !allVisibleIds.includes(id)));
    } else {
      setSelectedLeads(prev => Array.from(new Set([...prev, ...allVisibleIds])));
    }
  };

  /* Drag handlers */
  const onDragStart = (e, lead) => {
    setDragging(lead);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, stage) => {
    e.preventDefault();
    dragOver.current = stage;
  };

  const onDrop = async (e, targetStage) => {
    e.preventDefault();
    if (!dragging) return;
    const currentStage = dragging.pipeline_stage || getStageFromStatus(dragging.status);
    if (currentStage === targetStage) return;

    const statusMap = {
      "New":          "not contacted",
      "Re-research":  "no_email",
      "Researched":   "researched",
      "Drafted":      "drafted",
      "Contacted":    "contacted",
      "Follow Up":    "contacted",
      "Opened":       "opened",
      "Replied":      "replied",
      "Won":          "won",
      "Archived":     "archived",
    };
    const newStatus = statusMap[targetStage] || dragging.status || "not contacted";

    try {
      await fetch(`/api/leads/${dragging.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, pipeline_stage: targetStage }),
      });
      setLeads(prev => prev.map(l =>
        l.id === dragging.id ? { ...l, status: newStatus, pipeline_stage: targetStage } : l
      ));
      showToast(`${dragging.name} moved to ${targetStage}`, "info");
    } catch {
      showToast("Failed to update lead stage.", "danger");
    }
    setDragging(null);
    dragOver.current = null;
  };

  const wsColor = { active: "badge-success", no_website: "badge-danger", down: "badge-warning" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 104px)", position: "relative" }}>
      {activeColumnMenu && (
        <div 
          style={{ position: "fixed", inset: 0, zIndex: 98, cursor: "default" }} 
          onClick={() => setActiveColumnMenu(null)}
        />
      )}
      {/* Toolbar */}
      <div className="flex-between" style={{ background: selectedLeads.length > 0 ? "rgba(108, 92, 231, 0.08)" : "transparent", padding: selectedLeads.length > 0 ? "10px 16px" : "0", borderRadius: 8, transition: "all 0.2s" }}>
        {selectedLeads.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={visibleLeads.length > 0 && visibleLeads.every(l => selectedLeads.includes(l.id))}
                onChange={handleSelectAll}
                style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--brand)" }}
              />
              Select All ({visibleLeads.length})
            </label>
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--brand)" }}>
              {selectedLeads.length} selected
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>Move to:</span>
              <select
                className="input"
                style={{ padding: "4px 8px", fontSize: 12, width: 140, height: "auto" }}
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkMove(e.target.value);
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Select stage...</option>
                {stages.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => setSelectedLeads([])}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="section-title">Pipeline</div>
            <div className="section-desc">{leads.length} leads across {stages.length} stages</div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selectedLeads.length === 0 && leads.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", cursor: "pointer", marginRight: 8 }}>
              <input
                type="checkbox"
                checked={visibleLeads.length > 0 && visibleLeads.every(l => selectedLeads.includes(l.id))}
                onChange={handleSelectAll}
                style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--brand)" }}
              />
              Select All
            </label>
          )}
          <div className="search-bar" style={{ width: 240 }}>
            <span className="search-icon">⌕</span>
            <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="kanban-board" style={{ flex: 1 }}>
        {stages.map((stage, idx) => {
          const cards = filteredGrouped[stage] || [];
          const color = STAGE_COLORS[stage] || "var(--text-3)";
          return (
            <div
              key={`${stage}-${idx}`}
              className="kanban-col"
              onDragOver={e => onDragOver(e, stage)}
              onDrop={e => onDrop(e, stage)}
              style={{ outline: dragOver.current === stage ? `2px solid var(--brand)` : undefined }}
            >
              {/* Column header */}
              <div className="kanban-col-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                  <span className="kanban-col-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage}</span>
                  <span className="kanban-col-count">{cards.length}</span>
                </div>
                
                {/* Column actions menu */}
                <div style={{ position: "relative", zIndex: 99 }}>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveColumnMenu(activeColumnMenu === stage ? null : stage);
                    }}
                    style={{ width: 22, height: 22, minWidth: 22, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-3)" }}
                    title={`${stage} Actions`}
                  >
                    ⚙
                  </button>
                  
                  {activeColumnMenu === stage && (
                    <div style={{
                      position: "absolute", top: 26, right: 0, width: 170,
                      background: "var(--bg-surface)", border: "1px solid var(--border-1)",
                      borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
                      zIndex: 100, padding: "4px 0", display: "flex", flexDirection: "column"
                    }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "8px 12px", fontSize: 11.5, textAlign: "left", justifyContent: "flex-start", borderRadius: 0, border: "none", width: "100%", cursor: "pointer", background: "transparent", color: "var(--text-1)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const cardIds = cards.map(c => c.id);
                          const allSelected = cardIds.length > 0 && cardIds.every(id => selectedLeads.includes(id));
                          if (allSelected) {
                            setSelectedLeads(prev => prev.filter(id => !cardIds.includes(id)));
                          } else {
                            setSelectedLeads(prev => Array.from(new Set([...prev, ...cardIds])));
                          }
                          setActiveColumnMenu(null);
                        }}
                      >
                        {cards.length > 0 && cards.every(c => selectedLeads.includes(c.id)) ? "☐ Deselect All" : "☑ Select All"}
                      </button>
                      
                      {cards.length > 0 && (
                        <>
                          <div style={{ height: "1px", background: "var(--border-1)", margin: "4px 0" }} />
                          <div style={{ padding: "4px 12px", fontSize: 9.5, fontWeight: 600, color: "var(--text-4)", textTransform: "uppercase" }}>Move all to:</div>
                          {stages.filter(s => s !== stage).map(targetStage => (
                            <button
                              key={targetStage}
                              className="btn btn-ghost"
                              style={{ padding: "6px 12px", fontSize: 11, textAlign: "left", justifyContent: "flex-start", borderRadius: 0, border: "none", width: "100%", cursor: "pointer", background: "transparent", color: "var(--text-2)" }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const leadIds = cards.map(c => c.id);
                                const statusMap = {
                                  "New":        "not contacted",
                                  "Researched": "researched",
                                  "Drafted":    "drafted",
                                  "Contacted":  "contacted",
                                  "Opened":     "opened",
                                  "Replied":    "replied",
                                  "Won":        "won",
                                  "Archived":   "archived",
                                };
                                const newStatus = statusMap[targetStage] || "not contacted";
                                try {
                                  const res = await fetch("/api/leads/bulk-status", {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ leadIds, status: newStatus, pipeline_stage: targetStage })
                                  });
                                  if (res.ok) {
                                    setLeads(prev => prev.map(l =>
                                      leadIds.includes(l.id) ? { ...l, status: newStatus, pipeline_stage: targetStage } : l
                                    ));
                                    showToast(`Moved all ${leadIds.length} leads in ${stage} to ${targetStage}`, "success");
                                  } else {
                                    showToast("Failed to bulk move leads.", "danger");
                                  }
                                } catch (err) {
                                  console.error(err);
                                  showToast("Network error occurred.", "danger");
                                }
                                setActiveColumnMenu(null);
                              }}
                            >
                              ➡️ {targetStage}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="kanban-col-body">
                {cards.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 12px", fontSize: 12, color: "var(--text-4)" }}>
                    Drop leads here
                  </div>
                ) : (
                  cards.map(l => (
                    <div
                      key={l.id}
                      className="kanban-card"
                      draggable
                      onDragStart={e => onDragStart(e, l)}
                      onClick={() => { setDrawerLead(l); setActiveTab("details"); }}
                      style={{ 
                        opacity: dragging?.id === l.id ? 0.5 : 1, 
                        cursor: "grab",
                        border: selectedLeads.includes(l.id) ? "1.5px solid var(--brand)" : undefined,
                        background: selectedLeads.includes(l.id) ? "rgba(108, 92, 231, 0.04)" : undefined
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(l.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectLead(l.id);
                          }}
                          style={{
                            marginTop: 3,
                            cursor: "pointer",
                            width: 14,
                            height: 14,
                            accentColor: "var(--brand)"
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="kanban-card-name" style={{ fontWeight: selectedLeads.includes(l.id) ? 600 : 500 }}>{l.name}</div>
                          <div className="kanban-card-meta">{l.type} · {l.city}</div>
                        </div>
                      </div>
                      {/* Indicators row */}
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", paddingLeft: 22 }}>
                        {l.email && <span style={{ fontSize: 10, color: "var(--success)" }}>✓ Email</span>}
                        {!l.email && <span style={{ fontSize: 10, color: "var(--warning)" }}>✕ No Email</span>}
                        {l.website_status && (
                          <span className={`badge ${wsColor[l.website_status] || "badge-neutral"}`} style={{ fontSize: 10, padding: "1px 5px" }}>
                            {l.website_status}
                          </span>
                        )}
                        {l.rating && <span style={{ fontSize: 10, color: "var(--text-4)" }}>{l.rating}⭐</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lead preview drawer (simple) */}
      {drawerLead && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 900 }}
            onClick={() => setDrawerLead(null)}
          />
          <div style={{
            position: "fixed", top: 0, right: 0, width: 380, height: "100%",
            background: "var(--bg-surface)", borderLeft: "1px solid var(--border-1)",
            zIndex: 901, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
            animation: "slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border-1)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{drawerLead.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{drawerLead.type} · {drawerLead.city}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setDrawerLead(null)}>✕</button>
            </div>
            {/* Drawer Tabs Header */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-1)", background: "var(--bg-card)" }}>
              <button 
                onClick={() => setActiveTab("details")}
                style={{
                  flex: 1, padding: "10px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                  background: activeTab === "details" ? "transparent" : "var(--bg-surface)",
                  color: activeTab === "details" ? "var(--brand)" : "var(--text-3)",
                  borderBottom: activeTab === "details" ? "2px solid var(--brand)" : "none"
                }}
              >
                ℹ Details
              </button>
              <button 
                onClick={() => setActiveTab("chat")}
                style={{
                  flex: 1, padding: "10px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                  background: activeTab === "chat" ? "transparent" : "var(--bg-surface)",
                  color: activeTab === "chat" ? "var(--brand)" : "var(--text-3)",
                  borderBottom: activeTab === "chat" ? "2px solid var(--brand)" : "none"
                }}
              >
                💬 AI Assistant
              </button>
            </div>

            {activeTab === "details" ? (
              <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Info grid */}
                {[
                  { label: "Email",   val: drawerLead.email   || "—" },
                  { label: "Phone",   val: drawerLead.phone   || "—" },
                  { label: "Rating",  val: drawerLead.rating  ? `${drawerLead.rating}⭐ (${drawerLead.reviews} reviews)` : "—" },
                  { label: "Website", val: drawerLead.website || "No website" },
                  { label: "Status",  val: drawerLead.status  || "new" },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-2)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</span>
                    <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500, textAlign: "right", maxWidth: 220, wordBreak: "break-all" }}>{val}</span>
                  </div>
                ))}

                {/* Stage mover */}
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-4)", marginBottom: 8 }}>Move to Stage</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {stages.map((s, idx) => (
                      <button
                        key={`${s}-${idx}`}
                        className={`btn btn-sm ${(drawerLead.pipeline_stage || getStageFromStatus(drawerLead.status)) === s ? "btn-primary" : "btn-secondary"}`}
                        onClick={async () => {
                          const statusMap = { "New": "not contacted", "Researched": "researched", "Drafted": "drafted", "Contacted": "contacted", "Opened": "opened", "Replied": "replied", "Won": "won", "Archived": "archived" };
                          const newStatus = statusMap[s] || drawerLead.status || "not contacted";
                          await fetch(`/api/leads/${drawerLead.id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus, pipeline_stage: s }) });
                          setLeads(prev => prev.map(l => l.id === drawerLead.id ? { ...l, status: newStatus, pipeline_stage: s } : l));
                          setDrawerLead(prev => ({ ...prev, status: newStatus, pipeline_stage: s }));
                          showToast(`Moved to ${s}`, "info");
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Autopilot Switch & Icebreaker */}
                <div style={{
                  background: "rgba(108, 92, 231, 0.04)",
                  border: "1px solid rgba(108, 92, 231, 0.15)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 8
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 5 }}>
                        🤖 AI Auto-Responder
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                        Automatically draft context-aware replies to positive responses.
                      </div>
                    </div>
                    <label className="switch" style={{ position: "relative", display: "inline-block", width: 44, height: 22 }}>
                      <input 
                        type="checkbox" 
                        checked={drawerLead.ai_enabled !== false} 
                        onChange={async (e) => {
                          const val = e.target.checked;
                          try {
                            const res = await fetch(`/api/leads/${drawerLead.id}/toggle-ai`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ai_enabled: val })
                            });
                            if (res.ok) {
                              setLeads(prev => prev.map(l => l.id === drawerLead.id ? { ...l, ai_enabled: val } : l));
                              setDrawerLead(prev => ({ ...prev, ai_enabled: val }));
                              showToast(`AI Auto-Responder ${val ? "enabled" : "disabled"}`, "success");
                            } else {
                              showToast("Failed to update AI setting", "error");
                            }
                          } catch (err) {
                            showToast("Error updating setting", "error");
                          }
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span className="slider" style={{
                        position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: drawerLead.ai_enabled !== false ? "var(--brand)" : "#ccc",
                        transition: ".4s", borderRadius: 34
                      }}>
                        <span style={{
                          position: "absolute", content: "", height: 16, width: 16, left: drawerLead.ai_enabled !== false ? 24 : 3, bottom: 3,
                          backgroundColor: "white", transition: ".4s", borderRadius: "50%"
                        }} />
                      </span>
                    </label>
                  </div>

                  {drawerLead.personalized_icebreaker && (
                    <div style={{ borderTop: "1px solid rgba(108, 92, 231, 0.1)", paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
                        ✨ AI Personalized Icebreaker
                      </div>
                      <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-1)", marginTop: 6, lineHeight: 1.4, padding: "8px 12px", background: "var(--bg-surface)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                        "{drawerLead.personalized_icebreaker}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Chat panel tab */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100% - 100px)", background: "var(--bg-surface)" }}>
                {/* Messages list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-4)", fontSize: 12, marginTop: 40, padding: 20 }}>
                      👋 Chat with this lead's AI assistant.<br/><br/>
                      Ask questions like:<br/>
                      <i>"What is this lead's business?"</i><br/>
                      Or command it:<br/>
                      <i>"Mark this lead as interested"</i><br/>
                      <i>"Email them asking for a call"</i>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div 
                        key={idx} 
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "100%"
                        }}
                      >
                        <div 
                          style={{
                            maxWidth: "85%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: 12.5,
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: msg.role === "user" ? "var(--brand)" : "var(--bg-card)",
                            color: msg.role === "user" ? "#ffffff" : "var(--text-1)",
                            border: msg.role === "user" ? "none" : "1px solid var(--border-2)",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                          }}
                        >
                          {formatChatMessage(msg.content)}
                        </div>
                        <span style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2 }}>
                          {msg.role === "user" ? "You" : "AI Assistant"}
                        </span>
                      </div>
                    ))
                  )}
                  {chatLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: 12, padding: "8px 0" }}>
                      <span className="spinner-dots" style={{ fontWeight: "bold" }}>AI Assistant is thinking...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat input box */}
                <form 
                  onSubmit={handleSendMessage} 
                  style={{
                    padding: 12, borderTop: "1px solid var(--border-1)", display: "flex", gap: 8,
                    background: "var(--bg-card)"
                  }}
                >
                  <input
                    placeholder="Ask AI or give command..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    disabled={chatLoading}
                    style={{
                      flex: 1, padding: "8px 12px", fontSize: 12.5, borderRadius: 6,
                      border: "1px solid var(--border-1)", background: "var(--bg-surface)",
                      color: "var(--text-1)", outline: "none"
                    }}
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-sm" 
                    disabled={chatLoading || !inputText.trim()}
                    style={{ padding: "0 14px", height: "auto" }}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
