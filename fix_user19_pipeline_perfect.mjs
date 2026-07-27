import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== SYNCHRONIZING USER 19 PIPELINE & STAGES ===');

// 1. Get all emails that exist in the `emails` table for user 19
const sentEmailsRes = await pool.query(
  `SELECT DISTINCT LOWER(from_email) as email FROM emails WHERE user_id = 19 AND from_email IS NOT NULL AND from_email != ''`
);
const sentEmails = sentEmailsRes.rows.map(r => r.email);

console.log(`Found ${sentEmails.length} unique lead emails with sent message records.`);

// Update all leads matching sent emails to status 'contacted' and pipeline_stage 'Contacted'
const r1 = await pool.query(
  `UPDATE leads 
   SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = COALESCE(contacted_at, NOW())
   WHERE user_id = 19 AND LOWER(email) = ANY($1::text[])`,
  [sentEmails]
);
console.log(`✅ Updated ${r1.rowCount} leads to status='contacted' & pipeline_stage='Contacted' based on sent email logs.`);

// 2. Set default pipeline_stage for remaining null pipeline_stages based on status
const r2 = await pool.query(`
  UPDATE leads 
  SET pipeline_stage = CASE 
    WHEN status = 'not contacted' THEN 'New'
    WHEN status = 'contacted' THEN 'Contacted'
    WHEN status = 'no_email' THEN 'Re-research'
    WHEN status = 'replied' THEN 'Replied'
    WHEN status = 'won' THEN 'Won'
    WHEN status = 'trashed' THEN 'Archived'
    ELSE 'New'
  END
  WHERE user_id = 19 AND (pipeline_stage IS NULL OR pipeline_stage = '')
`);
console.log(`✅ Populated ${r2.rowCount} leads with explicit pipeline_stage matching their status.`);

// 3. Final summary breakdown
const summary = await pool.query(
  `SELECT status, pipeline_stage, COUNT(*) FROM leads WHERE user_id = 19 GROUP BY status, pipeline_stage ORDER BY count DESC`
);
console.log('\n--- FINAL PIPELINE BREAKDOWN FOR USER 19 ---');
console.table(summary.rows);

await pool.end();
