import { useState, useEffect } from "react";

const SYSTEM_TEMPLATES = [
  { id: 1, name: "AI Reservation Automation Pitch", tone: "ROI-Focused", body: "Subject: quick question about {{company}}\n\nHi team at {{company}},\n\nI noticed you have a stellar {{rating}}⭐ rating with {{reviews}} reviews in {{city}}! You must get slammed with reservations and customer calls.\n\nI'm Muhammad Razi, a local independent developer. I design simple custom AI agents that automate reservation scheduling and WhatsApp/IG DMs, saving 2-3 hours daily for Cafe owners.\n\nWould you be open to a quick 10-minute preview this week?\n\nBest,\nMuhammad Razi\nIndependent Developer" },
  { id: 2, name: "Casual Local Intro", tone: "Friendly", body: "Subject: local developer inquiry / {{company}}\n\nHey there,\n\nI'm Muhammad Razi, an independent web developer. I was scanning top cafes in {{city}} and {{company}} immediately stood out! Love what you guys are doing.\n\nI help restaurants automate their customer messages and WhatsApp replies so you never miss a review inquiry or booking request again. Do you have 10 minutes this Thursday for a casual chat?\n\nCheers,\nMuhammad Razi" },
  { id: 3, name: "Direct Message Automator", tone: "Direct", body: "Subject: feedback on {{company}}'s DMs?\n\nHi,\n\nQuick question: Who handles the social media booking inquiries for {{company}}?\n\nI'm a local developer and I build custom AI chat agents that reply to Instagram & Facebook DMs instantly, booking tables automatically without human staff lifting a finger.\n\nAre you free for a 5-minute call tomorrow?\n\nThanks,\nMuhammad Razi" }
];

export default function Campaigns({ 
  leads, 
  setLeads, 
  campaignRunning, 
  setCampaignRunning, 
  showToast, 
  geminiKey, 
  setGeminiKey, 
  gmailUser, 
  gmailPass,
  senderName = "Muhammad Razi",
  senderRole = "Independent Developer",
  companyName = "",
  useCompanyBranding = false,
  outreachStyle = "casual",
  pitchOffer = "whatsapp_bot",
  customOfferDetails = "",
  senderType = "developer",
  aboutText = "",
  portfolioUrl = "",
  socialLinkedin = "",
  socialGithub = "",
  socialTwitter = "",
  logoUrl = "",
  bannerUrl = "",
  profileIconUrl = "",
  schedulerActive,
  toggleScheduler,
  setTab
}) {
  const [campaignTab, setCampaignTab] = useState("composer");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedTone, setSelectedTone] = useState("Friendly");

  const [aiLoading, setAiLoading] = useState(false);
  const [generatedSubject, setGeneratedSubject] = useState("");
  const [generatedBody, setGeneratedBody] = useState("");
  const [customTemplates, setCustomTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSenderType, setNewTemplateSenderType] = useState("all");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const activeLeadId = selectedLeadId || (leads[0] ? leads[0].id.toString() : "");

  // Sequence Builder States
  const [sequences, setSequences] = useState([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState(null);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [editingSequence, setEditingSequence] = useState(null); // { id?: number, name: "", steps: [] }

  const fetchSequences = async () => {
    setLoadingSequences(true);
    try {
      const res = await fetch("/api/sequences", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSequences(data);
      }
    } catch (err) {
      console.error("Error fetching sequences:", err);
    } finally {
      setLoadingSequences(false);
    }
  };

  const fetchCampaignSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedSequenceId(data.sequence_id);
      }
    } catch (err) {
      console.error("Error fetching campaign settings:", err);
    }
  };

  useEffect(() => {
    fetchSequences();
    fetchCampaignSettings();
  }, []);

  const handleUpdateCampaignSequence = async (seqId) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          sequence_id: seqId === "" ? null : parseInt(seqId, 10)
        })
      });
      if (res.ok) {
        setSelectedSequenceId(seqId === "" ? null : parseInt(seqId, 10));
        showToast("Campaign sequence updated successfully!", "success");
      } else {
        showToast("Failed to update campaign sequence", "danger");
      }
    } catch (err) {
      showToast(err.message, "danger");
    }
  };

  const handleSaveSequence = async (e) => {
    e.preventDefault();
    if (!editingSequence.name.trim()) {
      showToast("Sequence name is required", "danger");
      return;
    }
    if (!editingSequence.steps || editingSequence.steps.length === 0) {
      showToast("At least one sequence step is required", "danger");
      return;
    }
    for (let i = 0; i < editingSequence.steps.length; i++) {
      const step = editingSequence.steps[i];
      if (!step.subject.trim() || !step.body.trim()) {
        showToast(`Step ${i + 1} must have a subject and a body`, "danger");
        return;
      }
    }

    try {
      const isNew = !editingSequence.id;
      const url = isNew ? "/api/sequences" : `/api/sequences/${editingSequence.id}`;
      const method = isNew ? "POST" : "PUT";
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: editingSequence.name.trim(),
          steps: editingSequence.steps
        })
      });

      if (res.ok) {
        showToast(isNew ? "Sequence created!" : "Sequence updated!", "success");
        setEditingSequence(null);
        fetchSequences();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to save sequence", "danger");
      }
    } catch (err) {
      showToast(err.message, "danger");
    }
  };

  const handleDeleteSequence = async (id) => {
    if (!confirm("Are you sure you want to delete this sequence?")) return;
    try {
      const res = await fetch(`/api/sequences/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        showToast("Sequence deleted successfully", "success");
        if (selectedSequenceId === id) {
          setSelectedSequenceId(null);
        }
        fetchSequences();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to delete sequence", "danger");
      }
    } catch (err) {
      showToast(err.message, "danger");
    }
  };

  const fetchCustomTemplates = async () => {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        setCustomTemplates(data);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    }
  };

  // Load custom templates on mount
  useEffect(() => {
    fetch("/api/templates")
      .then(res => {
        if (res.ok) return res.json();
      })
      .then(data => {
        if (data) setCustomTemplates(data);
      })
      .catch(err => {
        console.error("Failed to fetch templates on mount:", err);
      });
  }, []);

  const resolveTemplateText = (text, lead) => {
    if (!text || !lead) return "";
    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;
    return text
      .replace(/\{\{company\}\}/g, lead.name || "")
      .replace(/\{\{rating\}\}/g, lead.rating || "4.0")
      .replace(/\{\{reviews\}\}/g, lead.reviews || "0")
      .replace(/\{\{city\}\}/g, lead.city || "")
      .replace(/\{\{sender_name\}\}/g, senderName || "")
      .replace(/\{\{sender_role\}\}/g, senderRole || "")
      .replace(/\{\{company_name\}\}/g, companyName || "")
      .replace(/\{\{portfolio_url\}\}/g, portfolioUrl || "")
      .replace(/\{\{linkedin\}\}/g, socialLinkedin || "")
      .replace(/\{\{github\}\}/g, socialGithub || "")
      .replace(/\{\{twitter\}\}/g, socialTwitter || "")
      .replace(/\{\{about_text\}\}/g, aboutText || "")
      .replace(/\{\{logo_url\}\}/g, logoUrl || "")
      .replace(/\{\{banner_url\}\}/g, bannerUrl || "")
      .replace(/\{\{profile_icon_url\}\}/g, profileIconUrl || "")
      .replace(/\{\{signature\}\}/g, signature);
  };

  const handleSelectTemplate = (template) => {
    const lead = leads.find(l => l.id.toString() === activeLeadId);
    if (!lead) {
      showToast("Please select a lead first so we can personalize the template!", "warn");
      return;
    }
    
    let rawSubject;
    let rawBody;

    if (template.body.startsWith("Subject:")) {
      const split = template.body.split("\n\n");
      rawSubject = split[0].replace("Subject:", "").trim();
      rawBody = split.slice(1).join("\n\n").trim();
    } else {
      rawSubject = template.subject || `quick question about ${lead.name}`;
      rawBody = template.body;
    }

    setGeneratedSubject(resolveTemplateText(rawSubject, lead));
    setGeneratedBody(resolveTemplateText(rawBody, lead));
    showToast(`Template "${template.name}" applied and resolved!`, "success");
  };

  const handleSaveAsTemplate = async () => {
    if (!generatedBody) {
      showToast("Write or generate some email content first before saving as a template!", "warn");
      return;
    }
    if (!newTemplateName.trim()) {
      showToast("Please enter a name for your custom template.", "warn");
      return;
    }

    setSavingTemplate(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          subject: generatedSubject || "quick inquiry",
          body: generatedBody,
          sender_type: newTemplateSenderType
        })
      });
      if (res.ok) {
        showToast("Template saved to your custom library!", "success");
        setNewTemplateName("");
        fetchCustomTemplates();
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save template");
      }
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast("Template deleted", "info");
        fetchCustomTemplates();
      } else {
        showToast("Failed to delete template", "danger");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getSimulatedOutreach = (lead, tone) => {
    const s = `Subject: quick question about ${lead.name}\n\n`;
    const greeting = tone === "Friendly" ? `Hey, ${senderName} here,` : `Hi Team,`;
    const identity = (useCompanyBranding && companyName) ? `${senderRole} at ${companyName}` : senderRole;
    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;
    
    if (tone === "Friendly") {
      return s + `${greeting}\n\nI stumbled upon ${lead.name} in ${lead.city} while researching top local spots. With an amazing ${lead.rating}⭐ rating across ${lead.reviews} reviews, you guys are absolutely killing it!\n\nI'm a ${identity.toLowerCase()} and I build custom AI agents that automate customer inquiries across WhatsApp and Instagram DMs, ensuring you book 20% more tables without staff lifting a finger.\n\nWould you be open to a casual 10-minute check sometime this week?\n\nBest,\n${signature}`;
    } else if (tone === "ROI-Focused") {
      return s + `${greeting}\n\nI wanted to share a quick estimate: based on your ${lead.reviews} Google reviews in ${lead.city}, my model predicts you are losing up to $1,500 monthly in unreplied booking inquiries on social media.\n\nI design conversational AI agents that automate 85% of standard reservation FAQs instantly. Let's schedule a 10-minute review to see if we can reclaim those lost bookings.\n\nRegards,\n${signature}`;
    } else {
      return s + `${greeting}\n\nI build custom AI chatbots specifically tailored for ${lead.type} businesses like ${lead.name}.\n\nBy connecting directly to your bookings software, my AI agents book tables, answer FAQs, and reply to Instagram messages instantly. Setup takes less than 24 hours.\n\nLet me know if you're free for a quick Zoom call this Thursday.\n\nThanks,\n${signature}`;
    }
  };

  const generateEmailWithAntigravity = async () => {
    const lead = leads.find(l => l.id.toString() === activeLeadId);
    if (!lead) {
      showToast("Please select a valid lead first!", "warn");
      return;
    }

    setAiLoading(true);
    setGeneratedSubject("");
    setGeneratedBody("");

    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

    const promptText = `
      Create a highly personalized cold outreach email to a business owner.
      
      Sender Profile Context:
      - Account Type: ${senderType}
      - Sender Bio / Brand Description: ${aboutText}
      - Sender Portfolio Website: ${portfolioUrl || "None"}
      - Sender Social Media: LinkedIn: ${socialLinkedin || "None"}, GitHub: ${socialGithub || "None"}, Twitter: ${socialTwitter || "None"}
      - Branding Images: Logo URL: ${logoUrl || "None"}, Banner URL: ${bannerUrl || "None"}, Profile Icon URL: ${profileIconUrl || "None"}
 
      Business details:
      - Name: ${lead.name}
      - Niche Category: ${lead.type}
      - Location: ${lead.city}
      - Google Rating: ${lead.rating} out of 5 stars
      - Reviews Count: ${lead.reviews}
      - Instagram handle: ${lead.instagram || "None"}
      - Website: ${lead.website || "None"}
      - Website Status: ${lead.website_status || "unknown"} (can be "active", "no_website", or "down")
      
      Outreach Guidelines:
      - Tone: ${selectedTone}
      - Copywriting Angle Style: ${outreachStyle === "roi" ? "ROI-Focused" : outreachStyle === "feedback" ? "Opinion/Feedback on Google Reviews/Ratings" : outreachStyle === "direct" ? "Pre-built Custom AI Chatbot Prototype Preview" : "Casual & Friendly Tech Pitch"}
      - Core Pitch Offer: ${pitchOffer === "whatsapp_bot" ? "Automating customer bookings, reservation FAQs, and Instagram/WhatsApp messages using custom conversational AI agents." : pitchOffer === "website_dev" ? "Designing and developing modern, responsive high-performing websites to capture traffic." : pitchOffer === "ai_chatbot" ? "Building custom AI chatbot assistants that reply to inquiries instantly on Google Maps/IG." : customOfferDetails}
      - Personalization Rules:
        - Incorporate sender's bio context ("${aboutText}") to state why you are reaching out and highlight relevant skills/background.
        - If a portfolio URL (${portfolioUrl}) or social links (like GitHub ${socialGithub} or LinkedIn ${socialLinkedin}) are provided, naturally mention them to build high credibility.
        - If pitching website design/development (website_dev):
          - If Website Status is "no_website", pitch why a website helps capture local search traffic.
          - If Website Status is "down", offer to help fix or rebuild their broken site.
          - If Website Status is "active", suggest subtle improvements.
      - Call to Action: Friendly offer for a 10-minute quick preview.
      - Signature: Use exactly this signature:
        Cheers,
        ${signature}
      - Instructions: Keep it casual, brief, and highly compelling. Never sound like a spammy sales script. 
      - Format: Output ONLY the email. Start with a "Subject: " line on the first line, then a blank line, and then the email body. Use short lowercase click-worthy subject lines.
    `;

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `AI generation failed with status ${response.status}`);
      }
      const data = await response.json();
      const fullResponse = data.text || "";
      
      if (fullResponse.startsWith("Subject:")) {
        const split = fullResponse.split("\n\n");
        setGeneratedSubject(split[0].replace("Subject:", "").trim());
        setGeneratedBody(split.slice(1).join("\n\n").trim());
      } else {
        setGeneratedSubject(`Custom Outreach for ${lead.name}`);
        setGeneratedBody(fullResponse);
      }
      showToast("Email draft generated successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("AI connection error. Using local fallback.", "warn");
      const simulated = getSimulatedOutreach(lead, selectedTone);
      const split = simulated.split("\n\n");
      setGeneratedSubject(split[0].replace("Subject:", "").trim());
      setGeneratedBody(split.slice(1).join("\n\n").trim());
    } finally {
      setAiLoading(false);
    }
  };

  const sendGeneratedEmail = async () => {
    if (!generatedBody) return;
    const lead = leads.find(l => l.id.toString() === activeLeadId);
    if (!lead) {
      showToast("Please select a valid lead first!", "warn");
      return;
    }

    if (!lead.email) {
      showToast("Selected lead does not have a public email address. Cannot send outreach.", "danger");
      return;
    }

    if (gmailUser && gmailPass) {
      showToast("Sending email via Gmail SMTP...", "info");
      try {
        const mailResponse = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gmailUser,
            gmailPass,
            to: lead.email,
            subject: generatedSubject || `quick query for ${lead.name}`,
            body: generatedBody,
            leadId: lead.id
          })
        });
        if (!mailResponse.ok) {
          const errData = await mailResponse.json().catch(() => ({}));
          throw new Error(errData.error || `SMTP error ${mailResponse.status}`);
        }
      } catch (mailErr) {
        console.error("Failed to send real email via SMTP:", mailErr);
        showToast(`Gmail transmission failed: ${mailErr.message}`, "danger");
        return;
      }
    }

    try {
      const response = await fetch(`/api/leads/${activeLeadId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contacted" })
      });
      if (!response.ok) throw new Error("Failed to update status");
      
      setLeads(ls => ls.map(l => l.id.toString() === activeLeadId ? { ...l, status: "contacted" } : l));
      if (gmailUser && gmailPass) {
        showToast(`Real email sent and lead advanced to 'contacted' stage!`, "success");
      } else {
        showToast(`Gmail disconnected. Simulated email queued and lead advanced!`, "success");
      }
      setGeneratedSubject("");
      setGeneratedBody("");
    } catch (err) {
      console.error(err);
      showToast("Failed to update lead status in database", "danger");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
      
      {/* Module Title Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Outreach Campaigns</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Design B2B cold email sequences, compose live Antigravity pitches, or toggle background Autopilot execution.
          </p>
        </div>
        
        {leads.some(l => l.status !== "not contacted" && l.status !== "new") && (
          <button 
            type="button"
            className="btn btn-outline btn-sm"
            style={{ 
              fontSize: "12px", 
              borderColor: "rgba(245, 158, 11, 0.4)", 
              color: "var(--color-amber)",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
            onClick={async () => {
              try {
                const res = await fetch("/api/leads/reset-status", { method: "PUT" });
                if (!res.ok) throw new Error("Failed to reset status");
                const updatedLeads = await res.json();
                const parsed = updatedLeads.map(l => ({
                  ...l,
                  rating: l.rating ? parseFloat(l.rating) : 4.0,
                  reviews: l.reviews ? parseInt(l.reviews) : 0
                }));
                setLeads(parsed);
                showToast("All leads reset to 'Not Contacted' status!", "success");
              } catch {
                showToast("Failed to reset lead statuses", "danger");
              }
            }}
          >
            🔄 Reset Leads status
          </button>
        )}
      </div>

      {/* Tabbed Outreach Workspace Sub-menu */}
      <div style={{ 
        display: "flex", 
        borderBottom: "1px solid var(--border-translucent)", 
        gap: "24px", 
        paddingBottom: "2px",
        marginTop: "8px"
      }}>
        {[
          { id: "composer", label: "✉️ Single Outreach Composer", desc: "Manual Client Loop" },
          { id: "sequences", label: "⛓️ Drip Sequences Builder", desc: "Multi-Step Sequences" },
          { id: "autopilot", label: "🤖 Autopilot Core & Stats", desc: "Autonomous background dispatcher" }
        ].map(tb => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setCampaignTab(tb.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: campaignTab === tb.id ? "2px solid var(--color-lime)" : "2px solid transparent",
              color: campaignTab === tb.id ? "var(--color-lime)" : "var(--text-secondary)",
              padding: "8px 4px 12px 4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "2px",
              transition: "all 0.2s"
            }}
          >
            <span>{tb.label}</span>
            <span style={{ fontSize: "10px", fontWeight: 500, color: "var(--text-muted)" }}>{tb.desc}</span>
          </button>
        ))}
      </div>

      {/* Strategy Info Alert Banner comparing Auto vs Manual */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: "14px 20px", 
          background: "var(--bg-translucent-mild)", 
          borderLeft: "4px solid var(--color-indigo)", 
          borderRadius: "8px" 
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px" }}>💡</span>
          <div style={{ fontSize: "12px", lineHeight: "1.5", color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Campaign Strategy Tip:</strong>
            {" "}Use the <strong style={{ color: "var(--color-lime)" }}>Composer</strong> to qualify individual, high-value leads client-side (Manual review loop). Use the <strong style={{ color: "var(--color-indigo)" }}>Autopilot Tab</strong> to enable background automation running cron scans daily through database endpoints (Auto Autopilot).
          </div>
        </div>
      </div>

      {/* Composer Tab */}
      {campaignTab === "composer" && (
        <div className="campaign-grid" style={{ animation: "fadeIn 0.25s ease-out" }}>
          {/* Main Left Column Composer */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>🤖 Live Antigravity AI Composer</h3>
              <span className="badge" style={{ background: "var(--color-indigo-glow)", color: "var(--color-indigo)", fontSize: "9px" }}>Manual Loop</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>Select Scraped Lead</label>
                  <select 
                    className="input-field" 
                    value={activeLeadId} 
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    style={{ height: "39px" }}
                  >
                    {leads.length === 0 ? (
                      <option value="">-- No Leads Found --</option>
                    ) : (
                      leads.map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.city})</option>
                      ))
                    )}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>AI Voice Tone</label>
                  <select 
                    className="input-field" 
                    value={selectedTone} 
                    onChange={(e) => setSelectedTone(e.target.value)}
                    style={{ height: "39px" }}
                  >
                    <option value="Friendly">Friendly & Warm</option>
                    <option value="ROI-Focused">ROI & Review Metrics Analysis</option>
                    <option value="Direct">Short & Direct Pitch</option>
                  </select>
                </div>
              </div>

              <button 
                className="btn btn-indigo" 
                style={{ width: "100%", marginTop: "6px", fontWeight: 700 }}
                onClick={generateEmailWithAntigravity}
                disabled={aiLoading || leads.length === 0}
              >
                {aiLoading ? "✨ Antigravity is crawling metrics and drafting..." : "✨ Generate Outreach Email using Antigravity"}
              </button>
            </div>

            {(generatedBody || aiLoading) && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px", animation: "fadeIn 0.25s ease-out" }}>
                {aiLoading ? (
                  <div style={{ padding: "40px", background: "var(--bg-translucent-mild)", borderRadius: "8px", border: "var(--border-subtle)", textAlign: "center", color: "var(--color-indigo)", fontWeight: 600 }}>
                    Generating personalized pitch...
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700 }}>EMAIL SUBJECT</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        value={generatedSubject} 
                        onChange={(e) => setGeneratedSubject(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700 }}>EMAIL BODY</label>
                      <textarea 
                        className="input-field" 
                        style={{ minHeight: "220px", fontFamily: "var(--font-sans)", lineHeight: "1.6" }}
                        value={generatedBody}
                        onChange={(e) => setGeneratedBody(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => { setGeneratedSubject(""); setGeneratedBody(""); }}>Discard</button>
                      <button className="btn btn-lime btn-sm" onClick={sendGeneratedEmail}>📧 Send Email via SMTP</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Column Composer Utilities */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Template Library */}
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)" }}>📋 Templates Library</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-indigo)", letterSpacing: "0.05em" }}>System Default Templates</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {SYSTEM_TEMPLATES.map((tmpl) => (
                    <div 
                      key={`sys-${tmpl.id}`}
                      onClick={() => handleSelectTemplate(tmpl)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: "var(--bg-translucent-mild)",
                        border: "var(--border-subtle)",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                      className="sidebar-nav-btn"
                    >
                      <div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>{tmpl.name}</span>
                        <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Tone: {tmpl.tone}</span>
                      </div>
                      <span className="badge" style={{ background: "rgba(99,102,241,0.06)", color: "var(--color-indigo)", fontSize: "9px" }}>System</span>
                    </div>
                  ))}
                </div>

                {customTemplates.length > 0 && (
                  <>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-lime)", letterSpacing: "0.05em", marginTop: "12px" }}>My Custom Templates</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "140px", overflowY: "auto" }}>
                      {customTemplates.map((tmpl) => (
                        <div 
                          key={`custom-${tmpl.id}`}
                          onClick={() => handleSelectTemplate(tmpl)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "var(--bg-translucent-mild)",
                            border: "var(--border-subtle)",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                          className="sidebar-nav-btn"
                        >
                          <div>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>{tmpl.name}</span>
                            <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Target: {tmpl.sender_type || "all"}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="badge" style={{ background: "rgba(99,102,241,0.06)", color: "var(--color-lime)", fontSize: "9px" }}>Custom</span>
                            <button 
                              onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                              style={{ background: "transparent", border: "none", color: "var(--color-crimson)", cursor: "pointer", fontSize: "11px" }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Reference Sheet */}
            <div className="glass-panel" style={{ padding: "16px", fontSize: "11px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <strong>📌 Dynamic Placeholders Guide:</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontFamily: "monospace", fontSize: "10px" }}>
                <div>{"{{company}}"} : Lead Name</div>
                <div>{"{{city}}"} : Lead City</div>
                <div>{"{{rating}}"} : Rating Score</div>
                <div>{"{{reviews}}"} : Review Count</div>
                <div>{"{{sender_name}}"} : Your Name</div>
                <div>{"{{portfolio_url}}"} : Website</div>
              </div>
            </div>

            {/* Save Current Draft */}
            {generatedBody && (
              <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "10px", border: "1px dashed var(--border-translucent)" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>💾 Save Current Draft as Template</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Template Name..." 
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                  <select 
                    className="input-field" 
                    value={newTemplateSenderType} 
                    onChange={(e) => setNewTemplateSenderType(e.target.value)}
                    style={{ height: "34px", fontSize: "12px" }}
                  >
                    <option value="all">General / All Profiles</option>
                    <option value="company">Company Profile Only</option>
                    <option value="developer">Developer Profile Only</option>
                  </select>
                  <button className="btn btn-lime btn-sm" onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                    {savingTemplate ? "Saving..." : "Save Template"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Drip Sequences Tab */}
      {campaignTab === "sequences" && (
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.25s ease-out" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>⛓️ Drip Sequences & Follow-Ups</h3>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Build multi-step cold outreach flows that automatically send follow-up emails at specific intervals if the lead remains uncontacted.
              </p>
            </div>
            <button 
              type="button" 
              className="btn btn-indigo" 
              onClick={() => setEditingSequence({ name: "", steps: [{ delay_days: 0, subject: "", body: "" }] })}
            >
              ➕ Create Custom Sequence
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--bg-translucent-mild)", padding: "12px 16px", borderRadius: "8px", border: "var(--border-subtle)" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Active Outreach Drip Sequence:</span>
            <select 
              className="input-field" 
              value={selectedSequenceId || ""} 
              onChange={(e) => handleUpdateCampaignSequence(e.target.value)}
              style={{ maxWidth: "280px", height: "36px" }}
            >
              <option value="">-- No Sequence (Single Pitch Email Only) --</option>
              {sequences.map(seq => (
                <option key={seq.id} value={seq.id}>{seq.name} ({seq.steps?.length || 0} steps)</option>
              ))}
            </select>
          </div>

          {editingSequence && (
            <form onSubmit={handleSaveSequence} style={{ background: "var(--bg-translucent-mild)", padding: "20px", borderRadius: "10px", border: "1px dashed var(--color-indigo-border)", display: "flex", flexDirection: "column", gap: "16px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {editingSequence.id ? "📝 Edit Sequence" : "⚙️ Design New Sequence"}
              </h4>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Sequence Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editingSequence.name} 
                  onChange={(e) => setEditingSequence({ ...editingSequence, name: e.target.value })} 
                  placeholder="e.g. 3-Step Restaurant Cold Pitch" 
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {editingSequence.steps.map((step, idx) => (
                  <div key={idx} style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-indigo)" }}>Step {idx + 1} {idx === 0 ? "(Initial Pitch)" : `(Follow-Up)`}</span>
                      {idx > 0 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const steps = [...editingSequence.steps];
                            steps.splice(idx, 1);
                            setEditingSequence({ ...editingSequence, steps });
                          }}
                          style={{ border: "none", background: "none", color: "var(--color-crimson)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
                        >
                          Remove Step
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: "250px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Email Subject</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          value={step.subject} 
                          onChange={(e) => {
                            const steps = [...editingSequence.steps];
                            steps[idx].subject = e.target.value;
                            setEditingSequence({ ...editingSequence, steps });
                          }} 
                          placeholder="quick question about {{company}}..." 
                        />
                      </div>
                      {idx > 0 && (
                        <div style={{ width: "120px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          <label style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Delay (Days)</label>
                          <input 
                            type="number" 
                            className="input-field" 
                            value={step.delay_days} 
                            onChange={(e) => {
                              const steps = [...editingSequence.steps];
                              steps[idx].delay_days = parseInt(e.target.value, 10) || 3;
                              setEditingSequence({ ...editingSequence, steps });
                            }} 
                            min="1" 
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Email Body</label>
                      <textarea 
                        className="input-field" 
                        style={{ height: "100px", fontFamily: "inherit", fontSize: "12px", resize: "vertical" }}
                        value={step.body} 
                        onChange={(e) => {
                          const steps = [...editingSequence.steps];
                          steps[idx].body = e.target.value;
                          setEditingSequence({ ...editingSequence, steps });
                        }} 
                        placeholder="Hi team,\n\nI wanted to follow up on..." 
                      />
                    </div>
                  </div>
                ))}

                <button 
                  type="button" 
                  className="btn btn-outline" 
                  style={{ height: "36px", borderStyle: "dashed" }}
                  onClick={() => {
                    const steps = [...editingSequence.steps, { delay_days: 3, subject: "", body: "" }];
                    setEditingSequence({ ...editingSequence, steps });
                  }}
                >
                  ➕ Add Subsequent Step
                </button>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingSequence(null)}>Cancel</button>
                <button type="submit" className="btn btn-indigo">Save Sequence</button>
              </div>
            </form>
          )}

          {loadingSequences ? (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Loading sequences...</div>
          ) : sequences.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "12px" }}>
              No drip sequences created yet. Click "+ Create Custom Sequence" to start.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
              {sequences.map(seq => (
                <div key={seq.id} style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-translucent-mild)", padding: "14px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h5 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{seq.name}</h5>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{seq.steps?.length || 0} drip steps</span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button 
                        type="button"
                        onClick={() => setEditingSequence(seq)} 
                        style={{ border: "none", background: "none", color: "var(--color-indigo)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
                      >
                        Edit
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleDeleteSequence(seq.id)} 
                        style={{ border: "none", background: "none", color: "var(--color-crimson)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", color: "var(--text-muted)" }}>
                    {seq.steps?.map((step, sidx) => (
                      <div key={step.id || sidx} style={{ display: "flex", gap: "6px" }}>
                        <span>Step {sidx + 1}:</span>
                        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flex: 1, color: "var(--text-secondary)" }}>
                          {step.subject} {sidx > 0 && `(after ${step.delay_days}d)`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autopilot Tab */}
      {campaignTab === "autopilot" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.25s ease-out" }}>
          
          {/* Autopilot Status Panel */}
          <div 
            className="glass-panel" 
            style={{ 
              padding: "24px", 
              background: schedulerActive 
                ? "linear-gradient(135deg, var(--color-lime-glow) 0%, var(--bg-card) 100%)" 
                : "linear-gradient(135deg, rgba(255, 255, 255, 0.01) 0%, var(--bg-card) 100%)",
              border: schedulerActive 
                ? "1px solid var(--color-lime-border)" 
                : "1px solid var(--border-translucent)",
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              flexWrap: "wrap", 
              gap: "20px",
              borderRadius: "16px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: "280px" }}>
              <div style={{ 
                width: "48px", 
                height: "48px", 
                borderRadius: "50%", 
                background: schedulerActive ? "var(--color-lime-glow)" : "var(--bg-translucent-mild)",
                border: schedulerActive ? "1px solid var(--color-lime-border)" : "1px solid var(--border-translucent)",
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                fontSize: "22px"
              }}>
                🤖
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Background Autopilot Status</h4>
                  <span className="badge" style={{ 
                    background: schedulerActive ? "var(--color-lime-glow)" : "rgba(255, 255, 255, 0.05)", 
                    color: schedulerActive ? "var(--color-lime)" : "var(--text-muted)",
                    border: schedulerActive ? "1px solid var(--color-lime-border)" : "1px solid rgba(255, 255, 255, 0.1)",
                    fontSize: "10px"
                  }}>
                    {schedulerActive ? "ACTIVE" : "PAUSED"}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: "1.5" }}>
                  {schedulerActive 
                    ? "Syntek is actively synchronizing PostgreSQL leads and sending secure emails through our background server scheduler."
                    : "Autopilot is paused. Outreach background schedules will not run autonomously."}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button 
                type="button" 
                className={`btn btn-sm ${schedulerActive ? "btn-danger" : "btn-lime"}`}
                onClick={() => toggleScheduler(!schedulerActive)}
                style={{ fontWeight: "bold", padding: "10px 16px" }}
              >
                {schedulerActive ? "Pause Autopilot" : "Enable Autopilot"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
            {/* Optimizations */}
            <div className="glass-panel" style={{ padding: "20px", border: "var(--border-glow)", background: "var(--color-lime-glow)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-lime)", fontWeight: 800, fontSize: "12px", textTransform: "uppercase", marginBottom: "8px" }}>
                <span>Antigravity Grounded Optimization</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.6", margin: 0 }}>
                Autopilot scans database statuses daily. It skips profiles that have broken links or active websites, focusing outreach efforts strictly on high-converting local service prospects.
              </p>
            </div>
          </div>

          {/* Queue Settings Table */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)" }}>Active Queue Parameters</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "Daily Email Throttle", val: "100 emails / day", color: "var(--color-indigo)" },
                { label: "Follow-up Cadence", val: "Automatic after 3 days", color: "var(--color-amber)" },
                { label: "Outbox Secure Credentials", val: "Gmail TLS App Key Integrationing", color: "var(--color-emerald)" }
              ].map((setting, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "10px", borderBottom: "1px solid var(--border-translucent)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{setting.label}</span>
                  <span className="badge" style={{ background: "var(--bg-translucent-subtle)", color: setting.color, border: "1px solid var(--border-translucent)" }}>
                    {setting.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
