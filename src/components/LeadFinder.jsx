import React, { useState, useEffect } from "react";

const SIMULATED_SCAN_LOGS = [
  { type: "info", text: "Initializing Syntek Scraping Engine v3.2.1..." },
  { type: "info", text: "Authenticating API tokens for Google Place API & Yelp Fusion..." },
  { type: "success", text: "Connection established with search clusters: [US-EAST, US-WEST]" },
  { type: "accent", text: "Target Search: restaurants and cafes" },
  { type: "info", text: "Polling Google Maps APIs for target city coordinates..." },
  { type: "success", text: "Coordinate boundary lock: Austin, TX [30.2672° N, 97.7431° W]" },
  { type: "info", text: "Iterating Google Maps grid blocks (16x16 scan matrix)..." },
  { type: "success", text: "Discovered 'The Grind House' - Rating 4.6 (1240 reviews) - Scraped email: owner@grindhouse.com" },
  { type: "info", text: "Querying Instagram Profile Indexer for handle cross-matching..." },
  { type: "success", text: "Match found: '@grindhouse_atx' - Verified active cafe profile" },
  { type: "info", text: "Crawling Yelp reviews for Sentiment Intelligence..." },
  { type: "success", text: "Yelp ID linked: 'the-grind-house-austin' - Rating 4.5" },
  { type: "info", text: "Scrape queue progress: 24% complete..." },
  { type: "success", text: "Discovered 'Bloom Café' - Rating 4.8 (2100 reviews) - Scraped email: hello@bloomcafe.com" },
  { type: "success", text: "Match found: '@bloom.pdx' - Verified Active Cafe" },
  { type: "info", text: "Scrape queue progress: 52% complete..." },
  { type: "success", text: "Discovered 'Salt & Oak' - Rating 4.7 (670 reviews) - Scraped email: reservations@saltandoak.com" },
  { type: "success", text: "Discovered 'Terra Kitchen' - Rating 4.4 (890 reviews) - Scraped email: info@terrakitchen.co" },
  { type: "info", text: "Scrape queue progress: 80% complete..." },
  { type: "success", text: "Discovered 'The Morning Pull' - Rating 4.9 (3200 reviews) - Scraped email: tm@morningpull.com" },
  { type: "accent", text: "Scan complete. 5 high-value leads filtered, contact info verified, socials mapped." }
];

export default function LeadFinder({ leads, setLeads, selectedLeads, setSelectedLeads, searching, searchProgress, triggerSearch, searchLog, activeLeadDrawer, setActiveLeadDrawer, showToast, geminiKey, setGeminiKey }) {
  const [searchTerm, setSearchTerm] = useState("Cafes & Brunch");
  const [searchLocation, setSearchLocation] = useState("Austin, TX");
  const [sourceGoogle, setSourceGoogle] = useState(true);
  const [sourceYelp, setSourceYelp] = useState(true);
  const [sourceInstagram, setSourceInstagram] = useState(true);
  const [searchMethod, setSearchMethod] = useState("scraper");
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    name: "",
    email: "",
    phone: "",
    instagram: "",
    website: ""
  });

  useEffect(() => {
    if (activeLeadDrawer) {
      setEditFields({
        name: activeLeadDrawer.name || "",
        email: activeLeadDrawer.email || "",
        phone: activeLeadDrawer.phone || "",
        instagram: activeLeadDrawer.instagram || "",
        website: activeLeadDrawer.website || ""
      });
      setIsEditing(false);
    }
  }, [activeLeadDrawer]);

  const toggleSelectLead = (id) => {
    if (selectedLeads.includes(id)) {
      setSelectedLeads(selectedLeads.filter(x => x !== id));
    } else {
      setSelectedLeads([...selectedLeads, id]);
    }
  };

  const selectAll = () => {
    setSelectedLeads(leads.map(l => l.id));
    showToast("All leads selected");
  };

  const deselectAll = () => {
    setSelectedLeads([]);
  };

  const handleClearAllLeads = async () => {
    if (!window.confirm("Are you sure you want to clear all leads and emails from the database? This action is permanent and cannot be undone.")) {
      return;
    }
    try {
      const response = await fetch("/api/leads", { method: "DELETE" });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }
      
      setLeads([]);
      setSelectedLeads([]);
      setActiveLeadDrawer(null);
      showToast("All database records cleared successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to clear database: " + err.message, "danger");
    }
  };

  const bulkAddCampaign = async () => {
    if (selectedLeads.length === 0) {
      showToast("No leads selected!", "warn");
      return;
    }
    try {
      await Promise.all(selectedLeads.map(id =>
        fetch(`/api/leads/${id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "contacted" })
        })
      ));
      setLeads(ls => ls.map(l => selectedLeads.includes(l.id) ? { ...l, status: "contacted" } : l));
      showToast(`Bulk added ${selectedLeads.length} leads to Outreach Campaigns!`, "success");
      setSelectedLeads([]);
    } catch (err) {
      console.error("Bulk add campaign failed:", err);
      showToast("Failed to bulk update lead status in database", "danger");
    }
  };

  const getBadgeStyle = (status) => {
    switch (status) {
      case "not contacted":
      case "new":
        return { bg: "rgba(99, 102, 241, 0.1)", text: "var(--color-indigo)", border: "rgba(99, 102, 241, 0.25)" };
      case "contacted":
        return { bg: "rgba(245, 158, 11, 0.1)", text: "var(--color-amber)", border: "rgba(245, 158, 11, 0.25)" };
      case "replied":
        return { bg: "rgba(13, 148, 136, 0.1)", text: "var(--color-teal)", border: "rgba(13, 148, 136, 0.25)" };
      case "interested":
        return { bg: "rgba(16, 185, 129, 0.1)", text: "var(--color-emerald)", border: "rgba(16, 185, 129, 0.25)" };
      case "closed":
        return { bg: "rgba(200, 255, 0, 0.1)", text: "var(--color-lime)", border: "rgba(200, 255, 0, 0.25)" };
      case "trashed":
        return { bg: "rgba(239, 68, 68, 0.1)", text: "var(--color-crimson)", border: "rgba(239, 68, 68, 0.25)" };
      default:
        return { bg: "rgba(255,255,255,0.05)", text: "var(--text-secondary)", border: "rgba(255,255,255,0.1)" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
      {/* Module Title */}
      <div>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Lead Finder Engine</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Autonomous target finder using Google Maps API, Yelp scraping, and Instagram validation.
        </p>
      </div>

      {/* Control Panel Grid */}
      <div className="lead-finder-grid">
        
        {/* Search settings glass panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Target Parameters</h3>
          
          <div style={{ display: "flex", background: "var(--bg-translucent-mild)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-translucent)", marginBottom: "4px" }}>
            <button 
              type="button"
              onClick={() => setSearchMethod("scraper")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                background: searchMethod === "scraper" ? "var(--bg-translucent-strong)" : "transparent",
                color: searchMethod === "scraper" ? "var(--text-primary)" : "var(--text-secondary)"
              }}
            >
              🌐 Web Scraper
            </button>
            <button 
              type="button"
              onClick={() => setSearchMethod("deepsearch")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                background: searchMethod === "deepsearch" ? "var(--color-lime)" : "transparent",
                color: searchMethod === "deepsearch" ? "#000" : "var(--text-secondary)"
              }}
            >
              ♊ Gemini DeepSearch AI
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Niche Keyword</label>
              <input 
                type="text" 
                className="input-field" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="e.g. Specialty Coffee Shops"
              />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Geographic Target</label>
              <input 
                type="text" 
                className="input-field" 
                value={searchLocation} 
                onChange={(e) => setSearchLocation(e.target.value)} 
                placeholder="e.g. Austin, TX"
              />
            </div>

            {searchMethod === "deepsearch" && (
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: "8px", 
                padding: "12px", 
                background: "rgba(200, 255, 0, 0.03)", 
                border: "1px dashed rgba(200, 255, 0, 0.2)", 
                borderRadius: "8px",
                marginTop: "4px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "11px", color: "var(--color-lime)", fontWeight: 700, letterSpacing: "0.02em" }}>GEMINI API KEY REQUIRED</label>
                  {geminiKey && <span style={{ fontSize: "10px", color: "var(--color-emerald)", fontWeight: 600 }}>✓ Key Configured</span>}
                </div>
                <input 
                  type="password" 
                  className="input-field" 
                  style={{ border: geminiKey ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(200,255,0,0.3)" }}
                  value={geminiKey || ""} 
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    localStorage.setItem("gemini_api_key", e.target.value);
                  }}
                  placeholder="Paste your Gemini API Key..."
                />
                <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  Uses Google Search grounding to scan live web listings, retrieving authentic contacts with zero placeholders.
                </span>
              </div>
            )}

            {searchMethod === "scraper" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Integrations & Verification</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                    <input type="checkbox" checked={sourceGoogle} onChange={(e) => setSourceGoogle(e.target.checked)} /> Google Maps API
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                    <input type="checkbox" checked={sourceYelp} onChange={(e) => setSourceYelp(e.target.checked)} /> Yelp Fusion
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                    <input type="checkbox" checked={sourceInstagram} onChange={(e) => setSourceInstagram(e.target.checked)} /> IG Verified Handle
                  </label>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Autonomous AI Strategy</span>
                <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
                  <span>✓ Google Search Grounding</span>
                  <span>✓ Real Email Filter</span>
                  <span>✓ Social Map Verification</span>
                </div>
              </div>
            )}
            
            <button 
              type="button"
              className={searchMethod === "deepsearch" ? "btn btn-lime glow-card" : "btn btn-lime"} 
              style={{ width: "100%", marginTop: "8px" }}
              onClick={() => {
                if (searchMethod === "deepsearch" && !geminiKey) {
                  showToast("Please enter a valid Gemini API Key first!", "warn");
                  return;
                }
                triggerSearch(searchTerm, searchLocation, searchMethod);
              }}
              disabled={searching}
            >
              {searching ? `Searching... ${Math.round(searchProgress)}%` : searchMethod === "deepsearch" ? "⚡ Run Gemini DeepSearch AI" : "🔍 Run Autonomous Local Scan"}
            </button>
          </div>

        </div>

        {/* Live scanner output */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Interactive Scanner Feed</h3>
            {searching && (
              <span style={{ fontSize: "12px", color: "var(--color-lime)", fontWeight: 600, animation: "pulseIndicator 1s infinite" }}>
                ● SCANNING
              </span>
            )}
          </div>
          
          <div className="terminal-scanner">
            <div className="scan-line" style={{ display: searching ? "block" : "none" }} />
            {searchLog.slice().reverse().map((log, index) => (
              <div key={index} className={`terminal-line ${log.type}`}>
                &gt; {log.text}
              </div>
            ))}
            {!searching && searchLog.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", padding: "40px" }}>
                Scraping engines idle. Set targets and run a scan to stream verified restaurant details.
              </div>
            )}
          </div>
          
          {searching && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
                <span>Scraping progress...</span>
                <span>{Math.round(searchProgress)}%</span>
              </div>
              <div style={{ height: "6px", background: "var(--bg-translucent-mild)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  width: `${searchProgress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--color-indigo), var(--color-lime))",
                  transition: "width 0.2s"
                }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-outline btn-sm" onClick={selectAll}>Select All</button>
          <button className="btn btn-outline btn-sm" onClick={deselectAll}>Clear Selection</button>
          <button 
            className="btn btn-outline btn-sm" 
            style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "var(--color-crimson)" }}
            onClick={handleClearAllLeads}
          >
            🗑️ Clear Database Leads
          </button>
        </div>
        
        {selectedLeads.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", animation: "fadeIn 0.2s" }}>
            <span style={{ fontSize: "13px", color: "var(--color-lime)", fontWeight: 600 }}>{selectedLeads.length} leads selected</span>
            <button className="btn btn-indigo btn-sm" onClick={bulkAddCampaign}>⚡ Add to Active Campaign</button>
          </div>
        )}
      </div>

      {/* Leads Table */}
      <div className="glass-panel table-wrapper" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "var(--bg-translucent-subtle)", borderBottom: "1px solid var(--border-translucent)" }}>
              <th style={{ padding: "16px 20px", width: "40px" }} />
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Company Name</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Category</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Location</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Rating & Reviews</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Contact Info</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Status</th>
              <th style={{ padding: "16px 20px", fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Opened</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const bStyle = getBadgeStyle(lead.status);
              const isSelected = selectedLeads.includes(lead.id);
              return (
                <tr 
                  key={lead.id} 
                  style={{ 
                    borderBottom: "1px solid var(--border-translucent)", 
                    background: isSelected ? "rgba(99, 102, 241, 0.03)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.2s"
                  }}
                  onClick={() => setActiveLeadDrawer(lead)}
                >
                  <td style={{ padding: "16px 20px" }} onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSelectLead(lead.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{lead.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{lead.instagram || "@none"}</div>
                  </td>
                  <td style={{ padding: "16px 20px", fontSize: "13px", color: "var(--text-secondary)" }}>{lead.type}</td>
                  <td style={{ padding: "16px 20px", fontSize: "13px", color: "var(--text-secondary)" }}>{lead.city}</td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "var(--color-amber)", fontWeight: 700 }}>
                      ★ {lead.rating}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{lead.reviews} Yelp reviews</div>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>{lead.email}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{lead.phone}</div>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <span 
                      className="badge" 
                      style={{ 
                        backgroundColor: bStyle.bg, 
                        color: bStyle.text, 
                        border: `1px solid ${bStyle.border}` 
                      }}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    {lead.is_opened ? (
                      <span 
                        className="badge" 
                        style={{ 
                          backgroundColor: "rgba(16, 185, 129, 0.12)", 
                          color: "var(--color-emerald)", 
                          border: "1px solid rgba(16, 185, 129, 0.2)",
                          fontWeight: 700
                        }}
                      >
                        Yes
                      </span>
                    ) : (
                      <span 
                        className="badge" 
                        style={{ 
                          backgroundColor: "var(--bg-translucent-mild)", 
                          color: "var(--text-muted)", 
                          border: "1px solid var(--border-translucent)",
                          fontWeight: 500
                        }}
                      >
                        No
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Details drawer backdrop and pane */}
      {activeLeadDrawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setActiveLeadDrawer(null)} />
          <div className="drawer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Lead Profile Dossier
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {!isEditing && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    style={{ 
                      background: "rgba(200, 255, 0, 0.08)", 
                      border: "1px solid rgba(200, 255, 0, 0.2)", 
                      color: "var(--color-lime)", 
                      fontSize: "11px", 
                      padding: "4px 8px", 
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: 700 
                    }}
                  >
                    ✏ Edit Lead
                  </button>
                )}
                <button 
                  onClick={() => { setActiveLeadDrawer(null); setIsEditing(false); }}
                  style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* Header info */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{activeLeadDrawer.name}</h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="badge" style={{
                  backgroundColor: getBadgeStyle(activeLeadDrawer.status).bg,
                  color: getBadgeStyle(activeLeadDrawer.status).text,
                  border: `1px solid ${getBadgeStyle(activeLeadDrawer.status).border}`
                }}>{activeLeadDrawer.status}</span>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{activeLeadDrawer.type} · {activeLeadDrawer.city}</span>
              </div>
            </div>

            {/* Profile details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", background: "var(--bg-translucent-subtle)", border: "var(--border-subtle)", borderRadius: "12px", marginBottom: "24px" }}>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>COMPANY NAME</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editFields.name}
                      onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>EMAIL</label>
                    <input 
                      type="email" 
                      className="input-field" 
                      value={editFields.email}
                      onChange={(e) => setEditFields({ ...editFields, email: e.target.value })}
                      placeholder="e.g. hello@company.com"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>PHONE</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editFields.phone}
                      onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>INSTAGRAM</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editFields.instagram}
                      onChange={(e) => setEditFields({ ...editFields, instagram: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>WEBSITE URL</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editFields.website}
                      onChange={(e) => setEditFields({ ...editFields, website: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                    <button 
                      className="btn btn-lime btn-sm" 
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/leads/${activeLeadDrawer.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(editFields)
                          });
                          if (!res.ok) throw new Error("Failed to update lead details");
                          const updatedLead = await res.json();
                          const parsedLead = {
                            ...updatedLead,
                            rating: updatedLead.rating ? parseFloat(updatedLead.rating) : 4.0,
                            reviews: updatedLead.reviews ? parseInt(updatedLead.reviews) : 0
                          };
                          setLeads(ls => ls.map(l => l.id === parsedLead.id ? parsedLead : l));
                          setActiveLeadDrawer(parsedLead);
                          setIsEditing(false);
                          showToast("Lead details updated successfully!", "success");
                        } catch (err) {
                          showToast(err.message, "danger");
                        }
                      }}
                    >
                      Save Changes
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>EMAIL</div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{activeLeadDrawer.email || "None"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>PHONE</div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>{activeLeadDrawer.phone || "None"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>RATING</div>
                    <div style={{ fontSize: "13px", color: "var(--color-amber)", fontWeight: 700 }}>★ {activeLeadDrawer.rating} ({activeLeadDrawer.reviews} reviews)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>INSTAGRAM</div>
                    <div style={{ fontSize: "13px", color: "var(--color-indigo)", fontWeight: 600 }}>{activeLeadDrawer.instagram || "@none"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>WEBSITE URL</div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600 }}>
                      {activeLeadDrawer.website ? (
                        <a href={activeLeadDrawer.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-indigo)", textDecoration: "underline" }}>
                          {activeLeadDrawer.website.replace(/^https?:\/\/(www\.)?/, "").substring(0, 24)}...
                        </a>
                      ) : "None"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>WEBSITE STATUS</div>
                    <div style={{ fontSize: "13px", fontWeight: 700 }}>
                      {activeLeadDrawer.website_status === "no_website" && <span style={{ color: "var(--color-crimson)" }}>🚫 No Website</span>}
                      {activeLeadDrawer.website_status === "down" && <span style={{ color: "var(--color-amber)" }}>⚠️ Site Down</span>}
                      {activeLeadDrawer.website_status === "active" && <span style={{ color: "var(--color-emerald)" }}>✅ Active</span>}
                      {(!activeLeadDrawer.website_status || activeLeadDrawer.website_status === "unknown") && <span style={{ color: "var(--text-muted)" }}>Unknown</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>EMAIL OPENED</div>
                    <div style={{ fontSize: "13px", fontWeight: 700 }}>
                      {activeLeadDrawer.is_opened ? (
                        <span style={{ color: "var(--color-emerald)" }}>✅ Yes</span>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>❌ No</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AI Strat Dossier */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: "var(--color-lime-glow)", border: "var(--border-glow)", borderRadius: "12px", marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", color: "var(--color-lime)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                🧠 Gemini Prospect Dossier
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.6" }}>
                {activeLeadDrawer.name} has a rating of {activeLeadDrawer.rating}⭐ with {activeLeadDrawer.reviews} Yelp reviews. 
                {activeLeadDrawer.website_status === "no_website" && (
                  <span> It currently lacks an official website presence. This represents a prime opportunity to pitch high-converting website design to establish credibility and capture local search traffic.</span>
                )}
                {activeLeadDrawer.website_status === "down" && (
                  <span> Its official website is currently offline or inaccessible, presenting a critical operational risk. We can immediately pitch technical recovery and site redesign.</span>
                )}
                {(!activeLeadDrawer.website_status || activeLeadDrawer.website_status === "active" || activeLeadDrawer.website_status === "unknown") && (
                  <span> Its online presence indicates active operations. We can pitch AI chatbot assistants for reservation booking and instant DM support.</span>
                )}
                <br/><br/>
                <strong>Recommended Action:</strong> Launch a hyper-personalized email campaign using Gemini to highlight
                {activeLeadDrawer.website_status === "no_website" && " building a brand new website presence."}
                {activeLeadDrawer.website_status === "down" && " fixing their broken website/restoring online access."}
                {(!activeLeadDrawer.website_status || activeLeadDrawer.website_status === "active" || activeLeadDrawer.website_status === "unknown") && " introducing automated booking chatbot widgets."}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button 
                className="btn btn-lime"
                style={{ width: "100%" }}
                onClick={() => {
                  setSelectedLeads([activeLeadDrawer.id]);
                  showToast(`Selected ${activeLeadDrawer.name} for email drafting`);
                  setActiveLeadDrawer(null);
                }}
              >
                Draft Outreach Email
              </button>
              
              {(activeLeadDrawer.status === "new" || activeLeadDrawer.status === "not contacted") && (
                <button 
                  className="btn btn-outline"
                  style={{ width: "100%" }}
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/leads/${activeLeadDrawer.id}/status`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "contacted" })
                      });
                      if (!response.ok) throw new Error("Failed to update status");
                      setLeads(ls => ls.map(l => l.id === activeLeadDrawer.id ? { ...l, status: "contacted" } : l));
                      showToast(`Moved ${activeLeadDrawer.name} to Contacted!`);
                      setActiveLeadDrawer(null);
                    } catch (err) {
                      console.error(err);
                      showToast("Failed to update status in database", "danger");
                    }
                  }}
                >
                  Mark as Contacted
                </button>
              )}
            </div>

          </div>
        </>
      )}

    </div>
  );
}
