import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verifySchema() {
  const sql = `
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_tier INT DEFAULT 1;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'scraper_unverified';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_competitor_agency BOOLEAN DEFAULT false;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS sequence_step INT DEFAULT 0;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMP;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS raw_lead_id INT;

    ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS company_address VARCHAR(255) DEFAULT '100 Congress Ave, Austin, TX 78701';

    CREATE TABLE IF NOT EXISTS raw_leads (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      source VARCHAR(50) DEFAULT 'google_maps',
      name VARCHAR(255),
      address TEXT,
      phone VARCHAR(100),
      website TEXT,
      category VARCHAR(100),
      rating NUMERIC(3,1),
      reviews INT,
      source_url TEXT,
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      enrichment_status VARCHAR(50) DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS trial_requests (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      business_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(100),
      niche VARCHAR(100),
      agent_scope VARCHAR(100) DEFAULT 'both',
      trial_status VARCHAR(50) DEFAULT 'requested',
      vapi_call_minutes INT DEFAULT 0,
      twilio_number VARCHAR(50),
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      activated_at TIMESTAMP,
      expires_at TIMESTAMP
    );
  `;
  await pool.query(sql);

  const leadsCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('source_tier', 'source_type', 'is_competitor_agency', 'sequence_step', 'last_contacted_at', 'next_followup_at') ORDER BY column_name");
  const rawLeadsCheck = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'raw_leads')");
  const trialReqsCheck = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trial_requests')");

  console.log('=== LEADS TABLE COLUMNS VERIFIED IN SUPABASE ===');
  console.table(leadsCols.rows);
  console.log('raw_leads table exists:', rawLeadsCheck.rows[0].exists);
  console.log('trial_requests table exists:', trialReqsCheck.rows[0].exists);

  await pool.end();
}

verifySchema().catch(err => { console.error(err); process.exit(1); });
