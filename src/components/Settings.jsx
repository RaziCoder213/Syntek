import { useState, useEffect } from "react";

const TABS = [
  { id: "profile",     label: "Profile & Sender" },
  { id: "email",       label: "Email (Gmail)" },
  { id: "targeting",   label: "Targeting & Scrape" },
  { id: "pipeline",    label: "Pipeline Stages" },
  { id: "integrations",label: "Integrations" },
  { id: "account",     label: "Account" },
];

export default function Settings({ settings, onSave, showToast, currentUser }) {
  const [tab, setTab]   = useState("profile");
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [stageInput, setStageInput] = useState("");

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }));

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const defaultStages = ["New", "Re-research", "Researched", "Drafted", "Contacted", "Follow Up", "Opened", "Replied", "Won", "Archived"];

  function addStage() {
    const v = stageInput.trim();
    if (!v) return;
    const stages = form.kanbanStages || defaultStages;
    if (stages.includes(v)) { showToast("Stage already exists.", "warning"); return; }
    setForm(p => ({ ...p, kanbanStages: [...stages, v] }));
    setStageInput("");
  }

  function removeStage(s) {
    const stages = form.kanbanStages || defaultStages;
    setForm(p => ({ ...p, kanbanStages: stages.filter(x => x !== s) }));
  }

  function moveStage(i, dir) {
    const arr = [...(form.kanbanStages || defaultStages)];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setForm(p => ({ ...p, kanbanStages: arr }));
  }

  function startEditing(index, val) {
    setEditingIndex(index);
    setEditingValue(val);
  }

  function saveStageEdit(index) {
    const val = editingValue.trim();
    if (!val) return;
    const stages = [...(form.kanbanStages || defaultStages)];
    if (stages[index] === val) {
      setEditingIndex(null);
      return;
    }
    if (stages.includes(val)) {
      showToast("Stage name already exists.", "warning");
      return;
    }
    stages[index] = val;
    setForm(p => ({ ...p, kanbanStages: stages }));
    setEditingIndex(null);
  }

  const stages = form.kanbanStages || defaultStages;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800 }}>
      {/* Header */}
      <div className="flex-between">
        <div>
          <div className="section-title">Settings</div>
          <div className="section-desc">Configure your Syntek workspace.</div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner spinner-sm" /> Saving...</> : "Save Changes"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Left nav */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`nav-item ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
                style={{ width: "100%", textAlign: "left", justifyContent: "flex-start" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* ── PROFILE ── */}
          {tab === "profile" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Profile & Sender Identity</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                This information is used to personalize your cold emails and onboarding.
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Your Full Name</label>
                  <input className="input" value={form.senderName || ""} onChange={set("senderName")} placeholder="Muhammad Razi" />
                </div>
                <div className="input-group">
                  <label className="input-label">Role / Title</label>
                  <input className="input" value={form.senderRole || ""} onChange={set("senderRole")} placeholder="Freelance Developer" />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Business / Company Name</label>
                <input className="input" value={form.companyName || ""} onChange={set("companyName")} placeholder="Razi Dev Studio" />
              </div>
              <div className="input-group">
                <label className="input-label">Your Location (City, Country)</label>
                <input className="input" value={form.senderLocation || ""} onChange={set("senderLocation")} placeholder="e.g. Karachi, Pakistan" />
                <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 5, lineHeight: 1.5 }}>
                  ⚠ Used by AI to avoid writing as if you physically visited the business. If you&apos;re not local to your leads&apos; city, the AI will say &quot;I came across you online&quot; instead of &quot;I stopped by&quot; or &quot;I tried your coffee&quot;.
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">About / Bio (used in email pitches)</label>
                <textarea className="input" rows={3} value={form.aboutText || ""} onChange={set("aboutText")} placeholder="I'm a developer who helps local businesses..." />
              </div>
              <div className="input-group">
                <label className="input-label">Portfolio URL</label>
                <input className="input" value={form.portfolioUrl || ""} onChange={set("portfolioUrl")} placeholder="https://yourdomain.com" />
              </div>
              <div className="input-group">
                <label className="input-label">Work Samples / Case Studies</label>
                <textarea className="input" rows={3} value={form.workSamples || ""} onChange={set("workSamples")} placeholder="E.g. Built a booking bot for Cafe XYZ that saved 3hrs/day..." />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10 }}>Social Links</div>
                <div className="grid-2" style={{ gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">LinkedIn</label>
                    <input className="input" value={form.socialLinkedin || ""} onChange={set("socialLinkedin")} placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div className="input-group">
                    <label className="input-label">GitHub</label>
                    <input className="input" value={form.socialGithub || ""} onChange={set("socialGithub")} placeholder="https://github.com/..." />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Twitter / X</label>
                    <input className="input" value={form.socialTwitter || ""} onChange={set("socialTwitter")} placeholder="https://twitter.com/..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── EMAIL ── */}
          {tab === "email" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Gmail Connection</div>
              <div style={{ padding: "10px 12px", background: "var(--info-bg)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--info)" }}>
                ℹ Use a Gmail{" "}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 600 }}>App Password</a>
                , not your regular Gmail password. 2FA must be enabled.
              </div>
              {form.gmailUser && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--success-bg)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--radius-md)" }}>
                  <span className="status-dot green" />
                  <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>Connected as {form.gmailUser}</span>
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Gmail Address</label>
                <input className="input" type="email" value={form.gmailUser || ""} onChange={set("gmailUser")} placeholder="yourname@gmail.com" />
              </div>
              <div className="input-group">
                <label className="input-label">App Password</label>
                <input className="input" type="password" value={form.gmailPass || ""} onChange={set("gmailPass")} placeholder="xxxx xxxx xxxx xxxx" />
              </div>
              <div className="input-group" style={{ opacity: 0.55, pointerEvents: "none" }}>
                <label className="input-label">AI Engine</label>
                <input className="input" value="Antigravity AI (built-in)" readOnly />
                <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>
                  AI is powered by Antigravity — no external API key required.
                </span>
              </div>
              <div className="divider" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>Email Preferences</div>
                <div className="grid-2">
                  <div className="input-group">
                    <label className="input-label">Outreach Style</label>
                    <select className="input" value={form.outreachStyle || "casual"} onChange={set("outreachStyle")}>
                      <option value="casual">Casual & Friendly</option>
                      <option value="roi">ROI-Focused</option>
                      <option value="feedback">Feedback Style</option>
                      <option value="direct">Direct / Demo</option>
                      <option value="collaboration">Collaboration & Partnership</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Pitch Offer</label>
                    <select className="input" value={form.pitchOffer || "whatsapp_bot"} onChange={set("pitchOffer")}>
                      <option value="whatsapp_bot">WhatsApp Booking Bot</option>
                      <option value="website_dev">Website Design</option>
                      <option value="ai_chatbot">AI Chatbot</option>
                      <option value="custom">Custom Offer</option>
                    </select>
                  </div>
                </div>
                {form.pitchOffer === "custom" && (
                  <div className="input-group" style={{ marginTop: 12 }}>
                    <label className="input-label">Custom Offer Details</label>
                    <textarea className="input" rows={3} value={form.customOfferDetails || ""} onChange={set("customOfferDetails")} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-12" style={{ cursor: "pointer" }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.reviewBeforeSend ?? true} onChange={setBool("reviewBeforeSend")} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Review Before Send</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>Always preview the AI draft before sending.</div>
                </div>
              </label>
              <label className="flex items-center gap-12" style={{ cursor: "pointer" }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.useCompanyBranding} onChange={setBool("useCompanyBranding")} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Use Company Branding in Emails</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>Sign emails as "{form.senderName} from {form.companyName || "your company"}".</div>
                </div>
              </label>
              <label className="flex items-center gap-12" style={{ cursor: "pointer" }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.reResearchEnabled !== false} onChange={setBool("reResearchEnabled")} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>AI Re-research Agent</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>Automatically search and resolve public emails for leads in Re-research stage.</div>
                </div>
              </label>
            </div>
          )}

          {/* ── TARGETING ── */}
          {tab === "targeting" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Targeting & Scraping</div>
              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Default Niche</label>
                  <input className="input" value={form.niche || ""} onChange={set("niche")} placeholder="e.g. Cafes & Brunch" />
                </div>
                <div className="input-group">
                  <label className="input-label">Default Location</label>
                  <input className="input" value={form.location || ""} onChange={set("location")} placeholder="e.g. Austin, TX" />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Leads per Scrape Run ({form.dailyLeadLimit || 10})</label>
                <div className="slider-row">
                  <input type="range" className="slider" min={5} max={50} step={5}
                    value={form.dailyLeadLimit || 10}
                    onChange={e => setForm(p => ({ ...p, dailyLeadLimit: parseInt(e.target.value) }))}
                  />
                  <span className="slider-value">{form.dailyLeadLimit || 10}</span>
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Required Contact Filter</label>
                <select className="input" value={form.requiredContact || "email_or_phone"} onChange={set("requiredContact")}>
                  <option value="email_or_phone">Email or Phone</option>
                  <option value="email">Email only</option>
                  <option value="phone">Phone only</option>
                  <option value="instagram">Instagram</option>
                  <option value="any_social">Any Social Media</option>
                  <option value="all">All (email + phone + social)</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Search Mode</label>
                <select className="input" value={form.searchMode || "deepsearch"} onChange={set("searchMode")}>
                  <option value="deepsearch">DeepSearch AI (thorough, slower)</option>
                  <option value="quick">Quick Scan (fast, less data)</option>
                </select>
              </div>
            </div>
          )}

          {/* ── PIPELINE ── */}
          {tab === "pipeline" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Pipeline Stages</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                Customize your Kanban board stages. Drag to reorder, or use ↑↓ buttons.
              </div>

              {/* Stage list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stages.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)" }}>
                    {editingIndex === i ? (
                      <>
                        <input
                          className="input"
                          style={{ flex: 1, padding: "4px 8px", fontSize: 13, height: "auto" }}
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveStageEdit(i)}
                          autoFocus
                        />
                        <button className="btn btn-success btn-sm" style={{ padding: "4px 10px", height: "auto" }} onClick={() => saveStageEdit(i)}>Save</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "4px 10px", height: "auto" }} onClick={() => setEditingIndex(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>{s}</span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "4px 8px", fontSize: 11, height: "auto" }} onClick={() => startEditing(i, s)}>✏ Edit</button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveStage(i, -1)} disabled={i === 0}>↑</button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1}>↓</button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => removeStage(s)}>✕</button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Add stage */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  placeholder="New stage name..."
                  value={stageInput}
                  onChange={e => setStageInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStage()}
                />
                <button className="btn btn-secondary" onClick={addStage}>+ Add Stage</button>
              </div>
            </div>
          )}

          {/* ── INTEGRATIONS ── */}
          {tab === "integrations" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Integrations</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>Connect external tools to enhance your workflow.</div>

              {[
                { name: "Google Sheets", icon: "📊", desc: "Export leads to a Google Sheet automatically.", connected: false, badge: "Coming Soon" },
                { name: "Google Calendar", icon: "📅", desc: "Schedule follow-ups and sync booking slots.", connected: false, badge: "Coming Soon" },
                { name: "Slack", icon: "💬", desc: "Get notified when a lead replies.", connected: false, badge: "Coming Soon" },
                { name: "Zapier", icon: "⚡", desc: "Connect to 3,000+ apps with Zapier webhooks.", connected: false, badge: "Coming Soon" },
              ].map(int => (
                <div key={int.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)" }}>
                  <div style={{ fontSize: 24, flexShrink: 0 }}>{int.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text-1)" }}>{int.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{int.desc}</div>
                  </div>
                  <span className="badge badge-neutral">{int.badge}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── ACCOUNT ── */}
          {tab === "account" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Account</div>

              <div style={{ padding: "14px 16px", background: "var(--bg-overlay)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)" }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>Logged in as</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{currentUser?.company_name || "—"}</div>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>{currentUser?.email}</div>
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-brand">Agency Plan</span>
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--success-bg)", borderRadius: "var(--radius-md)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--success)", marginBottom: 4 }}>Agency Plan — Active</div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  ✓ Up to 50 leads per scrape run<br />
                  ✓ Unlimited email outreach<br />
                  ✓ Full automation & autopilot<br />
                  ✓ Priority AI features
                </div>
              </div>

              <div style={{ padding: "14px 16px", background: "var(--danger-bg)", borderRadius: "var(--radius-md)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--danger)", marginBottom: 4 }}>Danger Zone</div>
                <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 10 }}>
                  These actions are irreversible. Please proceed carefully.
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (!confirm("Delete ALL leads from your database? This cannot be undone.")) return;
                    try {
                      await fetch("/api/leads", { method: "DELETE" });
                      showToast("All leads deleted.", "warning");
                    } catch { showToast("Failed to delete leads.", "danger"); }
                  }}
                >
                  Delete All Leads
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
