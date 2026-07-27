import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function determineSourceTier(lead) {
  const src = (lead.source || "scraper_enriched").toLowerCase().trim();
  if (src === "inbound") return 5;
  if (src === "linkedin_declared_need" || src === "referral") return 4;
  if (src === "scraper_unverified") return 1;
  return 3;
}

function calculateLeadTierAndScore(lead) {
  const tier = determineSourceTier(lead);
  if (tier >= 4) return { tier, score: 100 };

  const status = (lead.status || "").toLowerCase();
  if (status === "unsubscribed" || status === "bounced" || status === "opt_out" || status === "trashed") {
    return { tier, score: -1000 };
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

  return { tier, score };
}

const leadsRes = await pool.query('SELECT * FROM leads WHERE user_id = 19');
console.log(`Backfilling tier and qualification_score for ${leadsRes.rowCount} leads...`);

for (const l of leadsRes.rows) {
  const { tier, score } = calculateLeadTierAndScore(l);
  await pool.query(
    'UPDATE leads SET tier = $1, qualification_score = $2 WHERE id = $3',
    [tier, score, l.id]
  );
  console.log(`Updated lead "${l.name}" (ID ${l.id}) -> Tier: ${tier}, Score: ${score}`);
}

console.log('✓ Backfill completed successfully!');
await pool.end();
