with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

tier_scoring_code = """
// ── Lead Source Tier & Scoring Engine ──
function determineSourceTier(lead) {
  const src = (lead.source || "scraper_enriched").toLowerCase().trim();
  if (src === "inbound") return 5;
  if (src === "linkedin_declared_need" || src === "referral") return 4;
  if (src === "scraper_unverified") return 1;
  return 3; // default: scraper_enriched
}

function calculateLeadTierAndScore(lead) {
  const tier = determineSourceTier(lead);
  
  // Tier 4 & Tier 5 skip scoring gate and auto-queue directly into campaign
  if (tier >= 4) {
    return { tier, score: 100, shouldQueue: true, statusReason: "High Intent Source Tier" };
  }

  // Hard exclusions
  const status = (lead.status || "").toLowerCase();
  const stage = (lead.pipeline_stage || "").toLowerCase();
  if (status === "unsubscribed" || status === "bounced" || status === "opt_out" || status === "trashed" || stage.includes("opt out")) {
    return { tier, score: -1000, shouldQueue: false, statusReason: "Excluded (Unsubscribed/Bounced/Opt-out)" };
  }
  if (lead.is_competitor === true || (lead.type && lead.type.toLowerCase().includes("agency"))) {
    return { tier, score: -1000, shouldQueue: false, statusReason: "Excluded (Competitor Agency)" };
  }

  let score = 0;

  // 1. Verified Operational Gap
  if (lead.has_booking_widget === false) score += 25;
  if (lead.has_chat_widget === false) score += 10;
  if (lead.contact_method === "phone_only") score += 15;

  // 2. Business Health & Establishment Signals
  const reviews = parseInt(lead.reviews || 0, 10);
  if (reviews >= 20) score += 15;
  if (reviews >= 50) score += 5; // stacks to +20 total

  const reviewDays = parseInt(lead.last_review_days || 30, 10);
  if (reviewDays <= 90) score += 15;
  if (reviewDays <= 30) score += 5; // stacks to +20 total

  // 3. Reachability
  if (lead.email_confirmed === true || (lead.email && lead.email.includes("@"))) {
    score += 10;
  } else {
    score -= 50;
  }
  if (lead.owner_name && lead.owner_name.trim().length > 2) {
    score += 10;
  }

  // 4. Fit
  if (lead.type || lead.name) {
    score += 10;
  }

  // Queue Thresholds
  let shouldQueue = false;
  if (tier === 3 && score >= 40) shouldQueue = true;
  if (tier === 1 && score >= 55) shouldQueue = true;

  return { tier, score, shouldQueue, statusReason: shouldQueue ? "Passed Tier & Score Gate" : "Needs Review / Low Quality" };
}
"""

pos_app = content.find("const app = express();")
if pos_app != -1 and "function calculateLeadTierAndScore" not in content:
    content = content[:pos_app] + tier_scoring_code + "\n\n" + content[pos_app:]
    print("SUCCESS: Inserted calculateLeadTierAndScore engine into server.js")

old_campaign_query = "SELECT * FROM leads WHERE user_id = $1 AND status = 'not contacted' AND email IS NOT NULL AND email != '' ORDER BY id ASC LIMIT 10"
new_campaign_query = "SELECT * FROM leads WHERE user_id = $1 AND status = 'not contacted' AND email IS NOT NULL AND email != '' AND (qualification_score >= 40 OR tier >= 4) ORDER BY tier DESC, qualification_score DESC, id ASC LIMIT 10"

if old_campaign_query in content:
    content = content.replace(old_campaign_query, new_campaign_query)
    print("SUCCESS: Updated Campaign Runner query to prioritize Tier 4/5 & Score >= 40")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
