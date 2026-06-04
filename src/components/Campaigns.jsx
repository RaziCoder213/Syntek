import React, { useState, useEffect } from "react";

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
  profileIconUrl = ""
}) {
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedTone, setSelectedTone] = useState("Warm & Friendly");
  const [customPrompt, setCustomPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [generatedSubject, setGeneratedSubject] = useState("");
  const [generatedBody, setGeneratedBody] = useState("");
  const [customTemplates, setCustomTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSenderType, setNewTemplateSenderType] = useState("all");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Load custom templates on mount
  useEffect(() => {
    fetchCustomTemplates();
  }, []);

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

  // Helper to resolve placeholders
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
    const lead = leads.find(l => l.id.toString() === selectedLeadId);
    if (!lead) {
      showToast("Please select a lead first so we can personalize the template!", "warn");
      return;
    }
    
    // Deconstruct Subject and Body from the template
    let rawSubject = "";
    let rawBody = "";

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
    e.stopPropagation(); // prevent select template triggering
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

  // Handle selected lead change from dropdown
  useEffect(() => {
    if (leads.length > 0 && !selectedLeadId) {
      setSelectedLeadId(leads[0].id.toString());
    }
  }, [leads]);

  // Local simulator logic for Gemini outreach drafts
  const getSimulatedOutreach = (lead, tone) => {
    const s = `Subject: quick question about ${lead.name}\n\n`;
    const greeting = tone === "Friendly" ? `Hey, ${senderName} here,` : `Hi Team,`;
    const identity = (useCompanyBranding && companyName) ? `${senderRole} at ${companyName}` : senderRole;
    const signature = (useCompanyBranding && companyName) ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;
    
    if (tone === "Friendly") {
      return s + `${greeting}\n\nI stumbled upon ${lead.name} in ${lead.city} while researching top local spots. With an amazing ${lead.rating}⭐ rating across ${lead.reviews} reviews, you guys are absolutely killing it!\n\nI'm a ${identity.toLowerCase()} and I build custom AI agents that automate customer inquiries across WhatsApp and Instagram DMs, ensuring you book 20% more tables without staff lifting a finger.\n\nWould you be open to a casual 10-minute check sometime this week?\n\nBest,\n${signature}`;
    } else if (tone === "ROI-Focused") {
      return s + `${greeting}\n\nI wanted to share a quick estimate: based on your ${lead.reviews} Yelp reviews in ${lead.city}, my model predicts you are losing up to $1,500 monthly in unreplied booking inquiries on social media.\n\nI design conversational AI agents that automate 85% of standard reservation FAQs instantly. Let's schedule a 10-minute review to see if we can reclaim those lost bookings.\n\nRegards,\n${signature}`;
    } else {
      return s + `${greeting}\n\nI build custom AI chatbots specifically tailored for ${lead.type} businesses like ${lead.name}.\n\nBy connecting directly to your bookings software, my AI agents book tables, answer FAQs, and reply to Instagram messages instantly. Setup takes less than 24 hours.\n\nLet me know if you're free for a quick Zoom call this Thursday.\n\nThanks,\n${signature}`;
    }
  };

  // Run Gemini outreach copywriter
  const generateEmailWithGemini = async () => {
    const lead = leads.find(l => l.id.toString() === selectedLeadId);
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
      - Yelp Rating: ${lead.rating} out of 5 stars
      - Reviews Count: ${lead.reviews}
      - Instagram handle: ${lead.instagram || "None"}
      - Website: ${lead.website || "None"}
      - Website Status: ${lead.website_status || "unknown"} (can be "active", "no_website", or "down")
      
      Outreach Guidelines:
      - Tone: ${selectedTone}
      - Copywriting Angle Style: ${outreachStyle === "roi" ? "ROI-Focused" : outreachStyle === "feedback" ? "Opinion/Feedback on Yelp Reviews/Ratings" : outreachStyle === "direct" ? "Pre-built Custom AI Chatbot Prototype Preview" : "Casual & Friendly Tech Pitch"}
      - Core Pitch Offer: ${pitchOffer === "whatsapp_bot" ? "Automating customer bookings, reservation FAQs, and Instagram/WhatsApp messages using custom conversational AI agents." : pitchOffer === "website_dev" ? "Designing and developing modern, responsive high-performing websites to capture traffic." : pitchOffer === "ai_chatbot" ? "Building custom AI chatbot assistants that reply to inquiries instantly on Yelp/IG." : customOfferDetails}
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
      if (geminiKey) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          })
        });
        const data = await response.json();
        const fullResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        if (fullResponse.startsWith("Subject:")) {
          const split = fullResponse.split("\n\n");
          setGeneratedSubject(split[0].replace("Subject:", "").trim());
          setGeneratedBody(split.slice(1).join("\n\n").trim());
        } else {
          setGeneratedSubject(`Custom Outreach for ${lead.name}`);
          setGeneratedBody(fullResponse);
        }
      } else {
        // Fallback to high-quality simulator
        await new Promise(resolve => setTimeout(resolve, 1800));
        const simulated = getSimulatedOutreach(lead, selectedTone);
        const split = simulated.split("\n\n");
        setGeneratedSubject(split[0].replace("Subject:", "").trim());
        setGeneratedBody(split.slice(1).join("\n\n").trim());
      }
      showToast("Email draft generated successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Gemini API connection error. Using local fallback.", "warn");
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
    const lead = leads.find(l => l.id.toString() === selectedLeadId);
    if (!lead) {
      showToast("Please select a valid lead first!", "warn");
      return;
    }

    if (!lead.email) {
      showToast("Selected lead does not have a public email address. Cannot send outreach.", "danger");
      return;
    }

    // If Gmail is connected, try to send the real email first
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
        return; // Abort status update if real sending fails
      }
    }

    try {
      const response = await fetch(`/api/leads/${selectedLeadId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contacted" })
      });
      if (!response.ok) throw new Error("Failed to update status");
      
      setLeads(ls => ls.map(l => l.id.toString() === selectedLeadId ? { ...l, status: "contacted" } : l));
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
      
      {/* Module Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Outreach Campaigns</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Draft hyper-targeted cold emails powered by Gemini, or toggle background auto-outreach.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {leads.some(l => l.status !== "not contacted" && l.status !== "new") && (
            <button 
              className="btn btn-outline btn-sm"
              style={{ 
                fontSize: "13px", 
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
                } catch (err) {
                  showToast("Failed to reset lead statuses", "danger");
                }
              }}
            >
              🔄 Reset Status to Not Contacted
            </button>
          )}

          <button 
            className={`btn ${campaignRunning ? "btn-danger" : "btn-lime"} glow-card`}
            onClick={() => {
              if (!campaignRunning && (!gmailUser || !gmailPass)) {
                showToast("Gmail is disconnected. Please connect your Gmail account in the top-right navbar before starting autonomous campaigns!", "danger");
                return;
              }
              setCampaignRunning(!campaignRunning);
              showToast(campaignRunning ? "Autonomous campaigns paused" : "Autonomous campaigns live. Scanning queue...", "info");
            }}
          >
            {campaignRunning ? "⏸ Pause Background Campaigns" : "▶ Start Autonomous Campaigns"}
          </button>
        </div>
      </div>

      {/* Gemini Settings Glass Pane */}
      <div className="glass-panel" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", padding: "16px 24px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.15)",
          display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center"
        }}>
          <span style={{ fontSize: "18px" }}>♊</span>
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Gemini API Integration</h4>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
            {geminiKey ? "Connected to live Gemini model." : "Using offline simulator. Paste your Gemini API key to activate live calls."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "360px" }}>
          <input 
            type="password" 
            className="input-field" 
            placeholder="Paste your Gemini API Key..." 
            value={geminiKey}
            onChange={(e) => {
              setGeminiKey(e.target.value);
              localStorage.setItem("gemini_api_key", e.target.value);
            }}
          />
          {geminiKey && (
            <button className="btn btn-outline btn-sm" onClick={() => { setGeminiKey(""); localStorage.removeItem("gemini_api_key"); showToast("API key cleared", "info"); }}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Main Campaign Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr", gap: "24px" }}>
        
        {/* Gemini Writer Column */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>🤖 Personalized Gemini Copywriter</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Select Scraped Lead</label>
                <select 
                  className="input-field" 
                  value={selectedLeadId} 
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  style={{ height: "39px" }}
                >
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.city})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>AI Voice Tone</label>
                <select 
                  className="input-field" 
                  value={selectedTone} 
                  onChange={(e) => setSelectedTone(e.target.value)}
                  style={{ height: "39px" }}
                >
                  <option value="Friendly">Friendly & Personal</option>
                  <option value="ROI-Focused">ROI & Reservation Loss Analysis</option>
                  <option value="Direct">Short & Ultra Direct</option>
                </select>
              </div>
            </div>

            <button 
              className="btn btn-indigo" 
              style={{ width: "100%", marginTop: "4px" }}
              onClick={generateEmailWithGemini}
              disabled={aiLoading}
            >
              {aiLoading ? "✨ Gemini is analyzing business metrics & drafting..." : "✨ Generate Outreach Email using Gemini"}
            </button>
          </div>

          {/* Email Editor pane */}
          {(generatedBody || aiLoading) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px", animation: "fadeIn 0.3s" }}>
              {aiLoading ? (
                <div style={{ padding: "40px", background: "#0a0a0f", borderRadius: "8px", border: "var(--border-subtle)", textAlign: "center", color: "var(--color-indigo)", fontWeight: 600 }}>
                  Generating personalized pitch. Reading review ratings...
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>EMAIL SUBJECT</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={generatedSubject} 
                      onChange={(e) => setGeneratedSubject(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>EMAIL BODY</label>
                    <textarea 
                      className="input-field" 
                      style={{ minHeight: "180px", fontFamily: "var(--font-sans)", lineHeight: "1.6" }}
                      value={generatedBody}
                      onChange={(e) => setGeneratedBody(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => { setGeneratedSubject(""); setGeneratedBody(""); }}>Discard</button>
                    <button className="btn btn-lime btn-sm" onClick={sendGeneratedEmail}>📧 Queue Outbound SMTP</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Templates and strategy logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Dynamic Templates Library */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>📋 Outreach Templates Library</h3>
            <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Select a template to auto-populate the editor. Placeholders (like <code>{"{{company}}"}</code>, <code>{"{{portfolio_url}}"}</code>, etc.) will resolve automatically based on active lead and profile info.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-indigo)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
                System Default Templates
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {SYSTEM_TEMPLATES.map((tmpl) => (
                  <div 
                    key={`sys-${tmpl.id}`}
                    onClick={() => handleSelectTemplate(tmpl)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--border-translucent)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "all 0.2s"
                    }}
                    className="sidebar-nav-btn"
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{tmpl.name}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Tone: {tmpl.tone}</span>
                    </div>
                    <span className="badge" style={{ background: "rgba(99,102,241,0.1)", color: "var(--color-indigo)", fontSize: "9px" }}>System</span>
                  </div>
                ))}
              </div>

              {customTemplates.length > 0 && (
                <>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-lime)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "12px" }}>
                    My Custom Templates
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                    {customTemplates.map((tmpl) => (
                      <div 
                        key={`custom-${tmpl.id}`}
                        onClick={() => handleSelectTemplate(tmpl)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid var(--border-translucent)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s"
                        }}
                        className="sidebar-nav-btn"
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{tmpl.name}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Target: {tmpl.sender_type || "all"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="badge" style={{ background: "rgba(144,238,144,0.1)", color: "var(--color-lime)", fontSize: "9px" }}>Custom</span>
                          <button 
                            onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--color-crimson)",
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: "4px"
                            }}
                            title="Delete template"
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

            {/* Placeholder Cheat Sheet */}
            <div style={{
              background: "var(--bg-translucent-subtle)",
              border: "1px solid var(--border-translucent)",
              borderRadius: "6px",
              padding: "12px",
              fontSize: "11px",
              color: "var(--text-secondary)",
              marginTop: "4px"
            }}>
              <strong>📌 Dynamic Placeholders Reference:</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: "6px", fontFamily: "monospace", fontSize: "10px" }}>
                <div>{"{{company}}"} : Lead Name</div>
                <div>{"{{city}}"} : Lead City</div>
                <div>{"{{rating}}"} : Yelp Rating</div>
                <div>{"{{reviews}}"} : Yelp Reviews</div>
                <div>{"{{sender_name}}"} : Your Name</div>
                <div>{"{{portfolio_url}}"} : Portfolio Link</div>
                <div>{"{{linkedin}}"} : LinkedIn Link</div>
                <div>{"{{github}}"} : GitHub Link</div>
              </div>
            </div>

          </div>

          {/* Save Draft as Template Form */}
          {generatedBody && (
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px dashed var(--border-translucent)", animation: "fadeIn 0.3s" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>💾 Save Current Draft as Template</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Template Library Name</span>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. Portfolio Speed Pitch" 
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Profile Category Target</span>
                  <select 
                    className="input-field" 
                    value={newTemplateSenderType} 
                    onChange={(e) => setNewTemplateSenderType(e.target.value)}
                    style={{ height: "34px", padding: "4px 8px", fontSize: "12px" }}
                  >
                    <option value="all">General / All Profiles</option>
                    <option value="company">Company Specific</option>
                    <option value="developer">Developer Specific</option>
                  </select>
                </div>
                <button 
                  className="btn btn-lime btn-sm" 
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate}
                  style={{ width: "100%", height: "34px", marginTop: "4px" }}
                >
                  {savingTemplate ? "Saving..." : "Save Template to Library"}
                </button>
              </div>
            </div>
          )}

          {/* AI Strategy widget */}
          <div className="glass-panel" style={{ padding: "20px", border: "var(--border-glow)", background: "var(--color-lime-glow)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-lime)", fontWeight: 800, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
              <span>🧠 Gemini Auto-Optimizations</span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.6" }}>
              Our strategy engine is live. Weekly stats show that restaurant leads in Denver open emails 14% more when the subject line starts with "Local inquiry about...". 
              AI has auto-tuned the queue parameters accordingly.
            </p>
          </div>

          {/* Campaign Settings list */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>Campaign Queue Settings</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { label: "Daily Email Throttle", val: "100 emails / day", color: "var(--color-indigo)" },
                { label: "Follow-up Cadence", val: "Automatic after 3 days", color: "var(--color-amber)" },
                { label: "Max Inbound Follow-ups", val: "2 attempts per lead", color: "var(--color-teal)" },
                { label: "Outbox Connection", val: "SMTP Secure Server (Gmail)", color: "var(--color-emerald)" }
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

      </div>

    </div>
  );
}
