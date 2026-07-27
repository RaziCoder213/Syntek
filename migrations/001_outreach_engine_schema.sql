-- Syntek Outreach Engine Schema Migration 001
-- Adds Lead Sourcing Pipeline columns, Trial Requests table, and compliance tracking

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
  agent_scope VARCHAR(100) DEFAULT 'both', -- 'faqs' | 'bookings' | 'both'
  trial_status VARCHAR(50) DEFAULT 'requested', -- 'requested' | 'active' | 'expired' | 'converted'
  vapi_call_minutes INT DEFAULT 0,
  twilio_number VARCHAR(50),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP,
  expires_at TIMESTAMP
);
