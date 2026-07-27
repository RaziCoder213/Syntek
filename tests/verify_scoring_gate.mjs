import pg from 'pg';
import dotenv from 'dotenv';
import { calculateLeadTierAndScore } from '../services/scoringService.js';

dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verifyScoringGate() {
  console.log('================ SECTION 4: SCORING & QUALIFICATION GATING ================');

  const leadsRes = await pool.query("SELECT id, name, type, status, source_tier, source_type, qualification_score, is_competitor_agency, has_booking_widget, reviews FROM leads");
  
  let autoQueuedCount = 0;
  let needsReviewCount = 0;
  let hardExcludedCount = 0;
  let competitorCount = 0;

  for (const lead of leadsRes.rows) {
    const res = calculateLeadTierAndScore(lead);
    if (res.isCompetitor) {
      competitorCount++;
      hardExcludedCount++;
    } else if (res.shouldQueue) {
      autoQueuedCount++;
    } else if (res.score === -1000) {
      hardExcludedCount++;
    } else {
      needsReviewCount++;
    }
  }

  console.log(`Total Leads in Database: ${leadsRes.rows.length}`);
  console.log(`Auto-Queued (Qualified Tier 4/5 or Tier 3 Score >= 40): ${autoQueuedCount}`);
  console.log(`Needs Review (Tier 3 Score < 40 or Tier 1 Score < 55): ${needsReviewCount}`);
  console.log(`Hard Excluded (Unsubscribed / Bounced / Contacted < 90d): ${hardExcludedCount}`);
  console.log(`Competitor Agencies Blocked (Score -1000): ${competitorCount}`);

  // Test Competitor Filter on mock agency lead
  const testAgencyLead = {
    name: "Apex AI Voice Agency",
    type: "AI Agency",
    is_competitor_agency: true
  };
  const compRes = calculateLeadTierAndScore(testAgencyLead);
  console.log(`\nCompetitor Agency Lead Test ("Apex AI Voice Agency"):`);
  console.log(`Is Competitor: ${compRes.isCompetitor} | Score: ${compRes.score} | Reason: ${compRes.statusReason}`);

  await pool.end();
}

verifyScoringGate().catch(err => { console.error(err); process.exit(1); });
