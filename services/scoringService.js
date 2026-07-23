import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function calculateQualityScore(lead, userId) {
  let score = 0;
  const breakdown = [];

  // 1. Booking widget check (real gap)
  if (lead.has_booking_widget === "false") {
    score += 25;
    breakdown.push({ rule: "No booking widget found (+25)", points: 25 });
  } else if (lead.has_booking_widget === "unknown") {
    score += 0;
    breakdown.push({ rule: "Booking widget status unknown (+0)", points: 0 });
  }

  // 2. Chat widget check
  if (lead.chat_widget === "false") {
    score += 10;
    breakdown.push({ rule: "No chat widget found (+10)", points: 10 });
  }

  // 3. Review count check
  const reviewCount = parseInt(lead.reviews || 0, 10);
  if (reviewCount >= 20) {
    score += 15;
    breakdown.push({ rule: `High review count: ${reviewCount} >= 20 (+15)`, points: 15 });
  }

  // 4. Review recency check (last 90 days)
  if (lead.most_recent_review_at) {
    const reviewDate = new Date(lead.most_recent_review_at);
    const diffTime = Math.abs(new Date() - reviewDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 90) {
      score += 15;
      breakdown.push({ rule: `Most recent review within ${diffDays} days <= 90 (+15)`, points: 15 });
    }
  }

  // 5. Contact method check
  if (lead.contact_method === "phone_only") {
    score += 15;
    breakdown.push({ rule: "Contact method is phone only (+15)", points: 15 });
  }

  // 6. Owner name check
  if (lead.owner_name) {
    score += 10;
    breakdown.push({ rule: `Owner name found: "${lead.owner_name}" (+10)`, points: 10 });
  }

  // 7. Already contacted in last 90 days check
  if (lead.email) {
    try {
      const contactedCheck = await pool.query(
        `SELECT id, contacted_at FROM leads 
         WHERE user_id = $1 
           AND LOWER(email) = LOWER($2) 
           AND contacted_at IS NOT NULL 
           AND contacted_at >= NOW() - INTERVAL '90 days'
         LIMIT 1`,
        [userId, lead.email]
      );
      if (contactedCheck.rowCount > 0) {
        score -= 100;
        breakdown.push({ rule: "Already contacted in the last 90 days (-100)", points: -100 });
      }
    } catch (err) {
      console.error("[SCORER ERROR] Contacted check failed:", err.message);
    }
  }

  // 8. Email confirmed check
  if (lead.email_confirmed === false) {
    score -= 50;
    breakdown.push({ rule: "Email unconfirmed/invalid format (-50)", points: -50 });
  }

  return {
    score,
    breakdown,
    isLowQuality: score < 40
  };
}
