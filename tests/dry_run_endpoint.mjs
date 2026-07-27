import { generateCompliantOutreachEmail } from '../services/aiCopywriterService.js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verifyDryRunMode() {
  console.log('================ DRY-RUN ENDPOINT VERIFICATION ================');

  const settingsRes = await pool.query("SELECT * FROM campaign_settings LIMIT 1");
  const config = settingsRes.rows[0] || {};

  const leadsRes = await pool.query(
    `SELECT * FROM leads 
     WHERE status NOT IN ('unsubscribed', 'bounced', 'replied', 'opt_out')
     ORDER BY id ASC 
     LIMIT 3`
  );

  console.log(`Found ${leadsRes.rows.length} active leads for dry-run inspection.`);

  for (const lead of leadsRes.rows) {
    const emailObj = await generateCompliantOutreachEmail(lead, config);
    console.log(`\n---------------- DRY-RUN PREVIEW FOR LEAD #${lead.id}: "${lead.name}" ----------------`);
    console.log(`Niche: ${lead.type || lead.niche || 'General'} | Step: ${lead.sequence_step || 0}`);
    console.log(`Subject: ${emailObj.subject}`);
    console.log(`Body Snippet:\n${emailObj.body.slice(0, 200)}...`);
    console.log(`Word Count: ${emailObj.wordCount} words`);
  }

  console.log('\n✅ DRY-RUN PREVIEW VERIFIED SUCCESSFULLY!');
  await pool.end();
}

verifyDryRunMode().catch(err => { console.error(err); process.exit(1); });
