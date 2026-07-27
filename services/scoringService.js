/**
 * Syntek Lead Quality Scoring Engine (Section 2c & 2d)
 */

export function determineSourceTier(lead) {
  const src = (lead.source_type || lead.source || "scraper_enriched").toLowerCase().trim();
  if (src === "inbound") return 5;
  if (src === "linkedin_declared_need" || src === "referral") return 4;
  if (src === "scraper_unverified") return 1;
  return 3; // default: scraper_enriched
}

export function checkIsCompetitorAgency(lead) {
  if (lead.is_competitor_agency === true) return true;

  const checkText = [
    lead.name,
    lead.category,
    lead.type,
    lead.linkedin_headline,
    lead.website_text,
    lead.about_text
  ].filter(Boolean).join(" ").toLowerCase();

  const competitorTerms = [
    "ai agency",
    "automation agency",
    "we build ai",
    "we provide ai",
    "voice ai solutions",
    "ai voice agency",
    "marketing agency",
    "digital agency"
  ];

  return competitorTerms.some(term => checkText.includes(term));
}

export function calculateLeadTierAndScore(lead) {
  const tier = determineSourceTier(lead);
  const isCompetitor = checkIsCompetitorAgency(lead);

  // Hard exclusion 1: Competitor Agency
  if (isCompetitor) {
    return {
      tier,
      score: -1000,
      shouldQueue: false,
      isCompetitor: true,
      statusReason: "Hard Excluded (Competitor Agency)"
    };
  }

  // Hard exclusion 2: Unsubscribed, Bounced, Opt-Out, or Replied
  const status = (lead.status || "").toLowerCase();
  const stage = (lead.pipeline_stage || "").toLowerCase();
  if (
    status === "unsubscribed" ||
    status === "bounced" ||
    status === "replied" ||
    status === "opt_out" ||
    status === "trashed" ||
    stage.includes("opt out") ||
    stage.includes("replied")
  ) {
    return {
      tier,
      score: -1000,
      shouldQueue: false,
      isCompetitor: false,
      statusReason: `Hard Excluded (${status === "replied" ? "Replied Lead" : "Unsubscribed / Bounced"})`
    };
  }

  if (lead.last_contacted_at) {
    const daysSinceContact = (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 3600 * 24);
    if (daysSinceContact < 90) {
      return {
        tier,
        score: -1000,
        shouldQueue: false,
        isCompetitor: false,
        statusReason: "Hard Excluded (Contacted within last 90 days)"
      };
    }
  }

  // Tier 4 & Tier 5 skip scoring gate and auto-queue directly
  if (tier >= 4) {
    return {
      tier,
      score: 100,
      shouldQueue: true,
      isCompetitor: false,
      statusReason: "High Intent Source Tier (Auto-Queued)"
    };
  }

  let score = 0;

  // 1. Verified Operational Gap
  const hasBooking = lead.has_booking_widget;
  if (hasBooking === false || hasBooking === "false") {
    score += 25;
  }
  const chatWidget = lead.chat_widget;
  if (chatWidget === false || chatWidget === "false") {
    score += 10;
  }
  if (lead.contact_method === "phone_only") {
    score += 15;
  }

  // 2. Business Health & Establishment Signals
  const reviews = parseInt(lead.reviews || lead.review_count || 0, 10);
  if (reviews >= 20) score += 15;
  if (reviews >= 50) score += 5; // stacks to +20 total

  const reviewDays = parseInt(lead.last_review_days || 30, 10);
  if (reviewDays <= 90) score += 15;
  if (reviewDays <= 30) score += 5; // stacks to +20 total

  // 3. Reachability
  if (lead.email_confirmed === true || (lead.email && lead.email.includes("@"))) {
    score += 10;
  } else {
    score -= 50; // Do not send to unconfirmed/guessed emails
  }

  if (lead.owner_name && lead.owner_name.trim().length > 2) {
    score += 10;
  }

  // 4. Fit
  if (lead.niche_matches_target_list === true || lead.type || lead.name) {
    score += 10;
  }

  // Queue Thresholds
  let shouldQueue = false;
  if (tier === 3 && score >= 40) shouldQueue = true;
  if (tier === 1 && score >= 55) shouldQueue = true;

  return {
    tier,
    score,
    shouldQueue,
    isCompetitor: false,
    statusReason: shouldQueue ? "Passed Tier & Score Gate" : "Needs Review / Low Quality"
  };
}

// Alias export for backward compatibility with pipelineService.js
export function calculateQualityScore(lead) {
  const res = calculateLeadTierAndScore(lead);
  return {
    score: res.score,
    tier: res.tier,
    passed: res.shouldQueue,
    isCompetitor: res.isCompetitor,
    reason: res.statusReason
  };
}
