import React, { useState, useEffect } from "react";

export default function Settings({ 
  showToast, gmailUser, gmailPass, setGmailUser, setGmailPass, geminiKey, setGeminiKey, 
  googleConnected, googleEmail, googleSandboxMode, setGoogleConnected, setGoogleEmail, setGoogleSandboxMode,
  updateParentSenderName, updateParentSenderRole, updateParentCompanyName, updateParentUseCompanyBranding, 
  updateParentOutreachStyle, updateParentPitchOffer, updateParentCustomOfferDetails, updateParentScheduleType,
  senderType, aboutText, portfolioUrl, socialLinkedin, socialGithub, socialTwitter, logoUrl, bannerUrl, profileIconUrl,
  updateParentSenderType, updateParentAboutText, updateParentPortfolioUrl, updateParentSocialLinkedin, updateParentSocialGithub, updateParentSocialTwitter, updateParentLogoUrl, updateParentBannerUrl, updateParentProfileIconUrl
}) {
  const [niche, setNiche] = useState("Cafes");
  const [location, setLocation] = useState("Austin, TX");
  const [dailyLeadLimit, setDailyLeadLimit] = useState(8);
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [timezone, setTimezone] = useState("local");
  const [isActive, setIsActive] = useState(false);
  const [concurrentJobs, setConcurrentJobs] = useState(1);
  const [searchMode, setSearchMode] = useState("scraper");
  const [localGmailUser, setLocalGmailUser] = useState(gmailUser);
  const [localGmailPass, setLocalGmailPass] = useState(gmailPass);
  const [localGeminiKey, setLocalGeminiKey] = useState(geminiKey);
  const [senderName, setSenderName] = useState("Muhammad Razi");
  const [senderRole, setSenderRole] = useState("Independent Developer");
  const [companyName, setCompanyName] = useState("");
  const [useCompanyBranding, setUseCompanyBranding] = useState(false);
  const [outreachStyle, setOutreachStyle] = useState("casual");
  const [pitchOffer, setPitchOffer] = useState("whatsapp_bot");
  const [customOfferDetails, setCustomOfferDetails] = useState("");
  const [scheduleType, setScheduleType] = useState("custom");
  const [localSenderType, setLocalSenderType] = useState(senderType || "developer");
  const [localAboutText, setLocalAboutText] = useState(aboutText || "");
  const [localPortfolioUrl, setLocalPortfolioUrl] = useState(portfolioUrl || "");
  const [localSocialLinkedin, setLocalSocialLinkedin] = useState(socialLinkedin || "");
  const [localSocialGithub, setLocalSocialGithub] = useState(socialGithub || "");
  const [localSocialTwitter, setLocalSocialTwitter] = useState(socialTwitter || "");
  const [localLogoUrl, setLocalLogoUrl] = useState(logoUrl || "");
  const [localBannerUrl, setLocalBannerUrl] = useState(bannerUrl || "");
  const [localProfileIconUrl, setLocalProfileIconUrl] = useState(profileIconUrl || "");
  const [localGoogleSandboxMode, setLocalGoogleSandboxMode] = useState(googleSandboxMode);
  const [loading, setLoading] = useState(false);
  const [showGmailGuide, setShowGmailGuide] = useState(false);

  useEffect(() => {
    setLocalGoogleSandboxMode(googleSandboxMode);
  }, [googleSandboxMode]);

  const getAiTimeForNiche = (nicheStr) => {
    const n = (nicheStr || "").toLowerCase();
    if (n.includes("cafe") || n.includes("coffee")) {
      return { time: "10:00", display: "10:00 AM", reason: "Optimal mid-morning window when cafe owners check email after the early rush." };
    } else if (n.includes("restaurant") || n.includes("food") || n.includes("brunch") || n.includes("bakery")) {
      return { time: "14:30", display: "02:30 PM", reason: "Post-lunch shift window when restaurant kitchen operations slow down." };
    } else if (n.includes("gym") || n.includes("spa") || n.includes("salon") || n.includes("fitness")) {
      return { time: "11:00", display: "11:00 AM", reason: "Mid-morning window before the lunchtime rush and evening workout check-ins." };
    }
    return { time: "11:15", display: "11:15 AM", reason: "Standard B2B high open-rate outreach sweet spot window." };
  };

  const aiRecommendation = getAiTimeForNiche(niche);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const config = await res.json();
          setNiche(config.niche || "Cafes");
          setLocation(config.location || "Austin, TX");
          setDailyLeadLimit(config.daily_lead_limit || 8);
          setPreferredTime(config.preferred_time || "09:00");
          setTimezone(config.timezone || "local");
          setIsActive(config.is_active || false);
          setConcurrentJobs(config.concurrent_jobs || 1);
          setSearchMode(config.search_mode || "scraper");
          setLocalGmailUser(config.gmail_user || "");
          setLocalGmailPass(config.gmail_pass || "");
          setLocalGeminiKey(config.gemini_key || "");
          setSenderName(config.sender_name || "Muhammad Razi");
          setSenderRole(config.sender_role || "Independent Developer");
          setCompanyName(config.company_name || "");
          setUseCompanyBranding(config.use_company_branding || false);
          setOutreachStyle(config.outreach_style || "casual");
          setPitchOffer(config.pitch_offer || "whatsapp_bot");
          setCustomOfferDetails(config.custom_offer_details || "");
          setScheduleType(config.schedule_type || "custom");
          setLocalSenderType(config.sender_type || "developer");
          setLocalAboutText(config.about_text || "");
          setLocalPortfolioUrl(config.portfolio_url || "");
          setLocalSocialLinkedin(config.social_linkedin || "");
          setLocalSocialGithub(config.social_github || "");
          setLocalSocialTwitter(config.social_twitter || "");
          setLocalLogoUrl(config.logo_url || "");
          setLocalBannerUrl(config.banner_url || "");
          setLocalProfileIconUrl(config.profile_icon_url || "");
          if (config.google_connected !== undefined) setGoogleConnected(config.google_connected);
          if (config.google_email) setGoogleEmail(config.google_email);
          if (config.google_sandbox_mode !== undefined) {
            setGoogleSandboxMode(config.google_sandbox_mode);
            setLocalGoogleSandboxMode(config.google_sandbox_mode);
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          location,
          daily_lead_limit: parseInt(dailyLeadLimit),
          preferred_time: preferredTime,
          timezone,
          is_active: isActive,
          concurrent_jobs: parseInt(concurrentJobs),
          gmail_user: localGmailUser,
          gmail_pass: localGmailPass,
          gemini_key: localGeminiKey,
          search_mode: searchMode,
          sender_name: senderName,
          sender_role: senderRole,
          company_name: companyName,
          use_company_branding: useCompanyBranding,
          outreach_style: outreachStyle,
          pitch_offer: pitchOffer,
          custom_offer_details: customOfferDetails,
          schedule_type: scheduleType,
          sender_type: localSenderType,
          about_text: localAboutText,
          portfolio_url: localPortfolioUrl,
          social_linkedin: localSocialLinkedin,
          social_github: localSocialGithub,
          social_twitter: localSocialTwitter,
          logo_url: localLogoUrl,
          banner_url: localBannerUrl,
          profile_icon_url: localProfileIconUrl,
          google_sandbox_mode: localGoogleSandboxMode
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save settings");
      }

      // Update parent states
      setGmailUser(localGmailUser);
      setGmailPass(localGmailPass);
      setGeminiKey(localGeminiKey);
      setGoogleSandboxMode(localGoogleSandboxMode);
      if (updateParentSenderName) updateParentSenderName(senderName);
      if (updateParentSenderRole) updateParentSenderRole(senderRole);
      if (updateParentCompanyName) updateParentCompanyName(companyName);
      if (updateParentUseCompanyBranding) updateParentUseCompanyBranding(useCompanyBranding);
      if (updateParentOutreachStyle) updateParentOutreachStyle(outreachStyle);
      if (updateParentPitchOffer) updateParentPitchOffer(pitchOffer);
      if (updateParentCustomOfferDetails) updateParentCustomOfferDetails(customOfferDetails);
      if (updateParentScheduleType) updateParentScheduleType(scheduleType);
      if (updateParentSenderType) updateParentSenderType(localSenderType);
      if (updateParentAboutText) updateParentAboutText(localAboutText);
      if (updateParentPortfolioUrl) updateParentPortfolioUrl(localPortfolioUrl);
      if (updateParentSocialLinkedin) updateParentSocialLinkedin(localSocialLinkedin);
      if (updateParentSocialGithub) updateParentSocialGithub(localSocialGithub);
      if (updateParentSocialTwitter) updateParentSocialTwitter(localSocialTwitter);
      if (updateParentLogoUrl) updateParentLogoUrl(localLogoUrl);
      if (updateParentBannerUrl) updateParentBannerUrl(localBannerUrl);
      if (updateParentProfileIconUrl) updateParentProfileIconUrl(localProfileIconUrl);
      
      // Update localStorage fallback
      localStorage.setItem("gmail_user", localGmailUser);
      localStorage.setItem("gmail_pass", localGmailPass);
      localStorage.setItem("gemini_api_key", localGeminiKey);

      showToast("Campaign scheduling and credentials saved successfully!", "success");
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
      
      <div>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>SaaS Campaign Settings</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
          Configure autonomous background cron jobs, daily lead scraper schedules, and outbound SMTP nodes.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px" }}>
        
        {/* Left Column: Automation Configurations */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Cron Scheduler Control */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>📅 Daily Cron Automation Scheduler</h3>
              <label className="switch-container" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={isActive} 
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: "18px", height: "18px", accentColor: "var(--color-lime)" }}
                />
                <span style={{ fontSize: "13px", fontWeight: 700, color: isActive ? "var(--color-lime)" : "var(--text-muted)" }}>
                  {isActive ? "Scheduler Enabled" : "Scheduler Paused"}
                </span>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Outreach Target Niche</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={niche} 
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. Cafes, Spas, Gyms"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Location Region</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Austin, TX"
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Dispatch Timing Mode</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <button 
                  type="button"
                  className={`btn btn-sm ${scheduleType === "ai" ? "btn-lime" : "btn-outline"}`}
                  onClick={() => setScheduleType("ai")}
                  style={{ flex: 1, height: "36px", fontWeight: 700 }}
                >
                  🤖 AI Recommended
                </button>
                <button 
                  type="button"
                  className={`btn btn-sm ${scheduleType === "custom" ? "btn-indigo" : "btn-outline"}`}
                  onClick={() => setScheduleType("custom")}
                  style={{ flex: 1, height: "36px", fontWeight: 700 }}
                >
                  ⚙️ Custom Time
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Scrape & Send limit (Daily)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={dailyLeadLimit} 
                  onChange={(e) => setDailyLeadLimit(e.target.value)}
                  min="1"
                  max="200"
                />
              </div>

              {scheduleType === "custom" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Preferred Dispatch Time</label>
                  <input 
                    type="time" 
                    className="input-field" 
                    value={preferredTime} 
                    onChange={(e) => setPreferredTime(e.target.value)}
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>AI Dispatch Target Time</label>
                  <div className="input-field" style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    height: "39px", 
                    background: "rgba(144, 238, 144, 0.08)", 
                    borderColor: "rgba(144, 238, 144, 0.4)",
                    color: "var(--color-lime)",
                    fontWeight: 700,
                    padding: "0 12px"
                  }}>
                    <span>⚡ {aiRecommendation.display}</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Timezone Mapping</label>
                <select 
                  className="input-field" 
                  value={timezone} 
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{ height: "39px" }}
                >
                  <option value="local">Server Local Time</option>
                  <option value="est">EST (New York)</option>
                  <option value="pst">PST (Los Angeles)</option>
                </select>
              </div>
            </div>

            {scheduleType === "ai" && (
              <div style={{ 
                padding: "10px 14px", 
                background: "rgba(144, 238, 144, 0.05)", 
                border: "1px dashed rgba(144, 238, 144, 0.3)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: "1.4"
              }}>
                ℹ️ <strong>AI Recommendation Logic</strong>: Target niche <strong>"{niche}"</strong> is mapped to dispatch at <strong>{aiRecommendation.display}</strong> because: {aiRecommendation.reason}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Scrape Mode</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button 
                    type="button"
                    className={`btn btn-sm ${searchMode === "scraper" ? "btn-indigo" : "btn-outline"}`}
                    onClick={() => setSearchMode("scraper")}
                    style={{ flex: 1 }}
                  >
                    🌐 Yelp Web Scraper
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${searchMode === "deepsearch" ? "btn-indigo" : "btn-outline"}`}
                    onClick={() => setSearchMode("deepsearch")}
                    style={{ flex: 1 }}
                  >
                    ♊ Gemini DeepSearch
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Concurrency Limit</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={concurrentJobs} 
                  onChange={(e) => setConcurrentJobs(e.target.value)}
                  min="1"
                  max="5"
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Outreach Copywriting Style</label>
              <select 
                className="input-field" 
                value={outreachStyle} 
                onChange={(e) => setOutreachStyle(e.target.value)}
                style={{ height: "39px" }}
              >
                <option value="casual">Casual & Friendly (Standard Tech Pitch)</option>
                <option value="roi">ROI-Focused (Highlights time savings and conversion stats)</option>
                <option value="feedback">Opinion & Feedback (Highlights Yelp reviews and ratings count)</option>
                <option value="direct">Pre-built Demo Showcase (Highlights a ready-made chatbot preview)</option>
              </select>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                💡 <strong>Analyze and Try Styles</strong>: Customize the Gemini prompt copy variation to test different angles. "Opinion & Feedback" uses specific ratings and review metrics for highly personalized engagement.
              </span>
            </div>

          </div>

          {/* Sender Signature Profile */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>👤 Sender Signature Profile</h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Configure your outbound sender variables. These dynamic parameters personalize your AI copy prompts, cold templates, signatures, and email greetings.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Sender Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={senderName} 
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Muhammad Razi"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Professional Role</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={senderRole} 
                  onChange={(e) => setSenderRole(e.target.value)}
                  placeholder="e.g. Independent Developer"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Company Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Syntek Corp"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px" }}>
                <input 
                  type="checkbox" 
                  id="useCompanyBranding"
                  checked={useCompanyBranding} 
                  onChange={(e) => setUseCompanyBranding(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "var(--color-lime)" }}
                />
                <label htmlFor="useCompanyBranding" style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                  Use Company Branding
                </label>
              </div>
            </div>
          </div>

          {/* 🏢 Brand Profile & Personalization Context */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>🏢 Brand Profile & Personalization Context</h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Provide details about your company or freelance developer profile. Gemini will use this context to craft highly personalized Cold Outreach emails.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Account Profile Type</label>
              <select 
                className="input-field" 
                value={localSenderType} 
                onChange={(e) => setLocalSenderType(e.target.value)}
                style={{ height: "39px" }}
              >
                <option value="developer">Individual Developer / Freelancer / Creator</option>
                <option value="company">Company / Agency / Enterprise Brand</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                {localSenderType === "company" ? "About the Company (Description/Bio)" : "About Yourself (Developer Bio/Description)"}
              </label>
              <textarea 
                className="input-field" 
                value={localAboutText} 
                onChange={(e) => setLocalAboutText(e.target.value)}
                placeholder={localSenderType === "company" ? "e.g. Syntek is a software agency specializing in AI agents, automations, and custom mobile apps for local service businesses." : "e.g. I am a full-stack engineer specializing in web speed optimization, custom Shopify stores, and SaaS database builds."}
                style={{ minHeight: "90px", resize: "vertical" }}
              />
              <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                Describe what services/products are offered, your specializations, or company achievements.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                {localSenderType === "company" ? "Company Website / Portfolio URL" : "Developer Portfolio URL"}
              </label>
              <input 
                type="url" 
                className="input-field" 
                value={localPortfolioUrl} 
                onChange={(e) => setLocalPortfolioUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            {/* Social Media Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Social Media Profiles</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>LinkedIn URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localSocialLinkedin} 
                    onChange={(e) => setLocalSocialLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>GitHub URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localSocialGithub} 
                    onChange={(e) => setLocalSocialGithub(e.target.value)}
                    placeholder="https://github.com/username"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Twitter/X URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localSocialTwitter} 
                    onChange={(e) => setLocalSocialTwitter(e.target.value)}
                    placeholder="https://x.com/username"
                  />
                </div>
              </div>
            </div>

            {/* Brand Logo, Banner & Icon */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Brand Media Assets (URLs)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Logo Image URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localLogoUrl} 
                    onChange={(e) => setLocalLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Banner Image URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localBannerUrl} 
                    onChange={(e) => setLocalBannerUrl(e.target.value)}
                    placeholder="https://example.com/banner.png"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Profile Icon URL</span>
                  <input 
                    type="url" 
                    className="input-field" 
                    value={localProfileIconUrl} 
                    onChange={(e) => setLocalProfileIconUrl(e.target.value)}
                    placeholder="https://example.com/icon.png"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Outreach Pitch Offer Configurations */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>🎯 Outreach Pitch Offer Configurations</h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Specify the core product or service offering you want your cold outreach campaigns to focus on.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Target Service Offer Type</label>
              <select 
                className="input-field" 
                value={pitchOffer} 
                onChange={(e) => setPitchOffer(e.target.value)}
                style={{ height: "39px" }}
              >
                <option value="whatsapp_bot">WhatsApp Booking Bot (Default Cafe Automations)</option>
                <option value="website_dev">Website Development (Design & Site Launches)</option>
                <option value="ai_chatbot">AI Chatbot Assistant (Customer service on Yelp & IG)</option>
                <option value="custom">Custom Service / Custom Details (Write below)</option>
              </select>
            </div>

            {pitchOffer === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", animation: "fadeIn 0.2s" }}>
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Custom Service Pitch Details</label>
                <textarea 
                  className="input-field" 
                  value={customOfferDetails} 
                  onChange={(e) => setCustomOfferDetails(e.target.value)}
                  placeholder="e.g. mobile app development, SEO optimization, social media marketing..."
                  style={{ minHeight: "80px", resize: "vertical" }}
                />
                <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  Provide a clear 1-2 sentence description of who you are and what product/service you want to sell (e.g. "design high-converting Shopify stores that increase sales").
                </span>
              </div>
            )}
          </div>

          {/* Secure Keys configuration */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>⚙️ Integrations & APIs</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Google Gemini API Key</label>
              <input 
                type="password" 
                className="input-field" 
                value={localGeminiKey} 
                onChange={(e) => setLocalGeminiKey(e.target.value)}
                placeholder="AI content creation key..."
              />
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                Used to draft highly personalized messages and evaluate inbox thread sentiment.
              </span>
            </div>
          </div>

        </div>

        {/* Right Column: Outbound Node Config */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>✉️ Outbound SMTP Delivery Node</h3>
            
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Campaign emails are dispatched securely using Google's SMTP servers from your personal account.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>SENDER GMAIL ADDRESS</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={localGmailUser} 
                  onChange={(e) => setLocalGmailUser(e.target.value)}
                  placeholder="name@gmail.com"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>GOOGLE APP PASSWORD</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={localGmailPass} 
                  onChange={(e) => setLocalGmailPass(e.target.value)}
                  placeholder="16-character SMTP pass..."
                />
                <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4", marginTop: "4px" }}>
                  💡 Generate an App Password in your Google Account Security dashboard before connecting.
                </span>
                
                <button 
                  type="button" 
                  onClick={() => setShowGmailGuide(!showGmailGuide)} 
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-lime)",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 0",
                    marginTop: "8px",
                    textDecoration: "underline",
                    textAlign: "left"
                  }}
                >
                  🔑 {showGmailGuide ? "Hide Setup Guide" : "View Step-by-Step Gmail Connection Guide"}
                </button>

                {showGmailGuide && (
                  <div style={{
                    background: "var(--bg-translucent-subtle)",
                    border: "1px solid var(--border-translucent)",
                    borderRadius: "8px",
                    padding: "16px",
                    marginTop: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    animation: "fadeIn 0.25s ease"
                  }}>
                    <h5 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                      🔒 Google App Password Setup Guide
                    </h5>
                    <ol style={{ fontSize: "11px", color: "var(--text-secondary)", paddingLeft: "16px", margin: 0, display: "flex", flexDirection: "column", gap: "8px", lineHeight: "1.5" }}>
                      <li>
                        Go to your <strong><a href="https://myaccount.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-lime)", textDecoration: "underline" }}>Google Account Dashboard</a></strong>.
                      </li>
                      <li>
                        Navigate to the <strong>Security</strong> tab on the left menu.
                      </li>
                      <li>
                        Ensure <strong>2-Step Verification</strong> is enabled under "How you sign in to Google". (This is required by Google to create app passwords).
                      </li>
                      <li>
                        Search for or select <strong>App Passwords</strong> (if you don't see it, search for "App Passwords" in the search bar at the top).
                      </li>
                      <li>
                        Enter a name for your app (e.g. <code>Syntek Leads Campaign</code>) and click <strong>Create</strong>.
                      </li>
                      <li>
                        Google will display a secure <strong>16-character code</strong> (e.g., <code>abcd efgh ijkl mnop</code>).
                      </li>
                      <li>
                        Copy this code, remove any spaces, and paste it directly into the <strong>Google App Password</strong> input field above!
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Google Workspace Integrations */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>📅 Google Workspace Integrations</h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Connect your Google Calendar and Google Meet accounts to automatically schedule calls and invite leads once a booking is agreed.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {/* Connection Status Indicator */}
              <div style={{ 
                padding: "14px", 
                borderRadius: "10px", 
                background: "var(--bg-translucent-mild)", 
                border: "var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Connection Status
                  </span>
                  {googleConnected ? (
                    localGoogleSandboxMode ? (
                      <span className="badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--color-amber)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        Sandbox Active
                      </span>
                    ) : (
                      <span className="badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--color-emerald)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        Connected
                      </span>
                    )
                  ) : (
                    <span className="badge" style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--color-crimson)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      Disconnected
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ 
                    width: "36px", 
                    height: "36px", 
                    borderRadius: "8px", 
                    background: googleConnected ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    fontSize: "18px"
                  }}>
                    {googleConnected ? "📅" : "🔗"}
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {googleConnected 
                        ? (localGoogleSandboxMode ? "Google Sandbox Calendar" : googleEmail || "Linked Account") 
                        : "No Google Account Linked"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {googleConnected 
                        ? (localGoogleSandboxMode ? "Generating simulated calendar events & Meet links" : "Syncing live calendar events & Meet solutions") 
                        : "AI bookings will fall back to simulated invites"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                {!googleConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      const token = localStorage.getItem("auth_token");
                      window.location.href = `/api/auth/google?token=${token}`;
                    }}
                    className="btn btn-indigo"
                    style={{ width: "100%", height: "40px", fontSize: "13px" }}
                  >
                    🔐 Connect Google Account
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/auth/google/disconnect", {
                            method: "POST"
                          });
                          if (!res.ok) throw new Error("Failed to disconnect Google account");
                          setGoogleConnected(false);
                          setGoogleEmail("");
                          showToast("Google account disconnected successfully", "success");
                        } catch (err) {
                          showToast(err.message, "danger");
                        }
                      }}
                      className="btn btn-outline"
                      style={{ flex: 1, height: "40px", borderColor: "rgba(239, 68, 68, 0.4)", color: "var(--color-crimson)" }}
                    >
                      Disconnect Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const token = localStorage.getItem("auth_token");
                        window.location.href = `/api/auth/google?token=${token}`;
                      }}
                      className="btn btn-outline"
                      style={{ flex: 1, height: "40px" }}
                    >
                      Switch Account
                    </button>
                  </div>
                )}

                {/* Sandbox / Sim Toggle */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "flex-start", 
                  gap: "10px", 
                  marginTop: "8px", 
                  padding: "10px 12px", 
                  background: "rgba(255,255,255,0.01)", 
                  border: "1px dashed rgba(255,255,255,0.05)",
                  borderRadius: "8px" 
                }}>
                  <input 
                    type="checkbox" 
                    id="googleSandboxModeToggle"
                    checked={localGoogleSandboxMode}
                    onChange={(e) => setLocalGoogleSandboxMode(e.target.checked)}
                    style={{ width: "16px", height: "16px", marginTop: "2px", accentColor: "var(--color-lime)" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <label htmlFor="googleSandboxModeToggle" style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 700, cursor: "pointer" }}>
                      Sandbox/Simulation Mode
                    </label>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                      Forces the scheduler to produce simulated Google Meet links instead of real calendar API calls. Perfect for testing without Google API setup.
                    </span>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* Quick Info Pane */}
          <div className="glass-panel" style={{ padding: "20px", border: "var(--border-glow)", background: "var(--color-indigo-glow)" }}>
            <h4 style={{ fontSize: "13px", color: "var(--color-indigo)", fontWeight: 800, textTransform: "uppercase", marginBottom: "8px" }}>
              💡 Server-Side Background Execution
            </h4>
            <p style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.6" }}>
              Once you click <strong>Save Configurations</strong>, the campaign schedule runs fully in the background. The server handles Yelp scans, Gmail dispatches, and open tracking completely autonomously, even when you log out.
            </p>
          </div>

        </div>

      </div>

      {/* Action Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "20px" }}>
        <button 
          className="btn btn-lime glow-card" 
          onClick={handleSave} 
          disabled={loading}
          style={{ padding: "12px 28px" }}
        >
          {loading ? "Saving Settings..." : "Save Configurations"}
        </button>
      </div>

    </div>
  );
}
