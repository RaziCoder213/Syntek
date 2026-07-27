import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const s = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = s.rows[0] || {};

const sampleLead = {
  name: 'TRU Dentistry Austin',
  city: 'Austin, TX',
  owner_name: 'Dr. Torres',
  personalized_icebreaker: 'Loved reading your 4.9-star patient reviews in Austin.'
};

async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || 'Muhammad Razi';
  const portfolioUrl = config.portfolio_url || 'trynoryvex.com';

  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : '';
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';

  let icebreaker = lead.personalized_icebreaker;
  if (!icebreaker || icebreaker.length < 5) {
    icebreaker = `Noticed ${lead.name} has a great local presence in ${lead.city || 'your area'}.`;
  }

  const offerShort = 'a custom AI booking assistant to handle client requests 24/7';
  const subject = `Quick question for ${lead.name}`;
  const body = `${greeting}\n\n${icebreaker}\n\nI build ${offerShort} without adding to front-desk workload.\n\nTook me a minute to sketch how it would look for ${lead.name}. Open to a 2-minute preview?\n\nBest,\n${senderName}${portfolioUrl ? `\n${portfolioUrl}` : ''}`;

  return { subject, body };
}

const out = await generateDeveloperOutreach(sampleLead, config);
console.log('--- TEST EMAIL GENERATION OUTPUT ---');
console.log('SUBJECT:', out.subject);
console.log('BODY:\n', out.body);

await pool.end();
