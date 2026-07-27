import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check active leads for User 19 ready for outreach
const leads = await pool.query(`
  SELECT id, name, email, city, status, sequence_step, qualification_score, tier 
  FROM leads 
  WHERE user_id = 19 
    AND status = 'not contacted' 
    AND email IS NOT NULL 
    AND email != '' 
  ORDER BY tier DESC, qualification_score DESC, id ASC 
  LIMIT 5
`);

console.log('=== USER 19 REAL LEADS READY FOR OUTREACH ===');
console.table(leads.rows);

// Check campaign settings
const settings = await pool.query('SELECT user_id, sender_name, sender_role, company_name, domain_name, daily_limit FROM campaign_settings WHERE user_id = 19');
console.log('=== CAMPAIGN SETTINGS FOR USER 19 ===');
console.table(settings.rows);

await pool.end();
