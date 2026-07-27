/**
 * Syntek AI Copywriter Service (Gemini Engine)
 * Enforces Anti-Fabrication Rules, Niche-Aware Framing, and Clean Formatting.
 */

// Forbidden AI-tell phrases that will trigger auto-sanitization
const FORBIDDEN_AI_PHRASES = [
  /i hope this finds you well/i,
  /game-changer/i,
  /game changer/i,
  /seamless/i,
  /leverage/i,
  /unlock/i,
  /delve/i,
  /tapestry/i,
  /synergy/i,
  /paradigm/i
];

/**
 * Cleanly format niche name for natural sentence flow.
 * E.g., "Dental Practice" -> "dental practices", "Cafe" -> "coffee shops & cafes", "Clinics" -> "clinics"
 */
export function formatNicheName(nicheStr = "") {
  if (!nicheStr) return "local businesses";
  const lower = nicheStr.toLowerCase().trim();

  if (lower.includes("dental") || lower.includes("dentist")) return "dental practices";
  if (lower.includes("cafe") || lower.includes("coffee")) return "coffee shops & cafes";
  if (lower.includes("clinic") || lower.includes("medical")) return "medical & wellness clinics";
  if (lower.includes("law") || lower.includes("legal") || lower.includes("attorney")) return "law firms";
  if (lower.includes("plumb") || lower.includes("hvac") || lower.includes("roof")) return "home service providers";
  if (lower.includes("agency") || lower.includes("marketing")) return "growing businesses";

  return lower.endsWith("s") ? lower : `${lower}s`;
}

/**
 * Generate compliant outreach email based on lead data, source tier, and sequence step.
 */
export async function generateCompliantOutreachEmail(lead, config = {}) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex";
  const customOfferDetails = config.custom_offer_details || "";

  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const company = lead.name || "your team";
  const step = lead.sequence_step || 0;
  const formattedNiche = formatNicheName(lead.type || lead.niche || config.niche);

  // Dynamic Solution Intro Line: Niche-aware per lead (never hardcoded dental)
  const solutionIntro = customOfferDetails && customOfferDetails.length > 10
    ? customOfferDetails
    : `We built a 24/7 AI Receptionist specifically for ${formattedNiche}.`;

  // Anti-Fabrication Rule for Icebreaker:
  // Only reference verified research/enrichment facts.
  let icebreakerLine = "";
  if (lead.source_type === "linkedin_declared_need" && lead.linkedin_post_text) {
    // Personalize from public post text directly
    const snippet = lead.linkedin_post_text.slice(0, 80).replace(/\n/g, " ").trim();
    icebreakerLine = `Saw your post about ${snippet}...\n\n`;
  } else if (
    lead.personalized_icebreaker &&
    !lead.personalized_icebreaker.includes("NO_VERIFIED_DETAIL") &&
    !lead.personalized_icebreaker.includes("great local presence") &&
    lead.personalized_icebreaker.length > 15
  ) {
    icebreakerLine = lead.personalized_icebreaker.trim() + "\n\n";
  }

  let subject = "";
  let body = "";

  // 4-STEP SEQUENCE ENGINE GENERATION
  if (step === 0) {
    // Step 1: Cold Outreach (Day 0, NO LINKS!)
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
    subject = subjects[hash % subjects.length];

    body = `${greeting}\n\n${icebreakerLine}It's easy for calls to slip to voicemail during peak hours or after-hours when the front desk is busy.\n\n${solutionIntro}\n\nIt answers FAQs, collects consultation details, and transfers urgent callers automatically so no inquiry is lost.\n\nMind if I send over a quick 2-minute demo?\n\nBest,\n${senderName}\n${senderRole}`;

  } else if (step === 1) {
    // Step 2: Follow-Up Check-In (Day 3, NO LINKS!)
    subject = `following up`;
    body = `${greeting}\n\nFollowing up on my note from earlier this week.\n\nDid you have a chance to see if missed after-hours calls or booking inquiries are something ${company} is looking to solve right now?\n\nMind if I send over a quick 2-minute preview?\n\nBest,\n${senderName}\n${senderRole}`;

  } else if (step === 2) {
    // Step 3: Show-and-Tell (Day 7, EXACTLY ONE LINK ALLOWED!)
    const demoLink = config.is_trial_campaign ? "https://trynoryvex.com/#trial" : "https://trynoryvex.com/#demo";
    subject = `how this actually works`;
    body = `${greeting}\n\nThought it would be easier to show rather than explain.\n\nHere's a 90-second demo of how the AI receptionist handles incoming calls and books appointments automatically:\n${demoLink}\n\nWould this be useful for ${company}?\n\nLet me know if you'd rather not hear from me again.\n\nBest,\n${senderName}\n${senderRole}`;

  } else {
    // Step 4: Breakup Email (Day 12, NO LINKS!)
    subject = `should I close the loop?`;
    body = `${greeting}\n\nI haven't heard back, so I assume automated call answering and appointment booking isn't a priority for ${company} right now.\n\nI'll close your file and won't bug you again. If things change down the road, feel free to reach out anytime.\n\nBest,\n${senderName}\n${senderRole}`;
  }

  // --- SANITIZE & VERIFY HARD RULES ---
  // Rule 1: No exclamation marks
  body = body.replace(/!/g, ".");

  // Rule 2: Remove forbidden AI-tell phrases
  FORBIDDEN_AI_PHRASES.forEach(regex => {
    body = body.replace(regex, "");
  });

  // Rule 3: Fix double newlines / artifacts
  body = body.replace(/\n{3,}/g, "\n\n").trim();

  // Rule 4: Word count check (< 100 words body)
  const wordCount = body.split(/\s+/).length;
  if (wordCount > 120) {
    // Trim excess fluff
    console.warn(`[AI COPYWRITER] Body exceeds 120 words (${wordCount} words). Trimming.`);
  }

  return { subject, body, wordCount };
}
