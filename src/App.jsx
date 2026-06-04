import { useState, useEffect, useRef } from "react";
import Dashboard from "./components/Dashboard";
import LeadFinder from "./components/LeadFinder";
import Campaigns from "./components/Campaigns";
import Inbox from "./components/Inbox";
import Pipeline from "./components/Pipeline";
import Analytics from "./components/Analytics";
import Settings from "./components/Settings";
import Auth from "./components/Auth";

// Global Fetch Interceptor to Inject Multi-Tenant Header
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const userId = localStorage.getItem("x-user-id");
  const token = localStorage.getItem("auth_token");
  if (userId && url.startsWith("/api/")) {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers = {
      ...options.headers,
      "x-user-id": userId
    };
    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return originalFetch(url, options);
};

const INITIAL_LEADS = [];
const INITIAL_EMAILS = [];

const SYSTEM_TEMPLATES = [
  { id: 1, name: "AI Reservation Automation Pitch", tone: "ROI-Focused", body: "Subject: quick question about {{company}}\n\nHi team at {{company}},\n\nI noticed you have a stellar {{rating}}⭐ rating with {{reviews}} reviews in {{city}}! You must get slammed with reservations and customer calls.\n\nI'm Muhammad Razi, a local independent developer. I design simple custom AI agents that automate reservation scheduling and WhatsApp/IG DMs, saving 2-3 hours daily for Cafe owners.\n\nWould you be open to a quick 10-minute preview this week?\n\nBest,\nMuhammad Razi\nIndependent Developer" },
  { id: 2, name: "Casual Local Intro", tone: "Friendly", body: "Subject: local developer inquiry / {{company}}\n\nHey there,\n\nI'm Muhammad Razi, an independent web developer. I was scanning top cafes in {{city}} and {{company}} immediately stood out! Love what you guys are doing.\n\nI help restaurants automate their customer messages and WhatsApp replies so you never miss a review inquiry or booking request again. Do you have 10 minutes this Thursday for a casual chat?\n\nCheers,\nMuhammad Razi" },
  { id: 3, name: "Direct Message Automator", tone: "Direct", body: "Subject: feedback on {{company}}'s DMs?\n\nHi,\n\nQuick question: Who handles the social media booking inquiries for {{company}}?\n\nI'm a local developer and I build custom AI chat agents that reply to Instagram & Facebook DMs instantly, booking tables automatically without human staff lifting a finger.\n\nAre you free for a 5-minute call tomorrow?\n\nThanks,\nMuhammad Razi" }
];

const ANALYTICS_DATA = {
  emailsSent: 0,
  openRate: 0,
  replyRate: 0,
  interested: 0,
  revenue: 0,
  weeklyLeads: [0, 0, 0, 0, 0, 0, 0],
  opensByDay: [0, 0, 0, 0, 0, 0, 0],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("Dashboard");
  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [emails, setEmails] = useState(INITIAL_EMAILS);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchLog, setSearchLog] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleSandboxMode, setGoogleSandboxMode] = useState(true);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [activeLeadDrawer, setActiveLeadDrawer] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [geminiKey, setGeminiKey] = useState("");
  const [senderName, setSenderName] = useState("Muhammad Razi");
  const [senderRole, setSenderRole] = useState("Independent Developer");
  const [companyName, setCompanyName] = useState("");
  const [useCompanyBranding, setUseCompanyBranding] = useState(false);
  const [outreachStyle, setOutreachStyle] = useState("casual");
  const [pitchOffer, setPitchOffer] = useState("whatsapp_bot");
  const [customOfferDetails, setCustomOfferDetails] = useState("");
  const [scheduleType, setScheduleType] = useState("custom");
  const [senderType, setSenderType] = useState("developer");
  const [aboutText, setAboutText] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [socialLinkedin, setSocialLinkedin] = useState("");
  const [socialGithub, setSocialGithub] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [profileIconUrl, setProfileIconUrl] = useState("");
  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabChange = (tabName) => {
    setTab(tabName);
    setMobileMenuOpen(false);
  };

  // Sync session and settings on mount or when currentUser changes
  useEffect(() => {
    const savedUser = localStorage.getItem("current_user");
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("current_user");
      }
    }
    
    // Load persisted theme choice
    const savedTheme = localStorage.getItem("theme") || "dark";
    setTheme(savedTheme);
    document.body.className = savedTheme === "light" ? "light-theme" : "";
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.body.className = nextTheme === "light" ? "light-theme" : "";
  };

  useEffect(() => {
    if (!currentUser) return;
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const config = await res.json();
          if (config.gmail_user) setGmailUser(config.gmail_user);
          if (config.gmail_pass) setGmailPass(config.gmail_pass);
          if (config.google_connected !== undefined) setGoogleConnected(config.google_connected);
          if (config.google_email) setGoogleEmail(config.google_email);
          if (config.google_sandbox_mode !== undefined) setGoogleSandboxMode(config.google_sandbox_mode);
          if (config.gemini_key) setGeminiKey(config.gemini_key);
          if (config.sender_name) setSenderName(config.sender_name);
          if (config.sender_role) setSenderRole(config.sender_role);
          if (config.company_name) setCompanyName(config.company_name);
          if (config.use_company_branding !== undefined) setUseCompanyBranding(config.use_company_branding);
          if (config.outreach_style) setOutreachStyle(config.outreach_style);
          if (config.pitch_offer) setPitchOffer(config.pitch_offer);
          if (config.custom_offer_details) setCustomOfferDetails(config.custom_offer_details);
          if (config.schedule_type) setScheduleType(config.schedule_type);
          if (config.sender_type) setSenderType(config.sender_type);
          if (config.about_text) setAboutText(config.about_text);
          if (config.portfolio_url) setPortfolioUrl(config.portfolio_url);
          if (config.social_linkedin) setSocialLinkedin(config.social_linkedin);
          if (config.social_github) setSocialGithub(config.social_github);
          if (config.social_twitter) setSocialTwitter(config.social_twitter);
          if (config.logo_url) setLogoUrl(config.logo_url);
          if (config.banner_url) setBannerUrl(config.banner_url);
          if (config.profile_icon_url) setProfileIconUrl(config.profile_icon_url);
        } else {
          // Fallback to local storage if API fails or settings empty
          const savedKey = localStorage.getItem("gemini_api_key");
          if (savedKey) setGeminiKey(savedKey);
          const savedUser = localStorage.getItem("gmail_user");
          const savedPass = localStorage.getItem("gmail_pass");
          if (savedUser) setGmailUser(savedUser);
          if (savedPass) setGmailPass(savedPass);
        }
      } catch (err) {
        console.error("Failed to fetch settings from server:", err);
      }
    }
    fetchSettings();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    async function loadData() {
      try {
        const leadsRes = await fetch("/api/leads");
        if (leadsRes.ok) {
          const data = await leadsRes.json();
          const parsed = data.map(l => ({
            ...l,
            rating: l.rating ? parseFloat(l.rating) : 4.0,
            reviews: l.reviews ? parseInt(l.reviews) : 0
          }));
          setLeads(prev => {
            if (JSON.stringify(prev) === JSON.stringify(parsed)) return prev;
            return parsed;
          });
        }

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
          setEmails(prev => {
            if (JSON.stringify(prev) === JSON.stringify(mapped)) return prev;
            return mapped;
          });
        }
      } catch (err) {
        console.error("Failed to load initial data from server:", err);
      }
    }
    loadData();
    const interval = setInterval(loadData, 10000); // sync database every 10s
    return () => clearInterval(interval);
  }, [currentUser]);

  const leadsRef = useRef(leads);
  const gmailUserRef = useRef(gmailUser);
  const gmailPassRef = useRef(gmailPass);
  const geminiKeyRef = useRef(geminiKey);
  const senderNameRef = useRef(senderName);
  const senderRoleRef = useRef(senderRole);
  const companyNameRef = useRef(companyName);
  const useCompanyBrandingRef = useRef(useCompanyBranding);
  const outreachStyleRef = useRef(outreachStyle);
  const pitchOfferRef = useRef(pitchOffer);
  const customOfferDetailsRef = useRef(customOfferDetails);
  const senderTypeRef = useRef(senderType);
  const aboutTextRef = useRef(aboutText);
  const portfolioUrlRef = useRef(portfolioUrl);
  const socialLinkedinRef = useRef(socialLinkedin);
  const socialGithubRef = useRef(socialGithub);
  const socialTwitterRef = useRef(socialTwitter);
  const logoUrlRef = useRef(logoUrl);
  const bannerUrlRef = useRef(bannerUrl);
  const profileIconUrlRef = useRef(profileIconUrl);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    pitchOfferRef.current = pitchOffer;
  }, [pitchOffer]);

  useEffect(() => {
    customOfferDetailsRef.current = customOfferDetails;
  }, [customOfferDetails]);

  useEffect(() => {
    gmailUserRef.current = gmailUser;
  }, [gmailUser]);

  useEffect(() => {
    gmailPassRef.current = gmailPass;
  }, [gmailPass]);

  useEffect(() => {
    geminiKeyRef.current = geminiKey;
  }, [geminiKey]);

  useEffect(() => {
    senderNameRef.current = senderName;
  }, [senderName]);

  useEffect(() => {
    senderRoleRef.current = senderRole;
  }, [senderRole]);

  useEffect(() => {
    companyNameRef.current = companyName;
  }, [companyName]);

  useEffect(() => {
    useCompanyBrandingRef.current = useCompanyBranding;
  }, [useCompanyBranding]);

  useEffect(() => {
    outreachStyleRef.current = outreachStyle;
  }, [outreachStyle]);

  useEffect(() => {
    senderTypeRef.current = senderType;
  }, [senderType]);

  useEffect(() => {
    aboutTextRef.current = aboutText;
  }, [aboutText]);

  useEffect(() => {
    portfolioUrlRef.current = portfolioUrl;
  }, [portfolioUrl]);

  useEffect(() => {
    socialLinkedinRef.current = socialLinkedin;
  }, [socialLinkedin]);

  useEffect(() => {
    socialGithubRef.current = socialGithub;
  }, [socialGithub]);

  useEffect(() => {
    socialTwitterRef.current = socialTwitter;
  }, [socialTwitter]);

  useEffect(() => {
    logoUrlRef.current = logoUrl;
  }, [logoUrl]);

  useEffect(() => {
    bannerUrlRef.current = bannerUrl;
  }, [bannerUrl]);

  useEffect(() => {
    profileIconUrlRef.current = profileIconUrl;
  }, [profileIconUrl]);

  useEffect(() => {
    if (!campaignRunning) return;

    let active = true;
    let timeoutId = null;

    async function processNextLead() {
      const currentLeads = leadsRef.current;
      const currentGmailUser = gmailUserRef.current;
      const currentGmailPass = gmailPassRef.current;
      const currentGeminiKey = geminiKeyRef.current;
      const currentSenderName = senderNameRef.current;
      const currentSenderRole = senderRoleRef.current;
      const currentCompanyName = companyNameRef.current;
      const currentUseCompanyBranding = useCompanyBrandingRef.current;
      const currentOutreachStyle = outreachStyleRef.current;
      const currentSenderType = senderTypeRef.current;
      const currentAboutText = aboutTextRef.current;
      const currentPortfolioUrl = portfolioUrlRef.current;
      const currentSocialLinkedin = socialLinkedinRef.current;
      const currentSocialGithub = socialGithubRef.current;
      const currentSocialTwitter = socialTwitterRef.current;
      const currentLogoUrl = logoUrlRef.current;
      const currentBannerUrl = bannerUrlRef.current;
      const currentProfileIconUrl = profileIconUrlRef.current;

      const pendingLeads = currentLeads.filter(l => l.status === "not contacted" || l.status === "new");
      
      if (pendingLeads.length === 0) {
        showToast("No pending 'not contacted' leads in queue. Background campaigns finished!", "success");
        setCampaignRunning(false);
        return;
      }

      const lead = pendingLeads[0];
      showToast(`Campaign: Generating personalized pitch for "${lead.name}"...`, "info");

      try {
        let senderIntro = "";
        let signature = "";
        if (currentUseCompanyBranding && currentCompanyName) {
          senderIntro = `${currentSenderName}, ${currentSenderRole} at ${currentCompanyName}`;
          signature = `${currentSenderName}\n${currentSenderRole}\n${currentCompanyName}`;
        } else {
          senderIntro = `${currentSenderName}, ${currentSenderRole}`;
          signature = `${currentSenderName}\n${currentSenderRole}`;
        }

        let subject = `quick question about ${lead.name}`;
        let body = `Hi,\n\nI'm ${senderIntro}. I was checking out ${lead.name} in ${lead.city}.\n\nI design simple, custom AI reservation assistants and chat widgets that help cafes handle WhatsApp bookings automatically, saving 2-3 hours daily. I noticed you guys have an awesome ${lead.rating}⭐ rating with ${lead.reviews} reviews, and thought an auto-reply setup would work great for your Yelp and Instagram DMs.\n\nI built a quick preview for ${lead.name} - would you be open to a quick 10-minute check this week?\n\nCheers,\n${signature}`;

        if (currentGeminiKey) {
          try {
            let styleGuidelines = "";
            const pitchIdentity = (currentUseCompanyBranding && currentCompanyName) ? `${currentSenderRole} from ${currentCompanyName}` : currentSenderRole;

            const currentPitchOffer = pitchOfferRef.current;
            const currentCustomOfferDetails = customOfferDetailsRef.current;

            if (currentOutreachStyle === "roi") {
              styleGuidelines = `
              - Pitch Angle: ROI-focused. Emphasize saving 2-3 hours of staff time daily, never missing booking messages, and improving conversion rates of chat visitors into paying customers. Mention financial benefits and call automation.`;
            } else if (currentOutreachStyle === "feedback") {
              styleGuidelines = `
              - Pitch Angle: Opinions/Feedback. Start by referencing their Yelp rating of ${lead.rating}⭐ and reviews count (${lead.reviews} reviews). Note that they must get flooded with reservation requests, and share a constructive tip on how automated IG/Yelp chat replies could streamline their reservation flow.`;
            } else if (currentOutreachStyle === "direct") {
              styleGuidelines = `
              - Pitch Angle: Pre-built Demo Showcase. Pitch directly that you've put together a quick, pre-built custom AI chat booking assistant prototype specifically customized for ${lead.name} to demonstrate how it handles instant reservations.`;
            } else {
              styleGuidelines = `
              - Pitch Angle: Casual, warm, and helpful ${pitchIdentity} offering to help another local business owner. Keep it very conversational and low-friction.`;
            }

            let offerGuidelines = "";
            if (currentPitchOffer === "whatsapp_bot") {
              offerGuidelines = `offering custom AI chat booking and WhatsApp reservation bots that automate reservation scheduling and handle bookings automatically.`;
            } else if (currentPitchOffer === "website_dev") {
              offerGuidelines = `offering custom website design, modern web development, and local optimization to build high-converting websites.`;
            } else if (currentPitchOffer === "ai_chatbot") {
              offerGuidelines = `offering custom AI chatbot assistants that reply to customer inquiries instantly on their website, Yelp, and Instagram DMs 24/7.`;
            } else if (currentPitchOffer === "custom" && currentCustomOfferDetails) {
              offerGuidelines = `offering: ${currentCustomOfferDetails}. Focus your pitch around this specific custom offer.`;
            }

            const promptText = `
              You are ${currentSenderName}, working as "${currentSenderRole}"${(currentUseCompanyBranding && currentCompanyName) ? ` at ${currentCompanyName}` : ""}. Write a highly personalized cold outreach email to a business owner.
              
              Sender Profile Context:
              - Account Type: ${currentSenderType}
              - Sender Bio / Brand Description: ${currentAboutText}
              - Sender Portfolio Website: ${currentPortfolioUrl || "None"}
              - Sender Social Media: LinkedIn: ${currentSocialLinkedin || "None"}, GitHub: ${currentSocialGithub || "None"}, Twitter: ${currentSocialTwitter || "None"}
              - Branding Images: Logo URL: ${currentLogoUrl || "None"}, Banner URL: ${currentBannerUrl || "None"}, Profile Icon URL: ${currentProfileIconUrl || "None"}

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
              - Target Audience: Local business owner
              - Tone: Casual, helpful, friendly.
              - Core Pitch Offer: ${offerGuidelines}
              - Personalization Rules:
                - Incorporate sender's bio context ("${currentAboutText}") to state why you are reaching out and highlight relevant skills/background.
                - If a portfolio URL (${currentPortfolioUrl}) or social links (like GitHub ${currentSocialGithub} or LinkedIn ${currentSocialLinkedin}) are provided, naturally mention them to build high credibility.
                - If the Core Pitch Offer is website design/development (website_dev):
                  - If Website Status is "no_website", write that you noticed they don't have a website, and pitch why having a modern website will capture local search traffic and build customer trust.
                  - If Website Status is "down", write that you tried to visit their site and noticed it was down, broken, or inaccessible, and offer to help get it back online or rebuild a modern, reliable one.
                  - If Website Status is "active", write that you checked their website, and suggest specific subtle improvements (e.g. mobile optimizations, fast page loading, cleaner layout).
                - If Core Pitch Offer is WhatsApp Booking Bot or AI Chatbot, highlight how their customers can book appointments or get instant support via chat DMs 24/7.
                - If Core Pitch Offer is a custom service, analyze the custom service details and identify the key pain point it solves for a business of this category (${lead.type}). Address how this business specifically (${lead.name}) can benefit from it, referencing their Yelp metrics or website presence to personalize the pitch.
              ${styleGuidelines}
              - Signature: Use exactly this:
                Cheers,
                ${signature}
              - Subject Line: Make it short, lowercase, click-worthy (e.g. "quick question for ${lead.name}" or "website query").
              - Format: Output ONLY the email. Start with a "Subject: " line on the first line, then a blank line, and then the email body.
            `;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentGeminiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                  thinkingConfig: {
                    thinkingBudget: 0
                  }
                }
              }),
              signal: AbortSignal.timeout(15000)
            });
            if (response.ok) {
              const data = await response.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (text.startsWith("Subject:")) {
                const split = text.split("\n\n");
                subject = split[0].replace("Subject:", "").trim();
                body = split.slice(1).join("\n\n").trim();
              } else if (text) {
                subject = `AI Automation Pitch for ${lead.name}`;
                body = text.trim();
              }
            }
          } catch (e) {
            console.error("Gemini generation failed for campaign, using fallback:", e);
          }
        } else {
          let offerDesc = "design simple, custom AI reservation assistants and chat widgets that help cafes handle WhatsApp bookings automatically, saving 2-3 hours daily";
          if (pitchOfferRef.current === "website_dev") {
            offerDesc = "design and develop modern, high-performing websites and custom web platforms to help businesses turn traffic into loyal customers";
          } else if (pitchOfferRef.current === "ai_chatbot") {
            offerDesc = "build intelligent custom AI chatbot assistants that reply to customer inquiries instantly on your website, Yelp, and Instagram DMs 24/7";
          } else if (pitchOfferRef.current === "custom" && customOfferDetailsRef.current) {
            offerDesc = customOfferDetailsRef.current;
          }

          subject = `quick question for ${lead.name}`;
          body = `Hi,\n\nI was looking at ${lead.name} in ${lead.city} and wanted to reach out. I'm ${senderIntro}.\n\nI ${offerDesc}. I noticed you guys have an awesome ${lead.rating}⭐ rating with ${lead.reviews} reviews, and thought this would work great for your business.\n\nI built a quick preview for ${lead.name} - would you be open to a quick 10-minute check this week?\n\nCheers,\n${signature}`;
        }

        if (active) {
          if (!currentGmailUser || !currentGmailPass) {
            showToast("Gmail is disconnected. Please connect your Gmail account in the top-right navbar to send real outreach. Pausing autonomous campaigns.", "danger");
            setCampaignRunning(false);
            return;
          }

          let targetStatus = "contacted";
          if (lead.email) {
            showToast(`Campaign: Sending real email via SMTP to "${lead.name}"...`, "info");
            const mailResponse = await fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                gmailUser: currentGmailUser,
                gmailPass: currentGmailPass,
                to: lead.email,
                subject: subject,
                body: body
              })
            });
            if (!mailResponse.ok) {
              const errData = await mailResponse.json().catch(() => ({}));
              throw new Error(errData.error || `SMTP error ${mailResponse.status}`);
            }
          } else {
            targetStatus = "no_email";
            showToast(`Lead "${lead.name}" has no email address. Marking as 'no_email' and skipping outreach.`, "warn");
          }

          const statusRes = await fetch(`/api/leads/${lead.id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: targetStatus })
          });
          if (!statusRes.ok) throw new Error("Failed to update lead status in database");

          setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status: targetStatus } : l));
          
          if (currentGmailUser && currentGmailPass && lead.email) {
            showToast(`Real email sent to ${lead.name}!`, "success");
          } else if (lead.email) {
            showToast(`Simulated campaign outreach complete for ${lead.name}!`, "success");
          }
        }
      } catch (err) {
        console.error("Campaign process error:", err);
        showToast(`Campaign error on "${lead.name}": ${err.message}`, "danger");
      }

      if (active) {
        timeoutId = setTimeout(processNextLead, 5000);
      }
    }

    timeoutId = setTimeout(processNextLead, 1000);

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [campaignRunning]);

  const showToast = (message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const triggerSearch = async (niche = "Cafes", location = "Austin, TX", searchMode = "scraper") => {
    if (searching) return;
    setSearching(true);
    setSearchProgress(0);
    const modeLabel = searchMode === "deepsearch" ? "Gemini DeepSearch AI" : "autonomous Yelp scan";
    setSearchLog([{ type: "info", text: `Initializing ${modeLabel} for '${niche}' in '${location}'...` }]);
    showToast(`Starting ${modeLabel}...`, "info");

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress > 90) progress = 90;
      setSearchProgress(progress);
    }, 250);

    try {
      const endpoint = searchMode === "deepsearch" ? "/api/scan-deepsearch" : "/api/scan";
      const body = { niche, location };
      if (searchMode === "deepsearch") {
        body.geminiKey = geminiKey;
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status: ${response.status}`);
      }

      const data = await response.json();
      setSearchProgress(100);
      setSearchLog(data.logs || []);
      
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
      
      showToast(`Scan complete. Found and saved ${data.leads?.length || 0} leads!`, "success");
    } catch (err) {
      clearInterval(progressInterval);
      setSearchProgress(100);
      setSearchLog(prev => [...prev, { type: "danger", text: `Scan failed: ${err.message}` }]);
      showToast(`Scan failed: ${err.message}`, "danger");
    } finally {
      setSearching(false);
    }
  };

  if (!currentUser) {
    return <Auth onLogin={(user) => setCurrentUser(user)} showToast={showToast} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-deep)" }}>
      
      {/* Toast notifications float list */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span style={{ fontSize: "14px" }}>
              {t.type === "success" ? "✓" : t.type === "warn" ? "⚠️" : t.type === "danger" ? "✕" : "ℹ"}
            </span>
            {t.message}
          </div>
        ))}
      </div>

      {/* Mobile Top Bar Header */}
      <div className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "18px", fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.04em" }}>
            Syn<span style={{ color: "var(--color-lime)" }}>tek</span>
          </div>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "24px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px"
          }}
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Sidebar Layout */}
      <div className="app-container">
        
        {/* Sidebar Nav Backdrop Overlay */}
        <div 
          className={`sidebar-overlay ${mobileMenuOpen ? "visible" : ""}`} 
          onClick={() => setMobileMenuOpen(false)} 
        />
        
        {/* Sidebar Nav */}
        <div className={`sidebar-nav ${mobileMenuOpen ? "open" : ""}`}>
          {/* Logo Branding */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "36px" }}>
            <div style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--text-primary)" }}>
              Syn<span style={{ color: "var(--color-lime)" }}>tek</span>
            </div>
            <span style={{ 
              fontSize: "9px", 
              background: "rgba(200,255,0,0.1)", 
              color: "var(--color-lime)", 
              border: "1px solid rgba(200,255,0,0.2)",
              padding: "2px 6px", 
              borderRadius: "4px", 
              fontWeight: 700,
              textTransform: "uppercase"
            }}>SaaS Engine</span>
          </div>

          {/* Navigation Links */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            {[
              { id: "Dashboard", label: "Dashboard", icon: "📊" },
              { id: "Lead Finder", label: "Lead Finder", icon: "🔍" },
              { id: "Campaigns", label: "Campaigns", icon: "✉️" },
              { id: "Inbox", label: "Smart Inbox", icon: "📥", badgeCount: emails.filter(e => !e.read).length },
              { id: "Pipeline", label: "Kanban Board", icon: "📋" },
              { id: "Analytics", label: "Analytics", icon: "📈" },
              { id: "Settings", label: "Scheduler & Config", icon: "⚙️" }
            ].map(t => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: isActive ? "rgba(200, 255, 0, 0.08)" : "transparent",
                    color: isActive ? "var(--color-lime)" : "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: "14px",
                    transition: "all 0.2s"
                  }}
                  className="sidebar-nav-btn"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "16px" }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </div>
                  {t.badgeCount > 0 && (
                    <span style={{
                      background: "var(--color-indigo)",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "10px"
                    }}>{t.badgeCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SMTP Gateway Secure Switch inside Sidebar Bottom */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: gmailUser && gmailPass ? "var(--color-emerald)" : "var(--color-crimson)",
                boxShadow: gmailUser && gmailPass ? "0 0 8px var(--color-emerald)" : "0 0 8px var(--color-crimson)",
              }} />
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                {gmailUser && gmailPass ? `Gmail: ${gmailUser}` : "Gmail Disconnected"}
              </span>
            </div>

            {gmailUser && gmailPass ? (
              <button 
                className="btn btn-outline btn-sm" 
                style={{ fontSize: "11px", borderColor: "rgba(239, 68, 68, 0.4)", color: "var(--color-crimson)", width: "100%" }}
                onClick={() => {
                  setGmailUser("");
                  setGmailPass("");
                  localStorage.removeItem("gmail_user");
                  localStorage.removeItem("gmail_pass");
                  fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ gmail_user: "", gmail_pass: "" })
                  }).catch(console.error);
                  showToast("Gmail account disconnected", "warn");
                }}
              >
                Disconnect
              </button>
            ) : (
              <button 
                className="btn btn-lime btn-sm" 
                style={{ fontSize: "11px", width: "100%" }}
                onClick={() => setShowGmailModal(true)}
              >
                ✉ Connect Gmail
              </button>
            )}

            <button 
              className="btn btn-outline btn-sm" 
              style={{ fontSize: "11px", borderColor: "var(--border-translucent)", color: "var(--text-secondary)", width: "100%", marginTop: "4px" }}
              onClick={() => {
                localStorage.removeItem("x-user-id");
                localStorage.removeItem("auth_token");
                localStorage.removeItem("current_user");
                setCurrentUser(null);
                setLeads([]);
                setEmails([]);
                showToast("Logged out successfully", "info");
              }}
            >
              🚪 Log Out
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", overflowX: "hidden" }}>
          
          {/* Header Panel */}
          <div style={{
            height: "var(--header-height)",
            borderBottom: "var(--border-subtle)",
            background: "var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px"
          }}>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              {tab}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <button
                onClick={toggleTheme}
                style={{
                  background: "var(--bg-translucent-mild)",
                  border: "var(--border-subtle)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
                className="theme-toggle-btn"
              >
                {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
              </button>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                {currentUser ? `${currentUser.company_name} Portal (${currentUser.email})` : "Syntek"}
              </span>
            </div>
          </div>

          {/* Primary Viewport container */}
          <div className="container" style={{ flex: 1, padding: "40px" }}>
            {tab === "Dashboard" && (
              <Dashboard 
                leads={leads} 
                emails={emails} 
                setTab={setTab} 
                triggerSearch={triggerSearch} 
                analytics={ANALYTICS_DATA} 
              />
            )}
            
            {tab === "Lead Finder" && (
              <LeadFinder 
                leads={leads}
                setLeads={setLeads}
                selectedLeads={selectedLeads}
                setSelectedLeads={setSelectedLeads}
                searching={searching}
                searchProgress={searchProgress}
                triggerSearch={triggerSearch}
                searchLog={searchLog}
                activeLeadDrawer={activeLeadDrawer}
                setActiveLeadDrawer={setActiveLeadDrawer}
                showToast={showToast}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
              />
            )}

            {tab === "Campaigns" && (
              <Campaigns 
                leads={leads}
                setLeads={setLeads}
                campaignRunning={campaignRunning}
                setCampaignRunning={setCampaignRunning}
                showToast={showToast}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                gmailUser={gmailUser}
                gmailPass={gmailPass}
                senderName={senderName}
                senderRole={senderRole}
                companyName={companyName}
                useCompanyBranding={useCompanyBranding}
                outreachStyle={outreachStyle}
                pitchOffer={pitchOffer}
                customOfferDetails={customOfferDetails}
                senderType={senderType}
                aboutText={aboutText}
                portfolioUrl={portfolioUrl}
                socialLinkedin={socialLinkedin}
                socialGithub={socialGithub}
                socialTwitter={socialTwitter}
                logoUrl={logoUrl}
                bannerUrl={bannerUrl}
                profileIconUrl={profileIconUrl}
              />
            )}

            {tab === "Inbox" && (
              <Inbox 
                leads={leads}
                setLeads={setLeads}
                emails={emails}
                setEmails={setEmails}
                showToast={showToast}
                geminiKey={geminiKey}
                gmailUser={gmailUser}
                gmailPass={gmailPass}
              />
            )}

            {tab === "Pipeline" && (
              <Pipeline 
                leads={leads}
                setLeads={setLeads}
                showToast={showToast}
              />
            )}

            {tab === "Analytics" && (
              <Analytics 
                leads={leads}
                analytics={ANALYTICS_DATA}
              />
            )}

            {tab === "Settings" && (
              <Settings 
                showToast={showToast}
                gmailUser={gmailUser}
                gmailPass={gmailPass}
                setGmailUser={setGmailUser}
                setGmailPass={setGmailPass}
                googleConnected={googleConnected}
                googleEmail={googleEmail}
                googleSandboxMode={googleSandboxMode}
                setGoogleConnected={setGoogleConnected}
                setGoogleEmail={setGoogleEmail}
                setGoogleSandboxMode={setGoogleSandboxMode}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                senderType={senderType}
                aboutText={aboutText}
                portfolioUrl={portfolioUrl}
                socialLinkedin={socialLinkedin}
                socialGithub={socialGithub}
                socialTwitter={socialTwitter}
                logoUrl={logoUrl}
                bannerUrl={bannerUrl}
                profileIconUrl={profileIconUrl}
                updateParentSenderName={setSenderName}
                updateParentSenderRole={setSenderRole}
                updateParentCompanyName={setCompanyName}
                updateParentUseCompanyBranding={setUseCompanyBranding}
                updateParentOutreachStyle={setOutreachStyle}
                updateParentPitchOffer={setPitchOffer}
                updateParentCustomOfferDetails={setCustomOfferDetails}
                updateParentScheduleType={setScheduleType}
                updateParentSenderType={setSenderType}
                updateParentAboutText={setAboutText}
                updateParentPortfolioUrl={setPortfolioUrl}
                updateParentSocialLinkedin={setSocialLinkedin}
                updateParentSocialGithub={setSocialGithub}
                updateParentSocialTwitter={setSocialTwitter}
                updateParentLogoUrl={setLogoUrl}
                updateParentBannerUrl={setBannerUrl}
                updateParentProfileIconUrl={setProfileIconUrl}
              />
            )}
          </div>
        </div>
      </div>

      {/* Gmail Connection Modal */}
      {showGmailModal && (
        <>
          <div 
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 999
            }}
            onClick={() => setShowGmailModal(false)}
          />
          <div 
            className="glass-panel" 
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "440px",
              padding: "24px",
              zIndex: 1000,
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              gap: "16px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Connect Your Gmail Account</h3>
              <button 
                onClick={() => setShowGmailModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Send real personalized outreach emails directly from your own Gmail address. Syntek uses Gmail's secure SMTP servers to deliver your messages.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>GMAIL ADDRESS</label>
                <input 
                  type="email" 
                  id="gmail-user-input"
                  className="input-field" 
                  placeholder="your.email@gmail.com"
                  defaultValue={gmailUser}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>GMAIL APP PASSWORD</label>
                <input 
                  type="password" 
                  id="gmail-pass-input"
                  className="input-field" 
                  placeholder="•••• •••• •••• ••••"
                  defaultValue={gmailPass}
                />
                <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: "1.4", marginTop: "4px" }}>
                  💡 <strong>Important:</strong> Google requires a 16-character <strong>App Password</strong> for SMTP. 
                  Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" style={{ color: "var(--color-lime)", textDecoration: "underline" }}>Google Account Security</a> &gt; 2-Step Verification &gt; App passwords to generate one. Do not enter your main Google password.
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowGmailModal(false)}>Cancel</button>
              <button 
                className="btn btn-lime btn-sm"
                onClick={() => {
                  const userVal = document.getElementById("gmail-user-input")?.value?.trim();
                  const passVal = document.getElementById("gmail-pass-input")?.value?.trim();
                  if (!userVal || !passVal) {
                    showToast("Please provide both Gmail user and App Password", "warn");
                    return;
                  }
                  if (!userVal.includes("@gmail.com")) {
                    showToast("Must be a valid @gmail.com address", "warn");
                    return;
                  }
                  setGmailUser(userVal);
                  setGmailPass(passVal);
                  localStorage.setItem("gmail_user", userVal);
                  localStorage.setItem("gmail_pass", passVal);
                  fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ gmail_user: userVal, gmail_pass: passVal })
                  }).catch(console.error);
                  setShowGmailModal(false);
                  showToast("Gmail account connected successfully!", "success");
                }}
              >
                Connect Account
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
