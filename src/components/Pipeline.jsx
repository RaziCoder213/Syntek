import React, { useState } from "react";

const PIPELINE_COLUMNS = [
  { id: "not contacted", label: "Not Contacted", color: "var(--color-indigo)", valueMultiplier: 100 },
  { id: "contacted", label: "In Outreach", color: "var(--color-amber)", valueMultiplier: 250 },
  { id: "replied", label: "Engaged Responses", color: "var(--color-teal)", valueMultiplier: 350 },
  { id: "interested", label: "Hot Leads", color: "#06b6d4", valueMultiplier: 600 },
  { id: "meeting_booked", label: "Meeting Booked", color: "var(--color-emerald)", valueMultiplier: 850 },
  { id: "closed", label: "Closed / Signed", color: "var(--color-lime)", valueMultiplier: 1200 },
  { id: "trashed", label: "Trashed / Wrong Data", color: "var(--color-crimson)", valueMultiplier: 0 }
];

export default function Pipeline({ leads, setLeads, showToast }) {
  const [dragOverColId, setDragOverColId] = useState(null);

  const moveLeadStatus = async (leadId, newStatus) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error("Failed to update status");
      setLeads(ls => ls.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      const matchedCol = PIPELINE_COLUMNS.find(c => c.id === newStatus);
      showToast(`Successfully moved lead to ${matchedCol?.label || newStatus}!`, "success");
    } catch (err) {
      showToast("Failed to update status in database", "danger");
    }
  };
  // Drag and Drop handlers
  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData("text/plain", leadId.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    setDragOverColId(colId);
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    const leadIdStr = e.dataTransfer.getData("text/plain");
    const leadId = parseInt(leadIdStr);
    if (!isNaN(leadId)) {
      moveLeadStatus(leadId, colId);
    }
    setDragOverColId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
      
      {/* Module Title */}
      <div>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Outreach Pipeline</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Drag and drop lead cards across stages to update their automation tracks and deal estimations.
        </p>
      </div>

      {/* Kanban Board columns wrapper */}
      <div 
        style={{ 
          display: "flex", 
          gap: "16px", 
          overflowX: "auto", 
          paddingBottom: "16px",
          minHeight: "560px",
          alignItems: "flex-start" 
        }}
      >
        {PIPELINE_COLUMNS.map((col) => {
          const colLeads = leads.filter(l => l.status === col.id);
          const colEstVal = colLeads.length * col.valueMultiplier;
          const isDraggingOver = dragOverColId === col.id;

          return (
            <div 
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => setDragOverColId(null)}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{
                minWidth: "260px",
                flex: 1,
                background: isDraggingOver ? "var(--bg-translucent-mild)" : "var(--bg-translucent-subtle)",
                border: isDraggingOver ? `1px dashed ${col.color}` : "1px solid var(--border-translucent)",
                borderRadius: "14px",
                padding: "16px",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: isDraggingOver ? `0 0 16px ${col.color}15` : "none"
              }}
            >
              {/* Column Header info */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: col.color }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{col.label}</span>
                </div>
                <span className="badge" style={{ background: "var(--bg-translucent-mild)", color: "var(--text-muted)", padding: "1px 6px", borderRadius: "4px" }}>
                  {colLeads.length}
                </span>
              </div>

              {/* Column value calculation */}
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.02em", marginBottom: "16px", borderBottom: "1px solid var(--border-translucent)", paddingBottom: "6px" }}>
                Est Value: <strong style={{ color: "var(--text-primary)" }}>${colEstVal.toLocaleString()}</strong>
              </div>

              {/* Cards Container */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: "380px" }}>
                {colLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    style={{
                      background: "var(--bg-card)",
                      border: "var(--border-subtle)",
                      borderRadius: "10px",
                      padding: "14px",
                      cursor: "grab",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = col.color;
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{lead.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{lead.type} · {lead.city}</div>
                      {lead.website_status && (
                        <div style={{ marginTop: "4px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {lead.website_status === "no_website" && (
                            <span className="badge" style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--color-crimson)", textTransform: "none", fontSize: "9px", padding: "1px 6px", border: "1px solid rgba(239,68,68,0.2)" }}>
                              🚫 No Website
                            </span>
                          )}
                          {lead.website_status === "down" && (
                            <span className="badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--color-amber)", textTransform: "none", fontSize: "9px", padding: "1px 6px", border: "1px solid rgba(245,158,11,0.2)" }}>
                              ⚠️ Site Down
                            </span>
                          )}
                          {lead.website_status === "active" && lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--color-emerald)", textTransform: "none", fontSize: "9px", padding: "1px 6px", textDecoration: "underline", display: "inline-flex", cursor: "pointer", border: "1px solid rgba(16,185,129,0.2)" }}>
                              🌐 Active Website
                            </a>
                          )}
                          {lead.is_opened && (
                            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--color-emerald)", textTransform: "none", fontSize: "9px", padding: "1px 6px", border: "1px solid rgba(16,185,129,0.2)" }}>
                              ✉️ Opened
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--color-amber)", fontWeight: 700 }}>★ {lead.rating}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{lead.reviews} reviews</span>
                    </div>

                    {/* Quick Move Trigger buttons */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", borderTop: "1px solid var(--border-translucent)", paddingTop: "8px", marginTop: "4px" }}>
                      {PIPELINE_COLUMNS.filter(c => c.id !== col.id).map((targetCol) => (
                        <button
                          key={targetCol.id}
                          onClick={() => moveLeadStatus(lead.id, targetCol.id)}
                          style={{
                            background: "var(--bg-translucent-subtle)",
                            border: "1px solid var(--border-translucent)",
                            color: "var(--text-secondary)",
                            fontSize: "9px",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontWeight: 600,
                            transition: "all 0.15s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = targetCol.color;
                            e.currentTarget.style.background = "var(--bg-translucent-mild)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-secondary)";
                            e.currentTarget.style.background = "var(--bg-translucent-subtle)";
                          }}
                        >
                          → {targetCol.label.split(" ")[0]}
                        </button>
                      ))}
                    </div>

                  </div>
                ))}
                {colLeads.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", padding: "40px 10px", border: "1px dashed var(--border-translucent)", borderRadius: "8px" }}>
                    Drop cards here
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
