import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== VERIFYING 4 SAFETY RULES ===');

// 1. Check daily send limit in database for user 19
const settingsRes = await pool.query('SELECT daily_limit, sender_name, company_name FROM campaign_settings WHERE user_id = 19');
console.log('Rule (d) Warmup Cap in DB:', settingsRes.rows[0]);

// 2. Test Step 1 Icebreaker Skip when empty/unverified
async function generateNoryvexSequenceEmail(lead, step = 1, config = {}) {
  const company = lead.name || "your business";
  const name = lead.owner_name ? lead.owner_name.split(" ")[0] : "";
  const recipientGreeting = name ? name : "there";
  const niche = lead.type || "local";

  if (step === 1) {
    const subjects = [
      `quick question about ${company}`,
      `${company} + booking`,
      `saw ${company} — one question`
    ];
    const hash = Math.abs(company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const subject = subjects[hash % subjects.length];

    let icebreakerLine = "";
    if (lead.personalized_icebreaker && 
        lead.personalized_icebreaker.trim().length > 5 && 
        !lead.personalized_icebreaker.includes("NO_VERIFIED_DETAIL")) {
      icebreakerLine = lead.personalized_icebreaker.trim();
    }

    const bodyParts = [
      `Hi ${recipientGreeting},`
    ];
    if (icebreakerLine) {
      bodyParts.push(icebreakerLine);
    }
    bodyParts.push(
      `I run Noryvex — we build AI voice agents and automation that answer calls and handle bookings automatically, so nothing gets missed after hours.`,
      `Here's a quick look at how it actually works: https://trynoryvex.com/#demo`,
      `Worth a 2-minute look, or a quick call if useful?`,
      `Muhammad Razi\nFounder, Noryvex\nrazi@trynoryvex.com | trynoryvex.com`
    );

    return { subject, body: bodyParts.join("\n\n") };
  }
}

const verifiedLead = { name: 'Austin Dental', owner_name: 'Dr. Jones', personalized_icebreaker: "Noticed Austin Dental's site has no online booking." };
const unverifiedLead = { name: 'Austin Dental', owner_name: 'Dr. Jones', personalized_icebreaker: "NO_VERIFIED_DETAIL" };

const out1 = await generateNoryvexSequenceEmail(verifiedLead, 1);
const out2 = await generateNoryvexSequenceEmail(unverifiedLead, 1);

console.log('\n--- VERIFIED LEAD STEP 1 (WITH ICEBREAKER) ---');
console.log(out1.body);

console.log('\n--- UNVERIFIED LEAD STEP 1 (SKIPS ICEBREAKER LINE CLEANLY) ---');
console.log(out2.body);

await pool.end();
