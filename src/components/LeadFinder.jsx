import { useState, useRef, useEffect } from "react";

/* ─── Email Composer Modal ─── */
function EmailComposer({ lead, settings, onClose, onSent, showToast }) {
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [generating, setGen]    = useState(false);
  const [sending, setSending]   = useState(false);
  const [thinking, setThinking] = useState("");
  const [versions, setVersions] = useState(null);
  const [activeTab, setActiveTab] = useState("thinking"); // "thinking" | "versions"
  const generated = useRef(false);

  useEffect(() => {
    if (!generated.current) { generated.current = true; generateEmail(); }
  }, []); // eslint-disable-line

  async function generateEmail() {
    setGen(true);
    try {
      const pitchOfferLabel = {
        whatsapp_bot: "WhatsApp booking bot", website_dev: "website design",
        ai_chatbot: "AI chatbot", custom: "Custom Tailored Service",
      }[settings.pitchOffer] || settings.pitchOffer;

      const customOfferContext = settings.pitchOffer === "custom" && settings.customOfferDetails
        ? `\n- Custom Pitch Context (Use this to understand the specific service you offer): ${settings.customOfferDetails}`
        : "";

      const prompt = `You are ${settings.senderName || "a developer"} (${settings.senderRole || "developer"}${settings.companyName ? ` at ${settings.companyName}` : ""}).
Write a highly personalized, custom cold outreach campaign tailored specifically for this lead. Do NOT use templates or fixed structures.

Business Info:
- Name: ${lead.name}
- Type: ${lead.type}
- City: ${lead.city}
- Rating: ${lead.rating} ⭐ (${lead.reviews} reviews)
- Website: ${lead.website || "None"}
- Website Status: ${lead.website_status || "unknown"}
- Instagram: ${lead.instagram || "None"}
- Existing Icebreaker: ${lead.personalized_icebreaker || "None"}

You are pitching: ${pitchOfferLabel}${customOfferContext}
User-selected campaign context:
- Target niche selected by user: ${settings.niche || lead.type || "unknown"}
- Target location selected by user: ${settings.location || lead.city || "unknown"}
- Sender location: ${settings.senderLocation || "remote / online"}
Tone: ${settings.outreachStyle || "casual"}, warm, direct, conversational, human.
Bio context: ${settings.aboutText || "local developer helping businesses grow"}
${settings.workSamples ? `Work samples: ${settings.workSamples}` : ""}

BANNED PHRASES: Do NOT use phrases like "Hope you're doing well", "I came across your website", "Just checking in", "Wanted to reach out", "We are the best", "Industry-leading", "Revolutionary", "Game changer", "Guaranteed", "World class".

PITCH STRATEGY RULES:
- Do not pitch from a fixed template. First infer the industry, customer journey, likely buyer pain, and best matching business outcome from the selected campaign context and this lead's data.
- If the user selected a preset offer, translate it into the lead's industry language. For example, a booking bot means fewer missed reservations for cafes, fewer missed appointment requests for salons/clinics, faster quote capture for home services, and instant FAQ handling for gyms or studios.
- If the user selected a custom offer, treat the custom text as strategic context, not copy. Extract the core result, ideal customer, pain point, and proof angle, then rewrite it naturally for this exact lead.
- Use the user's work samples only when relevant. If no work sample matches, refer to experience generally and do not invent a case study.
- Use the existing icebreaker if it is specific and useful. If it is generic, create a stronger one from the lead's rating, reviews, niche, location, website status, social profile, or missing booking/contact flow.
- If sender location differs from lead location, never claim local/in-person familiarity. Use online research wording.
- The pitch must answer: why this business, why this offer, why now, and what low-friction next step makes sense.

AI THINKING STEP-BY-STEP PROCESS:
1. Identify what the company actually does, their target customers, and brand positioning.
2. Infer the best industry-specific pitch angle from selected offer/custom offer + selected niche/location + the lead's actual data.
3. Find a genuine personalized icebreaker based on their existing icebreaker, rating, location, niche, website status, or social profile (never generic compliments like "I love your website").
4. Identify specific opportunities/weaknesses (website down/missing, outdated mobile styling, slow loading, missing booking tools, manual FAQ processing) in a constructive, friendly way.
5. Match relevant services that fit their business needs (don't force unrelated products).
6. Explain the business outcome / value proposition in industry terms.
7. Offer a low-friction call-to-action (CTA) e.g., asking for simple permission to show them a concept sketch, quick preview mockup, or 2-minute audit.

Return a single JSON object with these EXACT keys:
- "thinking": A brief paragraph detailing your step-by-step research answers (What they do, their customers, opportunities, matched service reason).
- "subject": Short click-worthy personalized subject line (no generic or spam words).
- "opening": Personalized opening sentence hook referring to their business directly.
- "personalizedBody": Opportunity-focused paragraph explaining what can be improved.
- "valueProposition": The business benefit/outcome of the matched service for them.
- "cta": Low-pressure CTA (asking simple permission to show/send a quick concept preview).
- "closing": Cheers, ${settings.senderName || "Developer"}${(settings.companyName) ? `\\n${settings.senderRole || "Developer"}\\n${settings.companyName}` : `\\n${settings.senderRole || "Developer"}`}
- "followUp1": "Subject: [follow up subject]\\n\\n[A short, friendly follow-up email text sent 3 days later, referencing the previous idea and offering simple value or permission to share a mockup]"
- "followUp2": "Subject: [follow up subject]\\n\\n[A short, conversational second follow-up text sent 7 days later, simple and low pressure]"
- "linkedinConnection": "A short, friendly LinkedIn connection request message (max 300 characters, no sales pitch, just warm networking context)"
- "linkedinFollowUp": "A short, conversational follow-up message to send once they accept the LinkedIn connection"
- "shortVersion": "Subject: [short subject]\\n\\n[An ultra-concise email version under 60 words body]"
- "longVersion": "Subject: [long subject]\\n\\n[A deconstructive, high-impact version under 150 words body]"

Do NOT wrap the JSON inside markdown code blocks. Return a raw JSON string.`;

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(35000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.text || "";
        try {
          const parsed = JSON.parse(text);
          setThinking(parsed.thinking || "AI generated research details for this lead.");
          const fullBody = `${parsed.opening}\n\n${parsed.personalizedBody}\n\n${parsed.valueProposition}\n\n${parsed.cta}\n\n${parsed.closing}`;
          setSubject(parsed.subject || `Quick question about ${lead.name}`);
          setBody(fullBody);
          setVersions(parsed);
        } catch (jsonErr) {
          console.error("Failed to parse JSON response:", text);
          setSubject(`Quick question about ${lead.name}`);
          setBody(text.trim());
          setThinking("Failed to parse structured AI intelligence. Raw email draft is shown.");
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

  function loadVersion(type) {
    if (!versions) return;
    if (type === "standard") {
      const fullBody = `${versions.opening}\n\n${versions.personalizedBody}\n\n${versions.valueProposition}\n\n${versions.cta}\n\n${versions.closing}`;
      setSubject(versions.subject || `Quick question about ${lead.name}`);
      setBody(fullBody);
    } else if (type === "followUp1") {
      const parts = (versions.followUp1 || "").split("\n\n");
      const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Follow up: ${lead.name}`;
      const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : versions.followUp1;
      setSubject(sub);
      setBody(bdy);
    } else if (type === "followUp2") {
      const parts = (versions.followUp2 || "").split("\n\n");
      const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Re: ${lead.name}`;
      const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : versions.followUp2;
      setSubject(sub);
      setBody(bdy);
    } else if (type === "linkedinConnection") {
      setSubject("LinkedIn connection invitation context");
      setBody(versions.linkedinConnection || "");
    } else if (type === "linkedinFollowUp") {
      setSubject("LinkedIn follow-up chat message");
      setBody(versions.linkedinFollowUp || "");
    } else if (type === "shortVersion") {
      const parts = (versions.shortVersion || "").split("\n\n");
      const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Quick note: ${lead.name}`;
      const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : versions.shortVersion;
      setSubject(sub);
      setBody(bdy);
    } else if (type === "longVersion") {
      const parts = (versions.longVersion || "").split("\n\n");
      const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Detailed overview: ${lead.name}`;
      const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : versions.longVersion;
      setSubject(sub);
      setBody(bdy);
    }
    showToast(`Loaded ${type} copy into composer!`, "info");
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: "1150px", width: "95%" }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">✉ AI Outreach Intelligence Suite — {lead.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              To: <span style={{ color: "var(--text-1)" }}>{lead.email || "No email"}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: "20px 24px" }}>
          {generating ? (
            <div className="flex-center" style={{ flexDirection: "column", gap: 12, padding: "48px 0" }}>
              <span className="spinner spinner-lg" />
              <span style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 600 }}>Analyzing lead & generating custom campaigns...</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px", minHeight: "420px" }}>
              
              {/* Left Column: AI Research and Outreach Versions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderRight: "1px solid var(--border-subtle)", paddingRight: "20px" }}>
                <div style={{ display: "flex", gap: "6px", background: "var(--bg-translucent-mild)", padding: "4px", borderRadius: "8px" }}>
                  <button 
                    onClick={() => setActiveTab("thinking")}
                    style={{
                      flex: 1, padding: "6px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                      background: activeTab === "thinking" ? "var(--color-indigo)" : "transparent",
                      color: activeTab === "thinking" ? "white" : "var(--text-secondary)",
                      cursor: "pointer", transition: "all 0.2s"
                    }}
                  >
                    🧠 AI Research & Thinking
                  </button>
                  <button 
                    onClick={() => setActiveTab("versions")}
                    style={{
                      flex: 1, padding: "6px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                      background: activeTab === "versions" ? "var(--color-indigo)" : "transparent",
                      color: activeTab === "versions" ? "white" : "var(--text-secondary)",
                      cursor: "pointer", transition: "all 0.2s"
                    }}
                  >
                    ⚡ Outreach Versions
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", maxHeight: "380px" }}>
                  {activeTab === "thinking" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div className="badge" style={{ background: "rgba(99,102,241,0.06)", color: "var(--color-indigo)", alignSelf: "flex-start", fontSize: "10px" }}>
                        Research Analysis
                      </div>
                      <div style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--text-secondary)", background: "var(--bg-translucent-mild)", padding: "12px", borderRadius: "8px", border: "var(--border-subtle)" }}>
                        {thinking}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                        💡 This analysis is used to guarantee that every email generated is 100% unique, personalized, and avoids templates.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Click a button to load an alternative copy or follow-up sequence directly into the active composer.
                      </div>
                      {[
                        { id: "standard", label: "Standard Outreach", icon: "📧" },
                        { id: "followUp1", label: "Follow-up Email #1 (3 days)", icon: "⏰" },
                        { id: "followUp2", label: "Follow-up Email #2 (7 days)", icon: "⏰" },
                        { id: "linkedinConnection", label: "LinkedIn Invite (300 char)", icon: "💬" },
                        { id: "linkedinFollowUp", label: "LinkedIn Follow-up", icon: "💬" },
                        { id: "shortVersion", label: "Short Version (< 60 words)", icon: "⚡" },
                        { id: "longVersion", label: "Long Version (< 150 words)", icon: "📝" },
                      ].map((ver) => (
                        <div 
                          key={ver.id}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: "var(--bg-translucent-mild)", border: "var(--border-subtle)",
                            padding: "10px 12px", borderRadius: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "16px" }}>{ver.icon}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{ver.label}</span>
                          </div>
                          <button 
                            className="btn btn-lime btn-sm" 
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => loadVersion(ver.id)}
                            disabled={!versions}
                          >
                            ⚡ Load
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Active Composer */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="input-group">
                  <label className="input-label" style={{ fontWeight: 700 }}>Outreach Subject Line</label>
                  <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject..." />
                </div>
                <div className="input-group">
                  <label className="input-label" style={{ fontWeight: 700 }}>Outreach Email Body</label>
                  <textarea
                    className="input"
                    rows={12}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    style={{ resize: "vertical", fontFamily: "var(--font)", fontSize: "13.5px", lineHeight: "1.7", minHeight: "260px" }}
                    placeholder="Write or edit email content here..."
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn btn-ghost btn-sm" onClick={generateEmail}>
                    ↺ Regenerate Outreach
                  </button>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Word Count: {body ? body.split(/\s+/).filter(Boolean).length : 0} words
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending || generating || !lead.email}
          >
            {sending ? <><span className="spinner spinner-sm" /> Sending...</> : "🚀 Send Outreach"}
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
  const [customOfferText, setCustomOfferText] = useState(() => {
    try {
      const saved = localStorage.getItem("syntek_scrape_config");
      return saved ? JSON.parse(saved).customOfferText || "" : (settings.customOfferDetails || "");
    } catch { return settings.customOfferDetails || ""; }
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
        customOfferText,
        searchMode,
        strictFilter
      }));
    } catch (e) {
      console.error("Failed to save scrape config:", e);
    }
  }, [niche, locations, limit, reqContact, pitchOffer, customOfferText, searchMode, strictFilter]);

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
      if (!saved && settings) {
        if (settings.niche) setNiche(settings.niche);
        if (settings.location) setLocations([settings.location]);
        if (settings.dailyLeadLimit) setLimit(settings.dailyLeadLimit);
        if (settings.requiredContact) setReqContact(settings.requiredContact);
        if (settings.pitchOffer) setPitchOffer(settings.pitchOffer);
        if (settings.customOfferDetails) setCustomOfferText(settings.customOfferDetails);
        if (settings.searchMode) setSearchMode(settings.searchMode);
      } else if (settings) {
        // If settings explicitly changed (e.g. initial load from backend), sync pitch settings
        if (settings.pitchOffer) setPitchOffer(settings.pitchOffer);
        if (settings.customOfferDetails) setCustomOfferText(settings.customOfferDetails);
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
            pitchOffer: pitchOffer === "custom" ? customOfferText : pitchOffer,
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
        const isCustom = pitchOffer === "custom";
        const pitchLabel = isCustom ? "Custom Tailored Service" : ({ whatsapp_bot: "WhatsApp booking bot", website_dev: "website design", ai_chatbot: "AI chatbot" }[pitchOffer] || pitchOffer);
        const customOfferContext = isCustom && customOfferText
          ? `\nCustom Pitch Context (Use this to understand the specific service you offer): ${customOfferText}`
          : "";

        const prompt = `You are ${settings.senderName || "a developer"}. Write a highly personalized short cold outreach email to ${lead.name} (${lead.type} in ${lead.city}, Google rating: ${lead.rating}⭐).
Pitch offer: ${pitchLabel}.${customOfferContext}
Website status: ${lead.website_status || "unknown"}.
Existing icebreaker: ${lead.personalized_icebreaker || "None"}.
User-selected campaign context:
- Target niche: ${niche || settings.niche || lead.type || "unknown"}
- Target locations: ${locations.join(", ") || settings.location || lead.city || "unknown"}
- Sender name/role/company: ${settings.senderName || "Developer"} / ${settings.senderRole || "Developer"} / ${settings.companyName || "Independent"}
- Sender location: ${settings.senderLocation || "remote / online"}
- Sender bio: ${settings.aboutText || "Not provided"}
- Work samples: ${settings.workSamples || "None"}
Keep it under 120 words.

HIGH-CONVERTING OUTREACH HOOK TEMPLATES & STYLES (Choose one of these 5 hook styles dynamically to make the email unique):
1. Problem-Based Hook (Subject: Quick idea about [Business Name])
2. Observation Hook (Subject: One thing I noticed on [Business Name] or Custom web experience for [Business Name])
3. Curiosity Hook (Subject: Curious question or Question for [Business Name])
4. ROI Hook (Subject: Saving hours at [Business Name] or Saving engineering time)
5. Soft Value Hook (Subject: If development/updates are on [Business Name]'s roadmap...)

Rules:
- First sentence hook: Reference the business directly (e.g. "I spent a few minutes looking through ${lead.name} and..." or "I noticed ${lead.name}'s listing..."). Never use generic greetings.
- Subject Line: MUST be highly click-worthy, brief, and personalized (e.g. "Custom web experience for ${lead.name}" or "Quick idea about ${lead.name}").
- Custom Pitch Offer Rule: If a custom service is specified, do NOT copy and paste the custom service description text verbatim. Instead, treat it as context explaining what you offer. Write a highly personalized, natural, and compelling pitch block tailored specifically for ${lead.name} based on that service.
- Strategy Rule: Before writing, infer the industry-specific buyer pain and business outcome from the selected offer/custom offer, selected niche/location, sender profile, work samples, and this lead's signals. Translate the offer into that industry's language instead of using generic SaaS or developer wording.
- Icebreaker Rule: Use the existing icebreaker if it is strong and specific; otherwise create a better one from rating, reviews, website status, social profile, city, niche, or missing booking/contact flow.
- Proof Rule: Use work samples only when they clearly fit this lead's industry or problem. Do not invent proof, numbers, visits, or local familiarity.
- Format: Start with "Subject: " on line 1, then a blank line, then the email body.`;
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

        {pitchOffer === "custom" && (
          <div className="input-group" style={{ marginTop: 8 }}>
            <label className="input-label">Custom Offer Details</label>
            <input
              className="input input-sm"
              placeholder="e.g. SEO optimization, mobile app..."
              value={customOfferText}
              onChange={e => setCustomOfferText(e.target.value)}
            />
          </div>
        )}

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
