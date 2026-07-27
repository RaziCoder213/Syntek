import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== EXECUTING COMPLETE NORYVEX ACCOUNT RESET (USER 19) ===');

// 1. Ensure leads table has sequence tracking columns
await pool.query(`
  ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS sequence_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMP WITH TIME ZONE;
`);
console.log('✓ Verified database columns sequence_step, last_contacted_at, next_followup_at');

// 2. Wipe leads for user 19
const delLeads = await pool.query('DELETE FROM leads WHERE user_id = 19');
console.log(`✓ Wiped ${delLeads.rowCount} leads for User 19`);

// 3. Wipe emails for user 19
const delEmails = await pool.query('DELETE FROM emails WHERE user_id = 19');
console.log(`✓ Wiped ${delEmails.rowCount} emails for User 19`);

// 4. Update campaign_settings for User 19 to Noryvex
const settingsCheck = await pool.query('SELECT id FROM campaign_settings WHERE user_id = 19');
if (settingsCheck.rowCount === 0) {
  await pool.query(`
    INSERT INTO campaign_settings (user_id, company_name, sender_name, sender_role, portfolio_url, gmail_user, social_linkedin)
    VALUES (19, 'Noryvex', 'Muhammad Razi', 'Founder, Noryvex — AI Voice Agents & Business Automation', 'trynoryvex.com', 'hello@trynoryvex.com', 'https://linkedin.com/in/mrazi-dev')
  `);
} else {
  await pool.query(`
    UPDATE campaign_settings 
    SET company_name = 'Noryvex',
        sender_name = 'Muhammad Razi',
        sender_role = 'Founder, Noryvex — AI Voice Agents & Business Automation',
        portfolio_url = 'trynoryvex.com',
        gmail_user = 'hello@trynoryvex.com',
        social_linkedin = 'https://linkedin.com/in/mrazi-dev'
    WHERE user_id = 19
  `);
}
console.log('✓ Configured campaign_settings for Noryvex (Muhammad Razi, Founder)');

await pool.end();
