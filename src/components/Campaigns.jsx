import { useState, useEffect } from "react";

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
  const [campVersions, setCampVersions] = useState(null);
  const [campThinking, setCampThinking] = useState("");

  // Sent Email Tracker
  const [sentLeads, setSentLeads] = useState([]);
  const [sentTrackerLoading, setSentTrackerLoading] = useState(false);
  const [trackerFilter, setTrackerFilter] = useState("all"); // all | opened | unopened

  // Follow-Up Queue
  const [followupQueue, setFollowupQueue] = useState([]);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState({});
  const [generatingStrategy, setGeneratingStrategy] = useState({});
  const [sendingAll, setSendingAll] = useState(false);

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

  const fetchSentLeads = async () => {
    setSentTrackerLoading(true);
    try {
      const res = await fetch("/api/leads/sent-tracker", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSentLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch sent leads tracker:", err);
    } finally {
      setSentTrackerLoading(false);
    }
  };

  useEffect(() => {
    fetchSequences();
    fetchCampaignSettings();
    fetchSentLeads();
    const interval = setInterval(fetchSentLeads, 30000);
    return () => clearInterval(interval);
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
    const templateIndex = Math.abs(lead.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 5;
    const identity = (useCompanyBranding && companyName) ? `${senderRole} at ${companyName}` : senderRole;
    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

    if (templateIndex === 0) {
      return `Subject: Quick idea about ${lead.name}\n\nHi,\n\nI came across ${lead.name} and noticed a few opportunities where your website or reservation experience could be improved.\n\nMany local businesses lose customers because of slow response times, manual processes, or outdated layouts. I help owners fix exactly those problems by building scalable web applications and automated reservation systems.\n\nWould you be open to a quick conversation to see if there are any easy wins for ${lead.name}?\n\nBest,\n${signature}`;
    } else if (templateIndex === 1) {
      return `Subject: One thing I noticed on ${lead.name}\n\nHi,\n\nI spent a few minutes looking through ${lead.name} and one thing immediately stood out. With your great ${lead.rating}⭐ rating on Google, a lot of new customers must be finding you online every day.\n\nI build custom web applications, SaaS platforms, and AI booking tools that help popular businesses convert that search traffic into bookings and sales automatically.\n\nHappy to share a few ideas if you're interested.\n\nThanks,\n${signature}`;
    } else if (templateIndex === 2) {
      return `Subject: Curious question\n\nHi,\n\nQuick question — are you currently planning to build any new digital features/bookings this quarter, or are you mostly focused on your current setup?\n\nI ask because I help startups and local businesses like ${lead.name} implement custom reservation systems, websites, and chat automations without the cost of a full-time engineering team.\n\nWould love to learn what you're working on.\n\nRegards,\n${signature}`;
    } else if (templateIndex === 3) {
      return `Subject: Saving time at ${lead.name}\n\nHi,\n\nOne of the biggest challenges I see with popular businesses like ${lead.name} is getting reservation inquiries and website updates handled quickly without slowing down your day-to-day operations.\n\nI help founders and owners save hours by building scalable web platforms and automated messaging setups.\n\nIf you ever need an experienced development partner, I'd be happy to chat.\n\nBest,\n${signature}`;
    } else {
      return `Subject: If web/booking updates are on your roadmap...\n\nHi,\n\nIf expanding your digital presence or adding new features/booking systems is on your roadmap this year, I'd love to introduce myself.\n\nI help businesses like ${lead.name} build custom websites, dashboards, and automated reservation bots from idea to launch.\n\nIf that's something you anticipate needing, I'd be happy to discuss how I could help.\n\nBest regards,\n${signature}`;
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
    setCampVersions(null);
    setCampThinking("");

    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

    const pitchOfferLabel = {
      whatsapp_bot: "WhatsApp booking bot", website_dev: "website design",
      ai_chatbot: "AI chatbot", custom: "Custom Tailored Service",
    }[pitchOffer] || pitchOffer;

    const customOfferContext = pitchOffer === "custom" && customOfferDetails
      ? `\n- Custom Pitch Context (Use this to understand the specific service you offer): ${customOfferDetails}`
      : "";

    const promptText = `You are ${senderName}, working as "${senderRole}"${(useCompanyBranding && companyName) ? ` at ${companyName}` : ""}.
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
- Target niche inferred from selected lead: ${lead.type || "unknown"}
- Target location inferred from selected lead: ${lead.city || "unknown"}
- Sender type: ${senderType}
- Portfolio: ${portfolioUrl || "None"}
- Social proof links: LinkedIn ${socialLinkedin || "None"}, GitHub ${socialGithub || "None"}, Twitter ${socialTwitter || "None"}
Tone: ${selectedTone}, warm, direct, conversational, human.
Bio context: ${aboutText || "local developer helping businesses grow"}
${workSamples ? `Work samples: ${workSamples}` : ""}

BANNED PHRASES: Do NOT use phrases like "Hope you're doing well", "I came across your website", "Just checking in", "Wanted to reach out", "We are the best", "Industry-leading", "Revolutionary", "Game changer", "Guaranteed", "World class".

PITCH STRATEGY RULES:
- Do not pitch from a fixed template. First infer the industry, customer journey, likely buyer pain, and best matching business outcome from the selected offer/custom offer and this lead's data.
- If the user selected a preset offer, translate it into the lead's industry language. For example, a booking bot means fewer missed reservations for cafes, fewer missed appointment requests for salons/clinics, faster quote capture for home services, and instant FAQ handling for gyms or studios.
- If the user selected a custom offer, treat the custom text as strategic context, not copy. Extract the core result, ideal customer, pain point, and proof angle, then rewrite it naturally for this exact lead.
- Use the user's work samples only when relevant. If no work sample matches, refer to experience generally and do not invent a case study.
- Use the existing icebreaker if it is specific and useful. If it is generic, create a stronger one from the lead's rating, reviews, niche, location, website status, social profile, or missing booking/contact flow.
- The pitch must answer: why this business, why this offer, why now, and what low-friction next step makes sense.

AI THINKING STEP-BY-STEP PROCESS:
1. Identify what the company actually does, their target customers, and brand positioning.
2. Infer the best industry-specific pitch angle from selected offer/custom offer + the lead's actual data.
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
- "closing": Cheers, ${senderName}${(companyName) ? `\\n${senderRole}\\n${companyName}` : `\\n${senderRole}`}
- "followUp1": "Subject: [follow up subject]\\n\\n[A short, friendly follow-up email text sent 3 days later, referencing the previous idea and offering simple value or permission to share a mockup]"
- "followUp2": "Subject: [follow up subject]\\n\\n[A short, conversational second follow-up text sent 7 days later, simple and low pressure]"
- "linkedinConnection": "A short, friendly LinkedIn connection request message (max 300 characters, no sales pitch, just warm networking context)"
- "linkedinFollowUp": "A short, conversational follow-up message to send once they accept the LinkedIn connection"
- "shortVersion": "Subject: [short subject]\\n\\n[An ultra-concise email version under 60 words body]"
- "longVersion": "Subject: [long subject]\\n\\n[A deconstructive, high-impact version under 150 words body]"

Do NOT wrap the JSON inside markdown code blocks. Return a raw JSON string.`;

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
      
      try {
        const parsed = JSON.parse(fullResponse);
        setCampThinking(parsed.thinking || "AI generated research details for this lead.");
        const fullBody = `${parsed.opening}\n\n${parsed.personalizedBody}\n\n${parsed.valueProposition}\n\n${parsed.cta}\n\n${parsed.closing}`;
        setGeneratedSubject(parsed.subject || `Quick question about ${lead.name}`);
        setGeneratedBody(fullBody);
        setCampVersions(parsed);
        showToast("Email draft generated successfully!", "success");
      } catch (jsonErr) {
        console.error("Failed to parse JSON response:", fullResponse);
        setGeneratedSubject(`Custom Outreach for ${lead.name}`);
        setGeneratedBody(fullResponse);
        setCampThinking("Failed to parse structured AI intelligence. Raw email draft is shown.");
      }
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
          { id: "composer",  label: "✉️ Single Outreach Composer",   desc: "Manual Client Loop" },
          { id: "sequences", label: "⛓️ Drip Sequences Builder",      desc: "Multi-Step Sequences" },
          { id: "autopilot", label: "🤖 Autopilot Core & Stats",       desc: "Autonomous background dispatcher" },
          { id: "tracker",   label: "📬 Sent Email Tracker",           desc: "Open / Unopened status" },
          { id: "followup",  label: "📅 Follow-Up Queue",             desc: "AI smart follow-up engine" },
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
                    {campThinking && (
                      <div style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.15)", borderRadius: "8px", padding: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        <div style={{ fontWeight: 700, color: "var(--color-indigo)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span>🧠</span> AI Research & Strategy Analysis:
                        </div>
                        <div>{campThinking}</div>
                      </div>
                    )}

                    {campVersions && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "4px" }}>
                        {[
                          { id: "standard", label: "📧 Standard" },
                          { id: "followUp1", label: "⏰ Follow-up #1" },
                          { id: "followUp2", label: "⏰ Follow-up #2" },
                          { id: "linkedinConnection", label: "💬 LI Invite" },
                          { id: "linkedinFollowUp", label: "💬 LI Follow-up" },
                          { id: "shortVersion", label: "⚡ Short" },
                          { id: "longVersion", label: "📝 Long" },
                        ].map((v) => (
                          <button
                            key={v.id}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "4px 8px", fontSize: "11px", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}
                            onClick={() => {
                              const lead = leads.find(l => l.id.toString() === activeLeadId);
                              if (!lead) return;
                              if (v.id === "standard") {
                                const fullBody = `${campVersions.opening}\n\n${campVersions.personalizedBody}\n\n${campVersions.valueProposition}\n\n${campVersions.cta}\n\n${campVersions.closing}`;
                                setGeneratedSubject(campVersions.subject || `Quick question about ${lead.name}`);
                                setGeneratedBody(fullBody);
                              } else if (v.id === "followUp1") {
                                const parts = (campVersions.followUp1 || "").split("\n\n");
                                const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Follow up: ${lead.name}`;
                                const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : campVersions.followUp1;
                                setGeneratedSubject(sub);
                                setGeneratedBody(bdy);
                              } else if (v.id === "followUp2") {
                                const parts = (campVersions.followUp2 || "").split("\n\n");
                                const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Re: ${lead.name}`;
                                const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : campVersions.followUp2;
                                setGeneratedSubject(sub);
                                setGeneratedBody(bdy);
                              } else if (v.id === "linkedinConnection") {
                                setGeneratedSubject("LinkedIn connection invitation context");
                                setGeneratedBody(campVersions.linkedinConnection || "");
                              } else if (v.id === "linkedinFollowUp") {
                                setGeneratedSubject("LinkedIn follow-up chat message");
                                setGeneratedBody(campVersions.linkedinFollowUp || "");
                              } else if (v.id === "shortVersion") {
                                const parts = (campVersions.shortVersion || "").split("\n\n");
                                const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Quick note: ${lead.name}`;
                                const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : campVersions.shortVersion;
                                setGeneratedSubject(sub);
                                setGeneratedBody(bdy);
                              } else if (v.id === "longVersion") {
                                const parts = (campVersions.longVersion || "").split("\n\n");
                                const sub = parts[0]?.startsWith("Subject:") ? parts[0].replace("Subject:", "").trim() : `Detailed overview: ${lead.name}`;
                                const bdy = parts[0]?.startsWith("Subject:") ? parts.slice(1).join("\n\n").trim() : campVersions.longVersion;
                                setGeneratedSubject(sub);
                                setGeneratedBody(bdy);
                              }
                              showToast(`Loaded ${v.label} draft!`, "info");
                            }}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}

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
                      <button className="btn btn-outline btn-sm" onClick={() => { setGeneratedSubject(""); setGeneratedBody(""); setCampVersions(null); setCampThinking(""); }}>Discard</button>
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
                {customTemplates.length === 0 ? (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No custom templates saved yet. Save a generated draft to library to reuse it.
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-lime)", letterSpacing: "0.05em" }}>My Custom Templates</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
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

      {/* Sent Email Tracker Tab */}
      {campaignTab === "tracker" && (() => {
        const filtered = sentLeads.filter(l =>
          trackerFilter === "all" ? true :
          trackerFilter === "opened" ? l.is_opened :
          !l.is_opened
        );
        const total = sentLeads.length;
        const opened = sentLeads.filter(l => l.is_opened).length;
        const unopened = total - opened;
        const openRate = total > 0 ? Math.round((opened / total) * 100) : 0;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.25s ease-out" }}>

            {/* Stats Header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
              {[
                { label: "Total Sent", value: total, icon: "📧", color: "var(--color-indigo)" },
                { label: "Opened", value: opened, icon: "👁️", color: "var(--color-lime)" },
                { label: "Unopened", value: unopened, icon: "📩", color: "var(--color-amber)" },
                { label: "Open Rate", value: `${openRate}%`, icon: "📈", color: openRate >= 30 ? "var(--color-emerald)" : openRate >= 10 ? "var(--color-amber)" : "var(--color-rose)" },
              ].map((stat, i) => (
                <div key={i} className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
                  <span style={{ fontSize: "28px" }}>{stat.icon}</span>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 900, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Open Rate Progress Bar */}
            <div className="glass-panel" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>📊 Open Rate</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: openRate >= 30 ? "var(--color-emerald)" : openRate >= 10 ? "var(--color-amber)" : "var(--color-rose)" }}>{openRate}%</span>
              </div>
              <div style={{ height: "8px", background: "var(--bg-translucent-mild)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${openRate}%`, background: openRate >= 30 ? "linear-gradient(90deg, var(--color-lime), var(--color-emerald))" : openRate >= 10 ? "linear-gradient(90deg, var(--color-amber), #f97316)" : "linear-gradient(90deg, #ef4444, #dc2626)", borderRadius: "999px", transition: "width 0.8s ease" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                {openRate >= 30 ? "🔥 Excellent open rate! Your subject lines are working great." : openRate >= 10 ? "✅ Average open rate. Try A/B testing your subject lines." : total === 0 ? "No emails sent yet. Run a campaign to start tracking." : "⚠️ Low open rate. Consider personalizing subject lines more."}
              </div>
            </div>

            {/* Filter + Refresh Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                {["all", "opened", "unopened"].map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTrackerFilter(f)}
                    className="btn btn-sm"
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "6px 14px",
                      borderRadius: "999px",
                      background: trackerFilter === f
                        ? (f === "opened" ? "var(--color-lime-glow)" : f === "unopened" ? "rgba(245,158,11,0.15)" : "rgba(99,102,241,0.15)")
                        : "var(--bg-translucent-mild)",
                      color: trackerFilter === f
                        ? (f === "opened" ? "var(--color-lime)" : f === "unopened" ? "var(--color-amber)" : "var(--color-indigo)")
                        : "var(--text-secondary)",
                      border: trackerFilter === f
                        ? (f === "opened" ? "1px solid var(--color-lime-border)" : f === "unopened" ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(99,102,241,0.3)")
                        : "1px solid var(--border-translucent)"
                    }}
                  >
                    {f === "all" ? `All (${total})` : f === "opened" ? `👁️ Opened (${opened})` : `📩 Unopened (${unopened})`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={fetchSentLeads}
                disabled={sentTrackerLoading}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                {sentTrackerLoading ? "Refreshing..." : "🔄 Refresh"}
              </button>
            </div>

            {/* Leads Table */}
            <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                  {total === 0 ? "No emails sent yet. Run the Autopilot or manually send emails to start tracking." : `No ${trackerFilter} emails found.`}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-translucent)", background: "var(--bg-translucent-mild)" }}>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lead</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Open Status</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Opened At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lead, idx) => (
                      <tr
                        key={lead.id}
                        style={{
                          borderBottom: "1px solid var(--border-translucent)",
                          background: idx % 2 === 0 ? "transparent" : "var(--bg-translucent-subtle)",
                          transition: "background 0.15s"
                        }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{lead.name}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{lead.city} · {lead.type}</div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "12px" }}>
                          {lead.email || "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: lead.status === "replied" ? "rgba(16,185,129,0.15)" : lead.status === "opened" ? "rgba(132,204,22,0.15)" : lead.status === "won" ? "rgba(99,102,241,0.15)" : "rgba(245,158,11,0.15)",
                            color: lead.status === "replied" ? "var(--color-emerald)" : lead.status === "opened" ? "var(--color-lime)" : lead.status === "won" ? "var(--color-indigo)" : "var(--color-amber)",
                          }}>
                            {lead.status.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {lead.is_opened ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "5px",
                              padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
                              background: "rgba(132,204,22,0.15)", color: "var(--color-lime)",
                              border: "1px solid rgba(132,204,22,0.3)"
                            }}>
                              👁️ Opened
                            </span>
                          ) : (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "5px",
                              padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
                              background: "rgba(245,158,11,0.1)", color: "var(--color-amber)",
                              border: "1px solid rgba(245,158,11,0.25)"
                            }}>
                              📩 Unopened
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "12px", color: lead.opened_at ? "var(--color-lime)" : "var(--text-muted)" }}>
                          {lead.opened_at
                            ? new Date(lead.opened_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        );
      })()}
      {campaignTab === "followup" && (() => {
        // Fetch queue on tab open
        if (followupQueue.length === 0 && !followupLoading) {
          setFollowupLoading(true);
          fetch("/api/leads/followup-queue", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
            .then(r => r.json())
            .then(d => { setFollowupQueue(Array.isArray(d) ? d : []); })
            .catch(() => {})
            .finally(() => setFollowupLoading(false));
        }

        const refreshQueue = async () => {
          setFollowupLoading(true);
          try {
            const r = await fetch("/api/leads/followup-queue", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
            const d = await r.json();
            setFollowupQueue(Array.isArray(d) ? d : []);
          } catch {} finally { setFollowupLoading(false); }
        };

        const handleSendFollowup = async (leadId) => {
          setSendingFollowup(prev => ({ ...prev, [leadId]: true }));
          try {
            const r = await fetch(`/api/leads/${leadId}/send-followup`, {
              method: "POST",
              headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            });
            const d = await r.json();
            if (r.ok) {
              showToast(`Follow-up #${d.followupNumber} sent ✓`, "success");
              await refreshQueue();
            } else {
              showToast(`Failed: ${d.error}`, "danger");
            }
          } catch { showToast("Network error.", "danger"); }
          finally { setSendingFollowup(prev => ({ ...prev, [leadId]: false })); }
        };

        const handleGenerateStrategy = async (leadId) => {
          setGeneratingStrategy(prev => ({ ...prev, [leadId]: true }));
          try {
            const r = await fetch(`/api/leads/${leadId}/generate-followup-strategy`, {
              method: "POST",
              headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            });
            const d = await r.json();
            if (r.ok) {
              showToast(`Strategy generated for lead ✨`, "success");
              await refreshQueue();
            } else {
              showToast(`Failed: ${d.error}`, "danger");
            }
          } catch { showToast("Network error.", "danger"); }
          finally { setGeneratingStrategy(prev => ({ ...prev, [leadId]: false })); }
        };

        const handleSendAll = async () => {
          setSendingAll(true);
          const due = followupQueue.filter(l => !l.next_followup_at || new Date(l.next_followup_at) <= new Date());
          let sent = 0;
          for (const lead of due) {
            try {
              const r = await fetch(`/api/leads/${lead.id}/send-followup`, {
                method: "POST",
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
              });
              if (r.ok) sent++;
            } catch {}
          }
          showToast(`Sent ${sent} follow-up${sent === 1 ? "" : "s"} ✓`, "success");
          await refreshQueue();
          setSendingAll(false);
        };

        const openCount = followupQueue.filter(l => l.is_opened).length;
        const openRate = followupQueue.length > 0 ? Math.round((openCount / followupQueue.length) * 100) : 0;
        const dueNow = followupQueue.filter(l => !l.next_followup_at || new Date(l.next_followup_at) <= new Date());
        const followupsSentTotal = followupQueue.reduce((sum, l) => sum + (l.followup_count || 0), 0);

        function timeAgo(ts) {
          if (!ts) return "—";
          const d = new Date(ts), now = new Date();
          const diff = Math.floor((now - d) / 86400000);
          return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff}d ago`;
        }

        return (
          <div style={{ padding: "24px 0" }}>
            {/* Stats header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Leads in Queue", value: followupQueue.length, color: "var(--brand)", icon: "📋" },
                { label: "Due Now",        value: dueNow.length,         color: "#f97316",    icon: "⏰" },
                { label: "Total Sent",     value: followupsSentTotal,    color: "var(--success)", icon: "📤" },
                { label: "Open Rate",      value: `${openRate}%`,        color: openRate > 40 ? "var(--success)" : "var(--text-3)", icon: "👁" },
              ].map(s => (
                <div key={s.label} className="glass-panel" style={{ padding: "16px 20px", textAlign: "center", borderRadius: 12, border: "1px solid var(--border-1)" }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)" }}>
                📅 Follow-Up Queue
                {dueNow.length > 0 && (
                  <span style={{ marginLeft: 10, fontSize: 11, background: "rgba(249,115,22,0.15)", color: "#ea580c", padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>
                    {dueNow.length} overdue
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={refreshQueue} disabled={followupLoading}>
                  {followupLoading ? "⟳ Loading..." : "🔄 Refresh"}
                </button>
                {dueNow.length > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={handleSendAll} disabled={sendingAll}>
                    {sendingAll ? "Sending all..." : `⚡ Send All Due (${dueNow.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            {followupLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-4)" }}>Loading follow-up queue...</div>
            ) : followupQueue.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <div className="empty-state-title">No follow-ups queued</div>
                <div className="empty-state-desc">Leads you've emailed will appear here once they are due for follow-up.</div>
              </div>
            ) : (
              <div style={{ borderRadius: 12, border: "1px solid var(--border-1)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-overlay)", borderBottom: "1px solid var(--border-1)" }}>
                      {["Lead", "Open Status", "Since Email", "Follow-Up #", "Strategy", "Next Due", "Actions"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {followupQueue.map(lead => {
                      const isDue = !lead.next_followup_at || new Date(lead.next_followup_at) <= new Date();
                      const strategy = lead.followup_strategy || {};
                      return (
                        <tr key={lead.id} style={{ borderBottom: "1px solid var(--border-2)", background: isDue ? "rgba(249,115,22,0.04)" : "transparent", transition: "background 0.1s" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>{lead.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-4)" }}>{lead.city} · {lead.type}</div>
                            {lead.qualification_score && <div style={{ fontSize: 10, color: "var(--brand)", marginTop: 2 }}>Score {lead.qualification_score}%</div>}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            {lead.is_opened
                              ? <span className="badge badge-success" style={{ fontSize: 11 }}>👁 Opened</span>
                              : <span className="badge badge-neutral" style={{ fontSize: 11 }}>📩 Unopened</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-3)" }}>
                            {timeAgo(lead.contacted_at)}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center" }}>
                            <span className="badge badge-warning" style={{ fontSize: 11 }}>
                              {lead.followup_count || 0} / {strategy.maxFollowups || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", maxWidth: 180 }}>
                            {strategy.angle ? (
                              <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>
                                <span style={{ fontSize: 10, color: "var(--brand)", fontWeight: 700 }}>{strategy.tone?.replace(/_/g, " ").toUpperCase()}</span><br/>
                                {strategy.angle.substring(0, 80)}{strategy.angle.length > 80 ? "..." : ""}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--text-4)" }}>Not generated</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: 12 }}>
                            {isDue
                              ? <span style={{ color: "#ea580c", fontWeight: 700 }}>⚡ Due now</span>
                              : <span style={{ color: "var(--text-3)" }}>In {Math.ceil((new Date(lead.next_followup_at) - new Date()) / 86400000)}d</span>}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {!strategy.angle && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleGenerateStrategy(lead.id)}
                                  disabled={generatingStrategy[lead.id]}
                                  style={{ fontSize: 11 }}
                                >
                                  {generatingStrategy[lead.id] ? "..." : "🪄 Strategy"}
                                </button>
                              )}
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSendFollowup(lead.id)}
                                disabled={sendingFollowup[lead.id] || sendingAll}
                                style={{ fontSize: 11, background: isDue ? "var(--brand)" : "transparent", border: `1px solid var(--brand)`, color: isDue ? "white" : "var(--brand)" }}
                              >
                                {sendingFollowup[lead.id] ? "Sending..." : `▶ Send #${(lead.followup_count || 0) + 1}`}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
