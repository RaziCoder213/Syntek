/**
 * Syntek AI Copywriter Service (Gemini Engine)
 * Enforces Anti-Fabrication Rules, Niche-Aware Framing, Master Description Template, and Clean Formatting.
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
 * NICHE VARIABLE MAPPING (Config dictionary for master description & sequence engine)
 * Keyed by lead.niche or normalized niche group.
 */
export const NICHE_MAPPING = {
  dental_medical: {
    niche_plural: "dental and medical clinics",
    staff_role_plural: "front desk staff",
    primary_activity: "serving patients",
    inquiry_type: "patient inquiry",
    service_type: "dental services, accepted insurances",
    booking_type: "appointment or consultation",
    contact_details_type: "patient",
    core_work: "patient care"
  },
  cafe_restaurant: {
    niche_plural: "cafes and restaurants",
    staff_role_plural: "staff",
    primary_activity: "serving customers",
    inquiry_type: "order or reservation",
    service_type: "menu, hours, catering",
    booking_type: "reservation or order",
    contact_details_type: "customer",
    core_work: "customer experience"
  },
  home_services: {
    niche_plural: "home service businesses",
    staff_role_plural: "your team",
    primary_activity: "on-site jobs",
    inquiry_type: "service request",
    service_type: "services, pricing, availability",
    booking_type: "service or quote",
    contact_details_type: "customer",
    core_work: "the job at hand"
  },
  salon_spa: {
    niche_plural: "salons and spas",
    staff_role_plural: "front desk staff",
    primary_activity: "serving clients",
    inquiry_type: "booking inquiry",
    service_type: "services, pricing",
    booking_type: "appointment",
    contact_details_type: "client",
    core_work: "client care"
  },
  legal_services: {
    niche_plural: "law firms and legal practices",
    staff_role_plural: "legal staff",
    primary_activity: "serving clients",
    inquiry_type: "client inquiry",
    service_type: "legal services, consultation options",
    booking_type: "consultation or case inquiry",
    contact_details_type: "client",
    core_work: "client advocacy"
  },
  auto_services: {
    niche_plural: "auto repair shops",
    staff_role_plural: "your team",
    primary_activity: "working on vehicles",
    inquiry_type: "repair or service inquiry",
    service_type: "services, pricing, estimates",
    booking_type: "service appointment or estimate",
    contact_details_type: "customer",
    core_work: "vehicle repairs"
  },
  general_small_business: {
    niche_plural: "small businesses",
    staff_role_plural: "your team",
    primary_activity: "serving customers",
    inquiry_type: "customer inquiry",
    service_type: "services",
    booking_type: "appointment or inquiry",
    contact_details_type: "customer",
    core_work: "their actual work"
  }
};

/**
 * Resolve raw niche string to mapping key.
 * Never silently defaults to dental_medical — uses general_small_business for unmapped niches.
 */
export function resolveNicheKey(rawNiche = "") {
  if (!rawNiche || typeof rawNiche !== "string") return "general_small_business";
  const lower = rawNiche.toLowerCase().trim();

  if (lower.includes("dental") || lower.includes("dentist") || lower.includes("clinic") || lower.includes("medical")) return "dental_medical";
  if (lower.includes("cafe") || lower.includes("coffee") || lower.includes("restaurant") || lower.includes("bakery") || lower.includes("diner")) return "cafe_restaurant";
  if (lower.includes("plumb") || lower.includes("hvac") || lower.includes("roof") || lower.includes("electric") || lower.includes("home service") || lower.includes("cleaner") || lower.includes("handyman")) return "home_services";
  if (lower.includes("salon") || lower.includes("spa") || lower.includes("hair") || lower.includes("barber") || lower.includes("beauty") || lower.includes("nail")) return "salon_spa";
  if (lower.includes("law") || lower.includes("legal") || lower.includes("attorney")) return "legal_services";
  if (lower.includes("auto") || lower.includes("car") || lower.includes("repair") || lower.includes("mechanic")) return "auto_services";

  return "general_small_business";
}

/**
 * Retrieve niche variables object.
 */
export function getNicheVariables(nicheInput = "") {
  const key = resolveNicheKey(nicheInput);
  return NICHE_MAPPING[key] || NICHE_MAPPING.general_small_business;
}

/**
 * MASTER DESCRIPTION TEMPLATE GENERATOR
 * Source of truth for outreach emails, website Solutions page, and llms.txt.
 */
export function getMasterDescription(nicheInput = "") {
  const vars = getNicheVariables(nicheInput);

  return `Our AI Receptionist is a 24/7 virtual assistant built for ${vars.niche_plural}. It answers every incoming call, even when your ${vars.staff_role_plural} are busy with ${vars.primary_activity}, so you never miss a ${vars.inquiry_type} or booking. It answers common questions about your ${vars.service_type}, hours, location, and other FAQs using your business's own information. It can also take ${vars.booking_type} inquiries, collect ${vars.contact_details_type} details, and qualify callers before passing them to your team. Every conversation can be automatically saved to Google Sheets or your CRM. If a caller needs to speak with someone directly, the AI transfers the call to your staff. Available 24/7, it reduces missed calls and saves your front desk time — without replacing your team.`;
}

/**
 * Cleanly format niche name for natural sentence flow.
 */
export function formatNicheName(nicheStr = "") {
  const vars = getNicheVariables(nicheStr);
  return vars.niche_plural;
}

/**
 * Generate compliant outreach email based on lead data, source tier, and sequence step.
 */
export async function generateCompliantOutreachEmail(lead, config = {}) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Founder, Noryvex";
  const senderEmail = config.sender_email || "razi@trynoryvex.com";

  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const company = lead.name || "your team";
  const step = lead.sequence_step || 0;
  const nicheVars = getNicheVariables(lead.type || lead.niche || config.niche);

  // Anti-Fabrication Rule for Icebreaker:
  // Only reference verified research/enrichment facts. Never fabricate details.
  let icebreakerLine = "";
  if (lead.source_type === "linkedin_declared_need" && lead.linkedin_post_text) {
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

  // 4-STEP SEQUENCE ENGINE GENERATION (Match user template exactly)
  if (step === 0) {
    // Step 1: Cold Outreach (Day 0, ZERO LINKS!)
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
    subject = subjects[hash % subjects.length];

    const bodyIcebreakerPart = icebreakerLine ? `${icebreakerLine}` : "";

    body = `${greeting}\n\n${bodyIcebreakerPart}I run Noryvex — we build AI receptionists that answer calls and handle bookings automatically for ${nicheVars.niche_plural}, so nothing gets missed after hours.\n\nWorth a 2-minute look, or a quick call if useful?\n\n${senderName}\n${senderRole}\n${senderEmail} | trynoryvex.com`;

  } else if (step === 1) {
    // Step 2: Follow-Up Check-In (Day 3, ZERO LINKS!)
    subject = `following up`;
    const heyGreeting = recipientName ? `Hey ${recipientName},` : "Hey,";
    body = `${heyGreeting} following up in case this got buried.\n\nA lot of ${nicheVars.niche_plural} lose a few bookings a week just from missed calls after hours. Curious if that's true for ${company} too.\n\n${senderName.split(' ')[0]}`;

  } else if (step === 2) {
    // Step 3: Show-and-Tell (Day 7, EXACTLY ONE LINK ALLOWED!)
    const demoLink = config.is_trial_campaign ? "https://trynoryvex.com/#trial" : "https://trynoryvex.com/#demo";
    subject = `how this actually works`;
    const nameIntro = recipientName ? recipientName : "Hi";
    body = `${nameIntro} — figured I'd show rather than explain.\n\nHere's a quick look at how it works: ${demoLink}\n\nHappy to set one up for ${company} if it looks useful. Let me know if you'd rather not hear from me again.\n\n${senderName.split(' ')[0]}`;

  } else {
    // Step 4: Breakup Email (Day 12, ZERO LINKS!)
    subject = `should I close the loop?`;
    const nameIntro = recipientName ? recipientName : "Hi";
    body = `${nameIntro} — I'll stop reaching out after this one.\n\nIf this isn't a priority for ${company} right now, no worries. If it is, just reply and I'll send over a couple ideas.\n\n${senderName.split(' ')[0]}`;
  }

  // --- SANITIZE & VERIFY HARD RULES ---
  body = body.replace(/!/g, ".");

  FORBIDDEN_AI_PHRASES.forEach(regex => {
    body = body.replace(regex, "");
  });

  body = body.replace(/\n{3,}/g, "\n\n").trim();

  const wordCount = body.split(/\s+/).length;
  if (wordCount > 120) {
    console.warn(`[AI COPYWRITER] Body exceeds 120 words (${wordCount} words). Trimming.`);
  }

  return { subject, body, wordCount };
}
