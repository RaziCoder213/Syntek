function determineSourceTier(lead) {
  const src = (lead.source || "scraper_enriched").toLowerCase().trim();
  if (src === "inbound") return 5;
  if (src === "linkedin_declared_need" || src === "referral") return 4;
  if (src === "scraper_unverified") return 1;
  return 3; // default: scraper_enriched
}

function calculateLeadTierAndScore(lead) {
  const tier = determineSourceTier(lead);
  
  if (tier >= 4) {
    return { tier, score: 100, shouldQueue: true, statusReason: "High Intent Source Tier" };
  }

  const status = (lead.status || "").toLowerCase();
  const stage = (lead.pipeline_stage || "").toLowerCase();
  if (status === "unsubscribed" || status === "bounced" || status === "opt_out" || status === "trashed" || stage.includes("opt out")) {
    return { tier, score: -1000, shouldQueue: false, statusReason: "Excluded (Unsubscribed/Bounced/Opt-out)" };
  }
  if (lead.is_competitor === true || (lead.type && lead.type.toLowerCase().includes("agency"))) {
    return { tier, score: -1000, shouldQueue: false, statusReason: "Excluded (Competitor Agency)" };
  }

  let score = 0;

  if (lead.has_booking_widget === false) score += 25;
  if (lead.has_chat_widget === false) score += 10;
  if (lead.contact_method === "phone_only") score += 15;

  const reviews = parseInt(lead.reviews || 0, 10);
  if (reviews >= 20) score += 15;
  if (reviews >= 50) score += 5;

  const reviewDays = parseInt(lead.last_review_days || 30, 10);
  if (reviewDays <= 90) score += 15;
  if (reviewDays <= 30) score += 5;

  if (lead.email_confirmed === true || (lead.email && lead.email.includes("@"))) {
    score += 10;
  } else {
    score -= 50;
  }
  if (lead.owner_name && lead.owner_name.trim().length > 2) {
    score += 10;
  }

  if (lead.type || lead.name) {
    score += 10;
  }

  let shouldQueue = false;
  if (tier === 3 && score >= 40) shouldQueue = true;
  if (tier === 1 && score >= 55) shouldQueue = true;

  return { tier, score, shouldQueue, statusReason: shouldQueue ? "Passed Tier & Score Gate" : "Needs Review / Low Quality" };
}

console.log('================ LEAD TIER & SCORING ALGORITHM TEST ================');

const testLeads = [
  { name: 'Inbound Lead', source: 'inbound', email: 'inbound@client.com' },
  { name: 'LinkedIn Declared Need', source: 'linkedin_declared_need', email: 'prospect@co.com' },
  { name: 'High Quality Scraped Dental Clinic', source: 'scraper_enriched', has_booking_widget: false, reviews: 65, last_review_days: 15, email: 'info@highqualitydental.com', owner_name: 'Dr. Smith', type: 'Dental Clinic' },
  { name: 'Low Quality Scraped Lead (No Gap)', source: 'scraper_enriched', has_booking_widget: true, reviews: 5, last_review_days: 120, email: 'contact@smallbiz.com', type: 'Cafe' },
  { name: 'Unverified Scraped Lead (High Score Required)', source: 'scraper_unverified', has_booking_widget: false, reviews: 55, last_review_days: 10, email: 'hello@unverified.com', owner_name: 'John Doe', type: 'Clinic' },
  { name: 'Excluded Competitor Agency', source: 'scraper_enriched', type: 'Marketing Agency', is_competitor: true, email: 'sales@agency.com' },
  { name: 'Excluded Unsubscribed Lead', source: 'scraper_enriched', status: 'unsubscribed', email: 'optout@business.com' }
];

for (const l of testLeads) {
  const res = calculateLeadTierAndScore(l);
  console.log(`\nLead: ${l.name}`);
  console.log(`- Source: ${l.source || 'scraper_enriched'} | Tier: ${res.tier}`);
  console.log(`- Score: ${res.score} | Auto-Queue: ${res.shouldQueue ? '✅ YES' : '❌ NO'}`);
  console.log(`- Decision Reason: ${res.statusReason}`);
}
