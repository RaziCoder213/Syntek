import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await pool.query(`
  ALTER TABLE campaign_settings 
  ADD COLUMN IF NOT EXISTS daily_limit INT DEFAULT 10;

  UPDATE campaign_settings SET daily_limit = 10 WHERE user_id = 19;
`);

console.log('✓ Added daily_limit column to campaign_settings table (Set to 10 emails/day for User 19)');
await pool.end();
