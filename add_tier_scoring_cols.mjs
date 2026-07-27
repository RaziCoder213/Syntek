import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== ADDING LEAD TIER & SCORING COLUMNS TO DATABASE ===');

await pool.query(`
  ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'scraper_enriched',
  ADD COLUMN IF NOT EXISTS tier INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS qualification_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_booking_widget BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_chat_widget BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_method VARCHAR(50) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_competitor BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_review_days INT DEFAULT 30;
`);

console.log('✓ Database columns (source, tier, qualification_score, has_booking_widget, has_chat_widget, contact_method, email_confirmed, is_competitor, last_review_days) verified!');

await pool.end();
