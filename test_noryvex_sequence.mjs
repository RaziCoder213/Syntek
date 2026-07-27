import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const s = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = s.rows[0] || {};

const sampleLead = {
  name: 'Austin Family Dental',
  type: 'Dental Clinic',
  city: 'Austin, TX',
  owner_name: 'Dr. Sarah Smith',
  personalized_icebreaker: "Noticed Austin Family Dental's site doesn't have online booking set up."
};

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
    if (lead.personalized_icebreaker && lead.personalized_icebreaker.length > 5) {
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
  } else if (step === 2) {
    return {
      subject: "following up",
      body: `Hey ${recipientGreeting}, following up in case this got buried.\n\nA lot of ${niche} businesses lose a few bookings a week just from missed calls after hours. Curious if that's true for ${company} too.\n\nMuhammad`
    };
  } else if (step === 3) {
    return {
      subject: "how this actually works",
      body: `${recipientGreeting ? recipientGreeting : company} — figured I'd show rather than explain.\n\nHere's the 90-second demo: https://trynoryvex.com/#demo\n\nHappy to set one up for ${company} if it looks useful. Let me know if you'd rather not hear from me again.\n\nMuhammad`
    };
  } else if (step === 4) {
    return {
      subject: "should I close the loop?",
      body: `${recipientGreeting ? recipientGreeting : company} — I'll stop reaching out after this one.\n\nIf this isn't a priority for ${company} right now, no worries. If it is, just reply and I'll send over a couple ideas.\n\nMuhammad`
    };
  }

  return { subject: `quick question about ${company}`, body: `Hi ${recipientGreeting},\n\nFollowing up regarding ${company}.\n\nBest,\nMuhammad` };
}

console.log('================ NORYVEX 4-STEP SEQUENCE DEMO ================');

for (let step = 1; step <= 4; step++) {
  const email = await generateNoryvexSequenceEmail(sampleLead, step, config);
  console.log(`\n--- STEP ${step} ---`);
  console.log(`SUBJECT: ${email.subject}`);
  console.log(`BODY:\n${email.body}`);
}

await pool.end();
