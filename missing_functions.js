async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const senderType = config.sender_type || "developer";
  const aboutText = config.about_text || "";
  const portfolioUrl = config.portfolio_url || "";
  const socialLinkedin = config.social_linkedin || "";
  const socialGithub = config.social_github || "";
  const socialTwitter = config.social_twitter || "";
  const logoUrl = config.logo_url || "";
  const bannerUrl = config.banner_url || "";
  const profileIconUrl = config.profile_icon_url || "";
  const workSamples = config.work_samples || "";
  const senderLocation = config.sender_location || "";

  let senderIntro = "";
  let signature = "";
  if (useCompany && companyName) {
    senderIntro = `${senderName}, ${senderRole} at ${companyName}`;
    signature = `${senderName}\n${senderRole}\n${companyName}`;
  } else {
    senderIntro = `${senderName}, ${senderRole}`;
    signature = `${senderName}\n${senderRole}`;
  }

  const pitchOffer = config.pitch_offer || "whatsapp_bot";
  const customOfferDetails = config.custom_offer_details || "";

  let offerDescription = "design simple, custom AI reservation assistants and chat widgets that help cafes handle WhatsApp bookings automatically, saving 2-3 hours daily";
  if (pitchOffer === "website_dev") {
    offerDescription = "design and develop modern, high-performing websites and custom web platforms to help businesses turn traffic into loyal customers";
  } else if (pitchOffer === "ai_chatbot") {
    offerDescription = "build intelligent custom AI chatbot assistants that reply to customer inquiries instantly on your website, Google Maps, and Instagram DMs 24/7";
  } else if (pitchOffer === "custom" && customOfferDetails) {
    offerDescription = customOfferDetails;
  }

  // Pick fallback template index based on a simple hash of the lead's name to ensure diversity
  const templateIndex = Math.abs(lead.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 5;

  let subject = `quick question about ${lead.name}'s booking`;
  let body = `Hi,\n\nNoticed ${lead.name} has a great reputation in ${lead.city} but bookings still go through a phone call ΓÇö no online scheduling on the site.\n\nI build custom AI booking tools that let clients book directly (even after hours) without adding to your front desk's workload. Took me about 10 minutes to sketch how it'd work for your site.\n\nWorth a 2-minute look?\n\nΓÇö ${senderName}${portfolioUrl ? `\n\nPortfolio: ${portfolioUrl}` : ""}`;

  if (templateIndex === 0) {
    subject = `Quick idea for ${lead.name}`;
    body = `Hi,\n\nI was looking at ${lead.name}'s website and noticed a couple of opportunities to capture more appointments from your search traffic.\n\nI build custom web apps, SaaS dashboards, and chat widgets. You can see some of my work here: ${portfolioUrl || "noryvex.com"}\n\nWould you be open to a 10-second sketch of what a modern booking widget looks like on your site?\n\nBest,\n${senderName}`;
  } else if (templateIndex === 1) {
    subject = `${lead.name} scheduling`;
    body = `Hi,\n\nQuick question ΓÇö does your team manually schedule all reservations over the phone, or are you looking to automate booking this quarter?\n\nI ask because I help startups and local clinics/cafes implement custom automated schedulers that sync with their calendar automatically.\n\nShould I send over a quick 2-minute preview of how it would work for ${lead.name}?\n\nBest regards,\n${senderName}`;
  } else if (templateIndex === 2) {
    subject = `question about ${lead.name}'s website`;
    body = `Hi,\n\nNoticed the mobile version of ${lead.name}'s website has a few issues with reservation button alignments, which might be losing you bookings.\n\nI'm a developer and I build high-performance custom web applications and reservation tools. Here's my portfolio: ${portfolioUrl || "noryvex.com"}\n\nShould I send over a quick 30-second video of the layout tweaks I'd suggest?\n\nThanks,\n${senderName}`;
  } else if (templateIndex === 3) {
    subject = `quick question for ${lead.name}`;
    body = `Hi,\n\nIf adding new digital reservation features or automating patient/client booking is on your roadmap for ${lead.name} this year, I'd love to connect.\n\nI help owners build custom reservation bots and customer portals from idea to launch.\n\nWorth a 2-minute introductory chat this week?\n\nCheers,\n${senderName}`;
  } else if (templateIndex === 4) {
    subject = `one thing I noticed on ${lead.name}`;
    body = `Hi,\n\nI was looking at ${lead.name} and noticed bookings still go through a phone call ΓÇö no online scheduling option on the site.\n\nI build custom AI booking tools that let patients/clients book directly (even after hours) without adding to your workload.\n\nWorth a 2-minute look?\n\nΓÇö ${senderName}${portfolioUrl ? `\n\nPortfolio: ${portfolioUrl}` : ""}`;
  }

  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      let bestTemplateText = "";
      const userId = config.user_id;
      if (userId) {
        try {
          const bestTemplateRes = await pool.query(
             "SELECT subject_template, body_template FROM pitch_templates WHERE user_id = $1 AND is_active = TRUE AND sent_count > 0 ORDER BY (reply_count::float / NULLIF(sent_count::float, 0)) DESC LIMIT 1",
             [userId]
          );
          if (bestTemplateRes.rowCount > 0) {
            const bt = bestTemplateRes.rows[0];
            bestTemplateText = `\n\nREFERENCE EXAMPLE (Here is our historically highest-performing email pitch structure/tone for inspiration. Emulate its style, length, and lack of pushiness, but personalize it to the current business):\nSubject: ${bt.subject_template}\nBody:\n${bt.body_template}`;
          }
        } catch (e) {
          console.error("Failed to fetch best template for outreach generation:", e);
        }
      }

      const style = config.outreach_style || "casual";
      let styleGuidelines = "";
      
      const stylesToolkit = `
        HIGH-CONVERTING OUTREACH HOOK TEMPLATES & STYLES (You MUST select one of these 5 hook angles dynamically per email to ensure maximum variety and personalization. Do NOT use the same subject prefix or template structure for every lead):
        
        1. Problem-Based Hook (Subject: Quick idea about [Business Name] or [Business Name] website idea):
           - Intro Angle: Mention seeing a few digital opportunities where their website, reservation experience, or online presence could be improved without rebuilding everything.
        
        2. Observation Hook (Subject: One thing I noticed on [Business Name] or Custom web experience for [Business Name]):
           - Intro Angle: Make a highly personalized observation about their business or online presence.
        
        3. Curiosity Hook (Subject: Curious question or Question for [Business Name]):
           - Intro Angle: Ask a low-friction question: "are you currently planning to build anything new this quarter, or are you mostly focused on improving your existing platform?"
        
        4. ROI Hook (Subject: Saving hours at [Business Name] or Saving engineering time):
           - Intro Angle: Focus on the challenge of getting things built quickly and automating bookings without slowing down their core team/operations.
        
        5. Soft Value Hook (Subject: If development/updates are on [Business Name]'s roadmap...):
           - Intro Angle: If expanding their product, website, or booking features is on their roadmap, offer senior dev/automation help to get it done.
      `;

      if (style === "roi") {
        styleGuidelines = `
        - Pitch Angle Focus: Prioritize the ROI-focused hook. Emphasize saving 2-3 hours of staff time daily, never missing booking messages, and improving conversion rates of chat visitors into paying customers. Mention financial benefits and call automation.`;
      } else if (style === "feedback") {
        styleGuidelines = `
        - Pitch Angle Focus: Prioritize the Observation/Feedback hook. Start by referencing their Google rating of ${lead.rating}Γ¡É and reviews count (${lead.reviews} reviews). Note that they must get flooded with reservation requests, and share a constructive tip on how automated IG/Google Maps chat replies could streamline their reservation flow.`;
      } else if (style === "direct") {
        styleGuidelines = `
        - Pitch Angle Focus: Prioritize the Pre-built Demo Showcase hook. Pitch directly that you've put together a quick, pre-built custom AI chat booking assistant prototype specifically customized for ${lead.name} to demonstrate how it handles instant reservations.`;
      } else if (style === "collaboration") {
        styleGuidelines = `
        - Pitch Angle Focus: Prioritize the Collaboration & Partnership hook. Use a structure modeled after the "collaboration" style in the toolbox. Make it feel authentic, mentioning the specific industry and problem you solve, and proposing a collaboration check.`;
      } else {
        const pitchIdentity = (useCompany && companyName) ? `${senderRole} from ${companyName}` : senderRole;
        styleGuidelines = `
        - Pitch Angle Focus: Choose dynamically from the 5 templates in the styles toolkit. Keep it casual, warm, and helpful, offering to help another local business owner automate booking DMs, improve websites, or build custom reservation queries. Keep it very conversational and low-friction.`;
      }

      let offerGuidelines = "";
      if (pitchOffer === "whatsapp_bot") {
        offerGuidelines = `offering custom AI chat booking and WhatsApp reservation bots that automate reservation scheduling and handle bookings automatically.`;
      } else if (pitchOffer === "website_dev") {
        offerGuidelines = `offering custom website design, modern web development, and local optimization to build high-converting websites.`;
      } else if (pitchOffer === "ai_chatbot") {
        offerGuidelines = `offering custom AI chatbot assistants that reply to customer inquiries instantly on their website, Google Maps, and Instagram DMs 24/7.`;
      } else if (pitchOffer === "custom" && customOfferDetails) {
        offerGuidelines = `a custom-tailored service. Service details: "${customOfferDetails}". Use this description to understand our custom service.`;
      }

      const promptText = `
        You are ${senderName}, working as "${senderRole}"${(useCompany && companyName) ? ` at ${companyName}` : ""}.
        Redesign cold outreach from scratch for this specific business. Do NOT use templates or fixed structures.

        Sender Profile Context:
        - Account Type: ${senderType}
        - Sender Bio: ${aboutText}
        - Sender Portfolio Website: ${portfolioUrl || "None"}
        - Sender Social Media: LinkedIn: ${socialLinkedin || "None"}, GitHub: ${socialGithub || "None"}
        - Past Work Samples / Case Studies: ${workSamples || "None"}
        - Sender Location: ${senderLocation || "remote (works online)"}
        - Remote Context: ${senderLocation && senderLocation.toLowerCase() !== (lead.city || "").toLowerCase() ? `The sender is NOT local to ${lead.city}. Do NOT say you visited their location in-person. Use online-friendly phrases.` : "Sender is local/nearby."}

        Business Details:
        - Name: ${lead.name}
        - Category: ${lead.type}
        - Location: ${lead.city}
        - Google Rating: ${lead.rating} out of 5 stars
        - Google Reviews: ${lead.reviews}
        - Instagram: ${lead.instagram || "None"}
        - Website: ${lead.website || "None"}
        - Website Status: ${lead.website_status || "unknown"} (can be "active", "no_website", or "down")
        - Existing Personalized Icebreaker: ${lead.personalized_icebreaker || "None"}

        Outreach Guidelines:
        - Target Audience: Local business owner
        - Tone: Professional, human, friendly, helpful, conversational. Never salesy, robotic, or desperate.
        - Core Pitch Offer: ${offerGuidelines}
        - Proof & Links: If a portfolio URL (${portfolioUrl || ""}) is available, weave it naturally into the pitch as proof of your work.
        - Deep Personalization: Do NOT use lazy templates like praising their Google rating or review count. Instead, make a specific observation about their situation (e.g., "Noticed bookings still go through a phone call ΓÇö no online scheduling on the site" or "Your website mobile buttons overlap").
        - Low-Friction yes/no CTA: The CTA MUST be a specific, low-friction yes/no question (e.g., "Worth a 2-minute look?", "Should I send over a 10-second sketch of this?"). BANNED: Soft or open invitations like "Let me know if you want to chat" or "Happy to share ideas".
        - Click-Worthy Subject Line: Keep it short, lowercase, and highly specific/curious (e.g., "quick question about [Business]'s booking" or "quick idea for [Business]'s website").

        BANNED PHRASES: Do NOT use phrases like "Hope you're doing well", "I came across your website", "Just checking in", "Wanted to reach out", "We are the best", "Industry-leading", "Revolutionary", "Game changer", "Guaranteed", "World class".

        Pitch Strategy Engine:
        - First build a strategy from the user's selected niche, selected location, selected preset/custom offer, sender profile, work samples, and this lead's real data.
        - Translate the offer into the lead's industry language. For example: restaurants care about reservations and table inquiries; salons/clinics care about appointment requests; home services care about quote capture and missed calls; gyms/studios care about trials, memberships, and class questions; B2B firms care about lead qualification and response speed.
        - If this is a custom offer, do not copy the custom offer text. Extract its promised result, target buyer, pain point, and proof angle, then rewrite it naturally for this exact business.
        - Use work samples only when relevant to the lead's industry or pain. If they do not match, mention capability generally and do not invent proof.
        - Use the existing personalized icebreaker if it is concrete and useful. If it is generic, replace it with a stronger observation from rating, reviews, website status, social link, city, niche, or missing booking/contact flow.
        - If the sender is remote or in a different city/country, never imply local visits or in-person familiarity. Use online research language.
        - The final email must make clear: why this business, why this offer, why now, and what simple next step makes sense.

        AI THINKING STEP-BY-STEP PROCESS:
        1. Identify what the company actually does, their target customers, and brand positioning.
        2. Infer the best industry-specific pitch angle from selected offer/custom offer + selected niche/location + this lead's actual data.
        3. Find a genuine personalized icebreaker based on their existing icebreaker, rating, location, niche, website status, or social profile (never generic compliments like "I love your website").
        4. Identify specific opportunities/weaknesses (website down/missing, outdated mobile styling, slow loading, missing booking tools, manual FAQ processing) in a constructive, friendly way.
        5. Match relevant services that fit their business needs (don't force unrelated products).
        6. Explain the business outcome / value proposition in industry terms.
        7. Offer a low-friction call-to-action (CTA) e.g., asking for simple permission to show them a concept sketch, quick preview mockup, or 2-minute audit.

        Return a single JSON object with these EXACT keys:
        - "thinking": A brief paragraph detailing your step-by-step research answers (What they do, their customers, opportunities, matched service reason).
        - "subject": Short click-worthy personalized subject line (no generic or spam words, lowercase).
        - "opening": Personalized opening sentence hook referring to their business directly.
        - "personalizedBody": Opportunity-focused paragraph explaining what can be improved.
        - "valueProposition": The business benefit/outcome of the matched service for them, including portfolio URL if available.
        - "cta": Low-pressure yes/no CTA (asking simple permission to send a quick concept preview).
        - "closing": Cheers, ${senderName}${(useCompany && companyName) ? `\n${senderRole}\n${companyName}` : `\n${senderRole}`}
        - "followUp1": "Subject: [follow up subject]\\n\\n[A short, friendly follow-up email text sent 3 days later, referencing the previous idea and offering simple value or permission to share a mockup]"
        - "followUp2": "Subject: [follow up subject]\\n\\n[A short, conversational second follow-up text sent 7 days later, simple and low pressure]"
        - "linkedinConnection": "A short, friendly LinkedIn connection request message (max 300 characters, no sales pitch, just warm networking context)"
        - "linkedinFollowUp": "A short, conversational follow-up message to send once they accept the LinkedIn connection"
        - "shortVersion": "Subject: [short subject]\\n\\n[An ultra-concise email version under 60 words body]"
        - "longVersion": "Subject: [long subject]\\n\\n[A deconstructive, high-impact version under 150 words body]"
        Return a raw JSON string.
      `;
      
      const response = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          }),
          signal: AbortSignal.timeout(30000)
        },
        (type, text) => console.log(`[CAMPAIGN GEMINI RETRY] [${type.toUpperCase()}] ${text}`),
        3
      );
      
      if (response) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) {
          try {
            const parsed = JSON.parse(text);
            const fullBody = `${parsed.opening}\n\n${parsed.personalizedBody}\n\n${parsed.valueProposition}\n\n${parsed.cta}\n\n${parsed.closing}`;
            // Return parsed fields as well as subject/body
            return {
              subject: parsed.subject || `quick question for ${lead.name}`,
              body: fullBody,
              thinking: parsed.thinking || "",
              followUp1: parsed.followUp1 || "",
              followUp2: parsed.followUp2 || "",
              linkedinConnection: parsed.linkedinConnection || "",
              linkedinFollowUp: parsed.linkedinFollowUp || "",
              shortVersion: parsed.shortVersion || "",
              longVersion: parsed.longVersion || "",
              parsed: parsed
            };
          } catch (jsonErr) {
            console.error("[CAMPAIGN GEMINI JSON PARSE ERR] Falling back to text split", jsonErr, text);
          }
        }
      }
    } catch (e) {
      console.error("[CAMPAIGN GEMINI GENERATION FAIL]", e);
    }
  }

  return { subject, body };
}

async function selectPitchTemplateForUser(userId) {
  try {
    const res = await pool.query(
      "SELECT * FROM pitch_templates WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );
    if (res.rowCount === 0) return null;
    
    const templates = res.rows;
    
    // Epsilon-Greedy selection: 30% exploration, 70% exploitation
    const epsilon = 0.3;
    const pickRandom = Math.random() < epsilon;
    
    if (pickRandom) {
      const idx = Math.floor(Math.random() * templates.length);
      return templates[idx];
    } else {
      let bestTemplate = templates[0];
      let bestRate = -1;
      
      for (const t of templates) {
        const sent = parseInt(t.sent_count) || 0;
        const replies = parseInt(t.reply_count) || 0;
        const rate = sent === 0 ? 0 : replies / sent;
        if (rate > bestRate) {
          bestRate = rate;
          bestTemplate = t;
        }
      }
      return bestTemplate;
    }
  } catch (err) {
    console.error("Error in selectPitchTemplateForUser:", err.message);
    return null;
  }
}

async function evolvePitchTemplate(userId, config) {
  try {
    const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
    
    // Fetch active templates for the user
    const res = await pool.query(
      "SELECT * FROM pitch_templates WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );
    if (res.rowCount === 0) return;
    
    const templates = res.rows;
    
    // Find the low-performing template to evolve: sent >= 5 and reply_rate < 0.10
    const lowTemplate = templates.find(t => {
      const sent = parseInt(t.sent_count) || 0;
      const replies = parseInt(t.reply_count) || 0;
      const rate = sent === 0 ? 0 : replies / sent;
      return sent >= 5 && rate < 0.10;
    });
    
    if (!lowTemplate) return;
    
    // Find the best-performing template as reference
    let bestTemplate = null;
    let bestRate = -1;
    for (const t of templates) {
      if (t.id === lowTemplate.id) continue;
      const sent = parseInt(t.sent_count) || 0;
      const replies = parseInt(t.reply_count) || 0;
      const rate = sent === 0 ? 0 : replies / sent;
      if (rate > bestRate && replies > 0) {
        bestRate = rate;
        bestTemplate = t;
      }
    }
    
    console.log(`[AI PITCH OPTIMIZER] Evolving low-performing template "${lowTemplate.version_name}" (ID ${lowTemplate.id}) for user ${userId}...`);
    
    const promptText = `
You are an AI Pitch Optimizer Agent. Your goal is to rewrite a low-performing cold outreach email template to improve its reply rate.
We are running A/B tests on cold email pitches for local businesses.

Here is the low-performing template that we want to evolve:
- Name: ${lowTemplate.version_name}
- Subject Template: ${lowTemplate.subject_template}
- Body Template: ${lowTemplate.body_template}
- Sent Count: ${lowTemplate.sent_count}
- Reply Count: ${lowTemplate.reply_count}

${bestTemplate ? `Here is the highest-performing template for this user as a reference:
- Name: ${bestTemplate.version_name}
- Subject Template: ${bestTemplate.subject_template}
- Body Template: ${bestTemplate.body_template}
- Sent Count: ${bestTemplate.sent_count}
- Reply Count: ${bestTemplate.reply_count}` : ""}

Strategy Guidelines:
- Analyze why the low-performing template failed (e.g., too salesy, weak hook, poor framing).
- Incorporate trending email copy frameworks (e.g. short, conversational, pattern interrupt, permission-based call to action, offering a free video audit or demo instead of booking a call directly).
- Use these exact placeholders in brackets: {{FirstName}} (recipient owner name), {{BusinessName}} (company name), {{City}} (location), {{Website}} (website url).
- Ensure the tone matches professional yet casual cold outreach from Muhammad, an AI automation developer.

Response Format:
You must respond ONLY with a JSON object in this format:
{
  "versionName": "Evolved version name (e.g., Evolved Miner Style)",
  "subject": "Email Subject Line",
  "body": "Email body content"
}
Do not output any markdown code blocks, conversational intro/outro text, or explanations. Just the JSON object.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const payload = {
      contents: [{ parts: [{ text: promptText }] }]
    };
    
    const resObj = await fetchGeminiWithRetry(url, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    
    const resJson = await resObj.json();
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    let parsed = null;
    try {
      let cleanText = rawText.trim();
      const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) cleanText = match[1].trim();
      parsed = JSON.parse(cleanText);
    } catch (e) {
      console.error("Failed to parse evolved pitch JSON from model:", e.message, rawText);
      return;
    }
    
    if (parsed && parsed.versionName && parsed.subject && parsed.body) {
      await pool.query(
        "UPDATE pitch_templates SET is_active = FALSE WHERE id = $1",
        [lowTemplate.id]
      );
      
      const insRes = await pool.query(
        `INSERT INTO pitch_templates (user_id, version_name, subject_template, body_template)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, parsed.versionName, parsed.subject, parsed.body]
      );
      
      console.log(`[AI PITCH OPTIMIZER] Successfully evolved pitch template to "${parsed.versionName}" (ID ${insRes.rows[0].id}) for user ${userId}.`);
      
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, link)
         VALUES ($1, $2, $3, 'system', 'Dashboard')`,
        [
          userId,
          `≡ƒôê Pitch Evolved: ${parsed.versionName}`,
          `Our AI agent automatically optimized low-performing pitch "${lowTemplate.version_name}" and evolved it to increase your reply rates!`,
          'system'
        ]
      );
    }
  } catch (err) {
    console.error("Error in evolvePitchTemplate:", err.message);
  }
}

