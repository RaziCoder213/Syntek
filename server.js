/* eslint-disable */
process.env.UV_THREADPOOL_SIZE = "64";
import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dns from "dns";
import { spawn } from "child_process";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { runScraperPipeline } from "./services/pipelineService.js";

dotenv.config();

// Append Antigravity CLI path to process.env.PATH
if (process.env.USERPROFILE) {
  const agyBinPath = path.join(process.env.USERPROFILE, "AppData", "Local", "agy", "bin");
  process.env.PATH = `${agyBinPath}${path.delimiter}${process.env.PATH}`;
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Global DNS lookup override using async c-ares Resolver to prevent thread pool exhaustion and EAI_AGAIN on Windows
const originalLookup = dns.lookup;
const customResolver = new dns.promises.Resolver();
try {
  customResolver.setServers(["1.1.1.1", "8.8.8.8"]);
} catch (e) {
  console.warn("Failed to set custom DNS servers:", e.message);
}

dns.lookup = function(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const all = options && options.all;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return originalLookup(hostname, options, callback);
  }
  customResolver.resolve4(hostname)
    .then((addresses) => {
      if (addresses && addresses.length > 0) {
        if (all) {
          const results = addresses.map(addr => ({ address: addr, family: 4 }));
          callback(null, results);
        } else {
          callback(null, addresses[0], 4);
        }
      } else {
        originalLookup(hostname, options, callback);
      }
    })
    .catch(() => {
      originalLookup(hostname, options, callback);
    });
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5000;

const allowedOrigin = process.env.FRONTEND_URL || "*";
app.use(cors({
  origin: allowedOrigin === "*" ? true : allowedOrigin,
  credentials: true
}));
app.use(express.json());

// In-Memory API Rate Limiter to protect endpoints
const ipRequests = new Map();

// In-Memory stop signals for automation runs: Map<jobId, boolean>
const activeAutomationRuns = new Map();

function rateLimiter(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    
    // Bypass localhost/loopback IPs to avoid blocking local dev sessions
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
      return next();
    }
    
    if (req.headers["x-bypass-rate-limit"] === "true" || 
        req.path.includes("/scan/status/") || 
        req.path.includes("/send-email") || 
        req.path.includes("/emails/")) {
      return next();
    }
    const now = Date.now();
    
    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, []);
    }
    
    const requestTimes = ipRequests.get(ip);
    const activeRequests = requestTimes.filter(time => now - time < windowMs);
    
    if (activeRequests.length >= limit) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    
    activeRequests.push(now);
    ipRequests.set(ip, activeRequests);
    next();
  };
}

const globalRateLimit = rateLimiter(1000, 15 * 60 * 1000); // 1000 requests per 15 minutes per IP
app.use("/api/", globalRateLimit);

//  Database: Supabase ONLY via DATABASE_URL 
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set. This app requires Supabase. Set DATABASE_URL in your .env file.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Supabase pooler-safe settings  prevents ECONNRESET crashes
  max: 20,                   // Stay well within Supabase connection limits while preventing pool starvation
  idleTimeoutMillis: 30000,  // Release idle clients after 30s (before Supabase drops them)
  connectionTimeoutMillis: 15000, // Wait up to 15s to prevent timeouts under load
  keepAlive: true,           // Detect dead sockets early
  keepAliveInitialDelayMillis: 10000,
});

// Swallow pool-level errors so a dropped connection never crashes the process
pool.on("error", (err) => {
  console.warn("[DB POOL] Idle client error (connection reset by Supabase pooler):", err.message);
});

// Initialize DB schema automatically (Supabase only)

try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (e) {}

async function validateEmailWithMx(email) {
  if (!email || typeof email !== "string") return { valid: false, reason: "Empty email" };
  const trimmed = email.trim().toLowerCase();
  const regex = /^[^s@]+@[^s@]+.[^s@]+$/;
  if (!regex.test(trimmed)) return { valid: false, reason: "Invalid email syntax" };

  const domain = trimmed.split("@")[1];
  const disposableDomains = ["mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com", "trashmail.com", "yopmail.com"];
  if (disposableDomains.includes(domain)) return { valid: false, reason: "Disposable email provider" };

  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: "Domain has no active MX records" };
    }
    return { valid: true, mx: mxRecords[0].exchange };
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { valid: false, reason: "Domain has no mail server" };
    }
    return { valid: true, mx: domain, note: "DNS fallback" };
  }
}

async function setupDatabase() {
  // Apply schema migrations directly to Supabase
  try {
    // Create users table first (required for references)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        city VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        rating NUMERIC(3,1),
        reviews INTEGER,
        status VARCHAR(50) DEFAULT 'not contacted',
        instagram VARCHAR(100),
        website VARCHAR(255) DEFAULT NULL,
        website_status VARCHAR(50) DEFAULT 'unknown'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        from_name VARCHAR(255) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        subject VARCHAR(255),
        preview TEXT,
        time_received TIMESTAMPTZ DEFAULT NOW(),
        is_read BOOLEAN DEFAULT FALSE,
        category VARCHAR(50) DEFAULT 'system',
        labels TEXT[] DEFAULT '{}'
      );
    `);

    // Run migrations to add missing columns if they don't exist
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_opened BOOLEAN DEFAULT FALSE;
    `);
    // Migrate time_received from VARCHAR to TIMESTAMPTZ (safe: only runs if still varchar type)
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'emails' AND column_name = 'time_received'
          AND data_type = 'character varying'
        ) THEN
          ALTER TABLE emails ALTER COLUMN time_received TYPE TIMESTAMPTZ
          USING CASE
            WHEN time_received ~ '^\d{4}-\d{2}-\d{2}' THEN time_received::TIMESTAMPTZ
            ELSE NOW()
          END;
          ALTER TABLE emails ALTER COLUMN time_received SET DEFAULT NOW();
        END IF;
      END$$;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMP DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    await pool.query(`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_message ON emails(user_id, message_id) WHERE message_id IS NOT NULL;
    `);
    // Safe deduplication: delete newer duplicate emails keeping only the first copy
    await pool.query(`
      DELETE FROM emails a USING emails b
      WHERE a.id > b.id
        AND a.user_id = b.user_id
        AND LOWER(a.from_email) = LOWER(b.from_email)
        AND a.subject = b.subject
        AND a.category = b.category;
    `);

    // Add user_id to leads and emails tables
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_settings (
        id SERIAL PRIMARY KEY,
        niche VARCHAR(100) DEFAULT 'Cafes',
        location VARCHAR(100) DEFAULT 'Austin, TX',
        daily_lead_limit INTEGER DEFAULT 8,
        preferred_time VARCHAR(50) DEFAULT '09:00',
        timezone VARCHAR(50) DEFAULT 'local',
        is_active BOOLEAN DEFAULT FALSE,
        concurrent_jobs INTEGER DEFAULT 1,
        gmail_user VARCHAR(255) DEFAULT '',
        gmail_pass VARCHAR(255) DEFAULT '',
        gemini_key VARCHAR(255) DEFAULT '',
        search_mode VARCHAR(50) DEFAULT 'scraper',
        schedule_type VARCHAR(50) DEFAULT 'custom'
      );
    `);

    // Add user_id and customization columns to campaign_settings
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_name VARCHAR(100) DEFAULT 'Muhammad Razi';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_role VARCHAR(100) DEFAULT 'Independent Developer';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS company_name VARCHAR(100) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS use_company_branding BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS outreach_style VARCHAR(50) DEFAULT 'casual';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS pitch_offer VARCHAR(50) DEFAULT 'whatsapp_bot';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS custom_offer_details TEXT DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(50) DEFAULT 'custom';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS last_cron_run_date VARCHAR(50) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_type VARCHAR(50) DEFAULT 'developer';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS about_text TEXT DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS portfolio_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_github VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_twitter VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS banner_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS profile_icon_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_connected BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_token_expiry BIGINT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_email VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_sandbox_mode BOOLEAN DEFAULT TRUE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS work_samples TEXT DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_location VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS required_contact VARCHAR(50) DEFAULT 'email_or_phone';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS autopilot_mode VARCHAR(50) DEFAULT 'both';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS re_research_enabled BOOLEAN DEFAULT TRUE;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_status VARCHAR(50) DEFAULT 'unknown';
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS facebook VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS twitter VARCHAR(100) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_role VARCHAR(100) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_contact VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_reason TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_score INTEGER DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(100) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS re_research_attempts INTEGER DEFAULT 0;
    `);

    // Migrations for AI Auto-Responder and Lead Enrichment
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalized_icebreaker TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;
    `);

    // Create templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        sender_type VARCHAR(50) DEFAULT 'all',
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(100),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create waitlist table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        company VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // SaaS billing subscription migrations
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'agency';
    `);
    await pool.query(`
      ALTER TABLE users ALTER COLUMN subscription_tier SET DEFAULT 'agency';
    `);
    await pool.query(`
      UPDATE users SET subscription_tier = 'agency' WHERE subscription_tier = 'free' OR subscription_tier IS NULL;
    `);
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
    `);

    // Persistent job queue migration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        job_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payload JSONB DEFAULT '{}',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        run_at TIMESTAMP NOT NULL,
        locked_at TIMESTAMP DEFAULT NULL,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stage_id VARCHAR(100) NOT NULL,
        label VARCHAR(255) NOT NULL,
        color VARCHAR(50) DEFAULT '#4f46e5',
        position INTEGER DEFAULT 0,
        value_multiplier INTEGER DEFAULT 100
      );
    `);

    // Alter users table to support admin accounts and user control
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS copilot_enabled BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_label VARCHAR(100) DEFAULT 'Free';`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT DEFAULT NULL;`);

    // Admin activity log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_activity_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        target_user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    //  Pipeline kanban order persistence 
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS kanban_order INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_escalation_reason TEXT DEFAULT NULL;`);

    //  Agent behavior toggles (per user) 
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS auto_rereserach_on_bounce BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS auto_rereserach_no_email BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS auto_detect_auto_reply BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS auto_reply_to_followup BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS ai_draft_replies_enabled BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS copilot_reply_mode VARCHAR(20) DEFAULT 'manual';`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS copilot_reply_all BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS escalate_cost BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS escalate_mockups BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS escalate_terms BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS auto_book_meetings BOOLEAN DEFAULT FALSE;`);

    //  Google Calendar OAuth 
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_calendar_access_token TEXT;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_calendar_calendar_id VARCHAR(255);`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_sheets_spreadsheet_id VARCHAR(255) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_sheets_sync_enabled BOOLEAN DEFAULT FALSE;`);

    //  Calendar event suggestions table 
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_event_suggestions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        lead_name VARCHAR(255),
        lead_email VARCHAR(255),
        title VARCHAR(255),
        description TEXT,
        escalation_reason TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create outboxes table for rotating senders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_outboxes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        password TEXT NOT NULL,
        daily_sent_limit INTEGER DEFAULT 50,
        daily_sent_count INTEGER DEFAULT 0,
        last_sent_at TIMESTAMP DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create campaign sequences table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_sequences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create steps for sequences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sequence_steps (
        id SERIAL PRIMARY KEY,
        sequence_id INTEGER REFERENCES campaign_sequences(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        delay_days INTEGER DEFAULT 3,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add sequence progress columns to leads table
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_sequence_id INTEGER REFERENCES campaign_sequences(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_sequence_step INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_sequence_run_at TIMESTAMP DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sequence_id INTEGER REFERENCES campaign_sequences(id) ON DELETE SET NULL;
    `);

    // Create password resets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create scans table for async background scanning status
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'running',
        progress NUMERIC DEFAULT 0,
        logs JSONB DEFAULT '[]',
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create lead_chat_messages table for lead-specific AI Chat history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_chat_messages (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lead_chat_messages_lead ON lead_chat_messages(lead_id);
    `);

    // Create copilot_chat_messages table for global AI Copilot chat history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS copilot_chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_copilot_chat_messages_user ON copilot_chat_messages(user_id);
    `);

    // Performance indexes to optimize query times
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_stages_user ON pipeline_stages(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_outboxes_user ON user_outboxes(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaign_sequences_user ON campaign_sequences(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_sequence ON leads(current_sequence_id, next_sequence_run_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_email_user ON leads(email, user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_category_user ON emails(category, user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaign_settings_user ON campaign_settings(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_queue_status_run ON job_queue(status, run_at);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        link VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);`);

    // Custom Kanban stages and Re-research attempts migrations
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS kanban_stages TEXT[] DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS re_research_attempts INTEGER DEFAULT 0;
    `);

    // Create pitch_templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pitch_templates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        version_name VARCHAR(100) NOT NULL,
        subject_template VARCHAR(255) NOT NULL,
        body_template TEXT NOT NULL,
        sent_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        open_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pitch_templates_user ON pitch_templates(user_id);`);

    // Add sent_pitch_id to leads
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sent_pitch_id INTEGER REFERENCES pitch_templates(id) ON DELETE SET NULL;
    `);

    // Pre-populate pitch_templates for existing users
    const allUsers = await pool.query("SELECT id FROM users");
    for (const u of allUsers.rows) {
      const countRes = await pool.query("SELECT COUNT(*)::integer FROM pitch_templates WHERE user_id = $1", [u.id]);
      if (countRes.rows[0].count === 0) {
        const defaults = [
          {
            name: "Version 1 (Favorite)",
            subject: "Quick question, {{FirstName}}",
            body: `Hi {{FirstName}},\n\nNot even sure if this makes sense to reach out.\n\nI was looking at {{BusinessName}} and noticed a few areas where AI automation could potentially save your team time and help capture more customers.\n\nI'm not trying to sell you anything over email.\n\nI just wanted to see if you'd be open to a quick conversation to find out whether it's even worth discussing.\n\nIf it isn't a fit, no worries at all.\n\n Muhammad`
          },
          {
            name: "Version 2 (Jeremy Miner Style)",
            subject: "{{BusinessName}}",
            body: `Hi {{FirstName}},\n\nHey, it's Muhammad.\n\nI was looking through {{BusinessName}} earlier today and had a quick question.\n\nI'm not even sure if we'd be a fit.\n\nI was curious who handles things like\n\n AI automation\n Customer follow-up\n Missed call handling\n Website improvements\n\nat your business?\n\nCould you point me in the right direction?\n\nThanks,\nMuhammad`
          },
          {
            name: "Version 3 (Website Audit)",
            subject: "Saw something on your website",
            body: `Hi {{FirstName}},\n\nI was checking out your website today.\n\nThere are a couple of things I noticed that might be costing you leads every month.\n\nNothing major, but definitely worth fixing.\n\nWould you be against me sending over a quick 2-minute audit video?\n\nNo pitch.\n\nJust a few ideas you can use whether we work together or not.\n\nMuhammad`
          },
          {
            name: "Version 4 (Pattern Interrupt)",
            subject: "Not sure if this is relevant",
            body: `Hi {{FirstName}},\n\nThis isn't another "we help businesses grow" email.\n\nI actually spent a few minutes looking at {{BusinessName}}.\n\nI found a couple of opportunities that could probably bring in more bookings without increasing your ad spend.\n\nNot saying we're the right fit.\n\nWould it be crazy if I sent over a short video showing exactly what I found?\n\nMuhammad`
          },
          {
            name: "Version 5 (AI Voice Agent)",
            subject: "Worth a quick look?",
            body: `Hi {{FirstName}},\n\nQuick question.\n\nHow many calls do you think your business misses after hours every week?\n\nMost businesses don't realize how many potential customers never leave a voicemail.\n\nWe've built an AI receptionist that answers calls 24/7, books appointments, answers common questions, and never puts customers on hold.\n\nNot sure if this would even make sense for {{BusinessName}}, but if you're curious, I'm happy to show you a quick demo.\n\nMuhammad`
          }
        ];
        for (const d of defaults) {
          await pool.query(
            `INSERT INTO pitch_templates (user_id, version_name, subject_template, body_template)
             VALUES ($1, $2, $3, $4)`,
            [u.id, d.name, d.subject, d.body]
          );
        }
      }
    }

    // Clean up any stale running scans from previous process lifetime
    await pool.query("UPDATE scans SET status = 'failed', error = 'Scan interrupted by server restart' WHERE status = 'running'");

    // Ensure all users have the correct 11 default stages in pipeline_stages
    const newStageDefaults = [
      { id: "new", label: "New", color: "var(--color-indigo)", val: 100 },
      { id: "re_research", label: "Re-research", color: "#ec4899", val: 50 },
      { id: "researched", label: "Researched", color: "#3b82f6", val: 150 },
      { id: "drafted", label: "Drafted", color: "#8b5cf6", val: 200 },
      { id: "contacted", label: "Contacted", color: "var(--color-amber)", val: 250 },
      { id: "follow_up", label: "Follow Up", color: "#f97316", val: 300 },
      { id: "opened", label: "Opened", color: "#10b981", val: 400 },
      { id: "replied", label: "Replied", color: "var(--color-teal)", val: 500 },
      { id: "won", label: "Won", color: "var(--color-emerald)", val: 1000 },
      { id: "archived", label: "Archived", color: "#6b7280", val: 0 },
      { id: "trash", label: "Trash", color: "var(--color-crimson)", val: 0 }
    ];

    for (const u of allUsers.rows) {
      const stagesRes = await pool.query("SELECT * FROM pipeline_stages WHERE user_id = $1", [u.id]);
      const hasOldDefaults = stagesRes.rows.some(r => r.label === 'Not Contacted' || r.label === 'In Outreach');
      if (stagesRes.rowCount === 0 || hasOldDefaults) {
        console.log(`[MIGRATION] Resetting pipeline stages to 11 defaults for user ${u.id}`);
        await pool.query("DELETE FROM pipeline_stages WHERE user_id = $1", [u.id]);
        for (let i = 0; i < newStageDefaults.length; i++) {
          const d = newStageDefaults[i];
          await pool.query(
            "INSERT INTO pipeline_stages (user_id, stage_id, label, color, position, value_multiplier) VALUES ($1, $2, $3, $4, $5, $6)",
            [u.id, d.id, d.label, d.color, i, d.val]
          );
        }
      }
    }


    //  Follow-Up System Migrations 
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_strategy JSONB DEFAULT NULL;`);
    await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS followup_number INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS email_uid VARCHAR(150) DEFAULT NULL;`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_uid ON emails(user_id, email_uid)
      WHERE email_uid IS NOT NULL;
    `);
    // Index for fast follow-up queue lookups
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_followup_queue ON leads(user_id, next_followup_at, status, followup_count);`);

    //  Noryvex Scraper & Enrichment Staging Migrations 
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raw_leads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        niche VARCHAR(255),
        location VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        website VARCHAR(255),
        category VARCHAR(255),
        rating NUMERIC(3,1),
        reviews INTEGER,
        source VARCHAR(255) DEFAULT 'google_maps',
        source_url TEXT,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_booking_widget VARCHAR(50) DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS chat_widget VARCHAR(50) DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS cms_platform VARCHAR(100) DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_method VARCHAR(50) DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_source_url TEXT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_checked_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS most_recent_review_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);


    // SMTP/IMAP columns for campaign_settings (provider-agnostic email)
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;`);

    // SMTP/IMAP columns for user_outboxes
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;`);
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;`);

    console.log("PostgreSQL schema validated and multi-tenant migrations applied successfully.");

  } catch (err) {
    console.error("Failed to run database migrations:", err.message);
  }
}

//  BACKEND API ENDPOINTS 

// Hashing and Token Utilities for Production Launch
const JWT_SECRET = process.env.JWT_SECRET || "super-secure-syntek-secret-key-123";

//  Admin Panel Auth 
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "syntek-admin-ultra-secure-jwt-2026-xK9mP!";
// Admin credentials (worldcoders17@gmail.com / raziadminboss123!#@$)
// Password stored as bcrypt hash  never in plaintext
const ADMIN_EMAIL = "worldcoders17@gmail.com";
const ADMIN_PASS_HASH = bcryptjs.hashSync("raziadminboss123!#@$", 12);

function generateAdminToken() {
  return jwt.sign({ admin: true, email: ADMIN_EMAIL }, ADMIN_JWT_SECRET, { expiresIn: "8h" });
}

const authenticateAdmin = (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Admin token required" });
  try {
    const decoded = jwt.verify(auth.substring(7), ADMIN_JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: "Not an admin token" });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
};

// Admin login rate limit  5 attempts per 15 min
const adminLoginAttempts = new Map();
function adminRateLimit(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const now = Date.now();
  const key = `admin_${ip}`;
  const attempts = (adminLoginAttempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 5) return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  attempts.push(now);
  adminLoginAttempts.set(key, attempts);
  next();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 600000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(":")) {
    return false; // Plaintext fallback disabled for security hardening
  }
  const parts = storedPassword.split(":");
  if (parts.length === 3) {
    const [iterations, salt, hash] = parts;
    const iterCount = parseInt(iterations, 10);
    const verifyHash = crypto.pbkdf2Sync(password, salt, iterCount, 64, "sha512").toString("hex");
    return hash === verifyHash;
  } else if (parts.length === 2) {
    const [salt, hash] = parts;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return hash === verifyHash;
  }
  return false;
}



// AES-256-GCM Credential Encryption Utilities
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "syntek-super-secure-encryption-key-2026-32-chars-long";

function getEncryptionKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function encryptText(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptText(encryptedText) {
  if (!encryptedText) return "";
  if (!encryptedText.includes(":")) return encryptedText; // Transparent fallback for legacy unencrypted database credentials
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;
  const [ivHex, authTagHex, encrypted] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Transparent decryption failed:", err.message);
    return encryptedText;
  }
}

function decryptConfig(config) {
  if (!config) return config;
  const decrypted = { ...config };
  decrypted.gmail_pass = decryptText(config.gmail_pass);
  decrypted.gemini_key = decryptText(config.gemini_key);
  decrypted.google_access_token = decryptText(config.google_access_token);
  decrypted.google_refresh_token = decryptText(config.google_refresh_token);
  return decrypted;
}

function generateToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (signature !== expectedSignature) return null;
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;
    return decodedPayload.userId;
  } catch {
    return null;
  }
}

// Middleware to authenticate and isolate tenant
const authenticate = async (req, res, next) => {
  try {
    let verifiedUserId = null;

    // 1. Try Authorization Bearer Token
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const userId = verifyToken(token);
      if (userId) {
        verifiedUserId = userId;
      }
    }

    // 2. Fallback to x-user-id header for development/legacy compatibility
    if (!verifiedUserId) {
      const userIdHeader = req.headers["x-user-id"];
      if (userIdHeader) {
        const userId = parseInt(userIdHeader, 10);
        if (!isNaN(userId)) {
          verifiedUserId = userId;
        }
      }
    }

    if (verifiedUserId) {
      // Verify user exists and is not disabled
      const userRes = await pool.query("SELECT id, is_disabled FROM users WHERE id = $1", [verifiedUserId]);
      if (userRes.rowCount > 0) {
        if (userRes.rows[0].is_disabled) {
          return res.status(403).json({ error: "Your account has been disabled. Contact support." });
        }
        req.userId = verifiedUserId;
        return next();
      }
    }

    return res.status(401).json({ error: "Unauthorized: Invalid, missing, or expired authentication token" });
  } catch (err) {
    console.error("Authentication middleware failure:", err);
    return res.status(500).json({ error: `Authentication error: ${err.message}` });
  }
};


// Billing Router Endpoints
app.get("/api/billing/status", authenticate, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT subscription_tier, subscription_status FROM users WHERE id = $1", [req.userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const { subscription_tier, subscription_status } = userRes.rows[0];
    
    let limit = 5;
    if (subscription_tier === "growth") limit = 25;
    else if (subscription_tier === "agency") limit = 50;

    res.json({
      tier: subscription_tier || "free",
      status: subscription_status || "active",
      quotaLimit: limit
    });
  } catch (err) {
    console.error("Error fetching billing status:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/billing/subscribe", authenticate, async (req, res) => {
  const { tier } = req.body;
  if (!tier || !["free", "growth", "agency"].includes(tier.toLowerCase())) {
    return res.status(400).json({ error: "Invalid subscription tier. Choose 'free', 'growth', or 'agency'." });
  }
  try {
    await pool.query(
      "UPDATE users SET subscription_tier = $1, subscription_status = 'active' WHERE id = $2",
      [tier.toLowerCase(), req.userId]
    );
    
    let limit = 5;
    if (tier.toLowerCase() === "growth") limit = 25;
    else if (tier.toLowerCase() === "agency") limit = 50;

    console.log(`[BILLING] User ${req.userId} successfully updated plan tier to ${tier}`);
    res.json({
      success: true,
      message: `Successfully subscribed to the ${tier} plan.`,
      tier: tier.toLowerCase(),
      status: "active",
      quotaLimit: limit
    });
  } catch (err) {
    console.error("Error updating subscription:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Auth Routes
const authRateLimit = rateLimiter(5, 15 * 60 * 1000); // 5 requests per 15 mins
const scanRateLimit = (req, res, next) => next();
const waitlistRateLimit = rateLimiter(5, 60 * 60 * 1000); // 5 submissions per hour

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  const { company_name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    // Check if user exists
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userCheck.rowCount > 0) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = hashPassword(password);

    // Insert user
    const newUser = await pool.query(
      "INSERT INTO users (company_name, email, password) VALUES ($1, $2, $3) RETURNING id, company_name, email, is_admin",
      [company_name || "", email, hashedPassword]
    );
    const userId = newUser.rows[0].id;

    // Create default campaign settings for the user
    await pool.query(
      `INSERT INTO campaign_settings (user_id, company_name, sender_name, sender_role, use_company_branding)
       VALUES ($1, $2, '', '', FALSE)`,
      [userId, company_name || ""]
    );

    const token = generateToken(userId);
    res.status(201).json({
      ...newUser.rows[0],
      token
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const userRes = await pool.query("SELECT id, company_name, email, password, is_admin FROM users WHERE email = $1", [email]);
    if (userRes.rowCount === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const user = userRes.rows[0];
    if (!verifyPassword(password, user.password)) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    delete user.password;
    
    // Generate secure token
    user.token = generateToken(user.id);
    res.json(user);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password Request Code
app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userRes.rowCount === 0) {
      return res.status(400).json({ error: "User not found with this email" });
    }

    const token = crypto.randomBytes(3).toString("hex").toUpperCase();
    
    // Clear any existing tokens for this email
    await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);
    
    // Insert new reset token valid for 1 hour
    await pool.query(
      "INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
      [email, token]
    );

    console.log(`[PASSWORD RESET TELEMETRY] Code for ${email} is: ${token}`);

    // Try to send email if user settings has SMTP set up
    const settingsRes = await pool.query(
      "SELECT gmail_user, gmail_pass FROM campaign_settings WHERE user_id = $1",
      [userRes.rows[0].id]
    );

    let emailSent = false;
    if (settingsRes.rowCount > 0 && settingsRes.rows[0].gmail_user && settingsRes.rows[0].gmail_pass) {
      try {
        const nodemailer = await import("nodemailer");
        const decryptedPass = decryptText(settingsRes.rows[0].gmail_pass);
        const transporter = getSmtpTransport(nodemailer.default, { email: settingsRes.rows[0].gmail_user, pass: decryptedPass });

        await transporter.sendMail({
          from: `"Syntek Security" <${settingsRes.rows[0].gmail_user}>`,
          to: email,
          subject: "Syntek Password Reset Code",
          text: `Your password reset code is: ${token}\n\nThis code is valid for 1 hour.`,
          html: `<p>Your password reset code is: <strong>${token}</strong></p><p>This code is valid for 1 hour.</p>`
        });
        emailSent = true;
      } catch (mailErr) {
        console.error("[PASSWORD RESET EMAIL FAIL]:", mailErr.message);
      }
    }

    res.json({ 
      message: "Reset code sent successfully.", 
      emailSent,
      // In local development or if SMTP is not set up, show the code in response to make it easy to test
      developmentCode: token
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reset Password with Code
app.post("/api/auth/reset-password", authRateLimit, async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) {
    return res.status(400).json({ error: "Email, token, and password are required" });
  }
  try {
    const tokenCheck = await pool.query(
      "SELECT * FROM password_resets WHERE email = $1 AND token = $2 AND expires_at > NOW()",
      [email, token]
    );

    if (tokenCheck.rowCount === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hashedPassword = hashPassword(password);
    await pool.query("UPDATE users SET password = $1 WHERE email = $2", [hashedPassword, email]);
    await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Google Calendar & Meet OAuth Endpoints
app.get("/api/auth/google", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Missing authentication token");
  }
  
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).send("Unauthorized: Invalid token");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return res.status(400).send("Google OAuth Client ID and Secret are not configured in the server's .env file. Please configure them to connect a Google Calendar.");
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/auth/google/callback`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets&access_type=offline&prompt=consent&state=${token}`;
  
  res.redirect(googleAuthUrl);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  
  if (!state) {
    return res.status(400).send("Authorization state missing");
  }

  const userId = verifyToken(state);
  if (!userId) {
    return res.status(401).send("Unauthorized: Invalid state session");
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/auth/google/callback`;

    // Exchange authorization code for access/refresh tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const expiryTime = Date.now() + (tokenData.expires_in * 1000);

    // Fetch user profile email
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    let googleEmail = "connected@gmail.com";
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      if (profileData.email) googleEmail = profileData.email;
    }

    await pool.query(
      `UPDATE campaign_settings SET 
        google_connected = TRUE,
        google_email = $1,
        google_sandbox_mode = FALSE,
        google_access_token = $2,
        google_refresh_token = COALESCE($3, google_refresh_token),
        google_token_expiry = $4
      WHERE user_id = $5`,
      [googleEmail, encryptText(tokenData.access_token), tokenData.refresh_token ? encryptText(tokenData.refresh_token) : null, expiryTime, userId]
    );

    console.log(`[GOOGLE AUTH] Real account connected for User ${userId}: ${googleEmail}`);
    res.redirect(`${frontendUrl}/?tab=Settings`);
  } catch (err) {
    console.error("Google Auth callback error:", err);
    res.status(500).send(`Google Connection failed: ${err.message}`);
  }
});

app.post("/api/auth/google/disconnect", authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE campaign_settings SET 
        google_connected = FALSE,
        google_email = NULL,
        google_access_token = NULL,
        google_refresh_token = NULL,
        google_token_expiry = NULL
      WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ message: "Google account disconnected successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  NOTIFICATIONS API ENDPOINTS 

// Fetch all notifications for the current user
app.get("/api/notifications", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, message, type, is_read, link, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read
app.put("/api/notifications/mark-read", authenticate, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = $1",
      [req.userId]
    );
    res.json({ success: true, message: "All notifications marked as read." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark a specific notification as read
app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a specific notification
app.delete("/api/notifications/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json({ success: true, message: "Notification deleted.", id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all notifications
app.delete("/api/notifications", authenticate, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM notifications WHERE user_id = $1",
      [req.userId]
    );
    res.json({ success: true, message: "All notifications cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check Route
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// Leads Routes
app.get("/api/leads", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY kanban_order ASC, id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scan/status/:id", authenticate, async (req, res) => {
  try {
    const scanRes = await pool.query(
      "SELECT status, progress, logs, error, created_at FROM scans WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (scanRes.rowCount === 0) {
      return res.status(404).json({ error: "Scan not found" });
    }
    const scan = scanRes.rows[0];
    res.json({
      status: scan.status,
      progress: parseFloat(scan.progress),
      logs: scan.logs,
      error: scan.error,
      created_at: scan.created_at
    });
  } catch (err) {
    console.error(`[STATUS API ERROR] Failed to query scan status for scan ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/scan/stop/:id", authenticate, async (req, res) => {
  try {
    const scanCheck = await pool.query(
      "SELECT status FROM scans WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (scanCheck.rowCount === 0) {
      return res.status(404).json({ error: "Scan not found" });
    }
    if (scanCheck.rows[0].status !== "running") {
      return res.status(400).json({ error: "Scan is not currently running" });
    }
    
    await pool.query(
      "UPDATE scans SET status = 'stopped' WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    
    res.json({ message: "Scan stop requested successfully." });
  } catch (err) {
    console.error(`[STOP API ERROR] Failed to stop scan ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scan/active", authenticate, async (req, res) => {
  try {
    const activeScan = await pool.query(
      "SELECT id, status, progress, logs, error, created_at FROM scans WHERE user_id = $1 AND status = 'running' ORDER BY id DESC LIMIT 1",
      [req.userId]
    );
    if (activeScan.rowCount === 0) {
      return res.json({ active: false });
    }
    const scan = activeScan.rows[0];
    res.json({
      active: true,
      scanId: scan.id,
      status: scan.status,
      progress: parseFloat(scan.progress) || 0,
      logs: scan.logs,
      error: scan.error,
      created_at: scan.created_at
    });
  } catch (err) {
    console.error("[ACTIVE SCAN API ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Email Sent Tracker  returns all leads that have been emailed, with open tracking data
app.get("/api/leads/sent-tracker", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, city, type, status, is_opened, opened_at, created_at, qualification_score
       FROM leads
       WHERE user_id = $1
         AND status NOT IN ('not contacted', 'new', 'no_email', 'trashed')
         AND email IS NOT NULL AND email != ''
       ORDER BY COALESCE(opened_at, created_at) DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/leads/export", authenticate, async (req, res) => {
  const { ids, status, city } = req.query;
  try {
    let query = "SELECT * FROM leads WHERE user_id = $1";
    const params = [req.userId];
    
    if (ids) {
      const idList = ids.split(",").map(Number).filter(n => !isNaN(n));
      if (idList.length > 0) {
        query += ` AND id = ANY($${params.length + 1}::int[])`;
        params.push(idList);
      }
    } else {
      if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }
      if (city) {
        query += ` AND city = $${params.length + 1}`;
        params.push(city);
      }
    }
    
    query += " ORDER BY id ASC";
    
    const result = await pool.query(query, params);
    
    // Convert to CSV
    const escapeCsv = (str) => {
      if (str === null || str === undefined) return "";
      const s = String(str);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    
    const headers = [
      "ID", "Name", "Category", "City", "Email", "Phone", 
      "Rating", "Reviews", "Status", "Instagram", "Website", "Website Status", "Email Opened"
    ];
    
    let csvContent = headers.join(",") + "\r\n";
    
    for (const lead of result.rows) {
      const row = [
        lead.id,
        escapeCsv(lead.name),
        escapeCsv(lead.type),
        escapeCsv(lead.city),
        escapeCsv(lead.email),
        escapeCsv(lead.phone),
        lead.rating || "",
        lead.reviews || "",
        escapeCsv(lead.status),
        escapeCsv(lead.instagram),
        escapeCsv(lead.website),
        escapeCsv(lead.website_status),
        lead.is_opened ? "TRUE" : "FALSE"
      ];
      csvContent += row.join(",") + "\r\n";
    }
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=syntek_leads.csv");
    res.send(csvContent);
  } catch (err) {
    console.error("Export leads error:", err);
    res.status(500).json({ error: "Failed to export leads data." });
  }
});

app.put("/api/leads/bulk-status", authenticate, async (req, res) => {
  const { leadIds, status, pipeline_stage } = req.body;
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: "leadIds array is required" });
  }
  try {
    await pool.query(
      "UPDATE leads SET status = COALESCE($1, status), pipeline_stage = $2 WHERE id = ANY($3) AND user_id = $4",
      [status, pipeline_stage, leadIds, req.userId]
    );

    if (pipeline_stage === 'Re-research') {
      const pendingJob = await pool.query(
        "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
        [req.userId]
      );
      if (pendingJob.rowCount === 0) {
        await pool.query(
          "INSERT INTO job_queue (user_id, job_type, run_at) VALUES ($1, 're_research', NOW())",
          [req.userId]
        );
      }
    }

    res.json({ success: true, message: `Successfully updated ${leadIds.length} leads.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leads/bulk", authenticate, async (req, res) => {
  const leadsList = req.body;
  if (!Array.isArray(leadsList)) {
    return res.status(400).json({ error: "Invalid payload: expected an array of leads." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertedLeads = [];
    for (const lead of leadsList) {
      const { 
        name, type, city, email, phone, rating, reviews, status, instagram, website,
        website_status, linkedin, facebook, whatsapp, twitter, 
        owner_name, owner_role, owner_contact, qualification_reason 
      } = lead;
      if (!name) continue; // skip rows without a business name
      const result = await client.query(
        `INSERT INTO leads (
          name, type, city, email, phone, rating, reviews, status, instagram, website, 
          website_status, linkedin, facebook, whatsapp, twitter, 
          owner_name, owner_role, owner_contact, qualification_reason, user_id, pipeline_stage
         ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
        [
          name, 
          type || "Other", 
          city || "Unknown", 
          email || "", 
          phone || "", 
          rating ? parseFloat(rating) : 4.0, 
          reviews ? parseInt(reviews, 10) : 0, 
          email ? (status || "not contacted") : "no_email", 
          instagram || "", 
          website || "", 
          website_status || "unknown",
          linkedin || null,
          facebook || null,
          whatsapp || null,
          twitter || null,
          owner_name || null,
          owner_role || null,
          owner_contact || null,
          qualification_reason || null,
          req.userId,
          email ? "New" : "Re-research"
        ]
      );
      insertedLeads.push(result.rows[0]);
    }
    await client.query("COMMIT");
    res.status(201).json({ message: `Successfully imported ${insertedLeads.length} leads!`, leads: insertedLeads });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Bulk import error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/leads", authenticate, async (req, res) => {
  const { name, type, city, email, phone, rating, reviews, status, instagram } = req.body;
  try {
    const initialStage = email ? "New" : "Re-research";
    const result = await pool.query(
      "INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, user_id, pipeline_stage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
      [name, type, city, email, phone, rating || 4.0, reviews || 0, email ? (status || "not contacted") : "no_email", instagram, req.userId, initialStage]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/reset-status", authenticate, async (req, res) => {
  try {
    await pool.query("UPDATE leads SET status = 'not contacted', is_opened = FALSE WHERE user_id = $1", [req.userId]);
    const result = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/:id/status", authenticate, async (req, res) => {
  const { id } = req.params;
  const { status, pipeline_stage } = req.body;
  try {
    let query = "UPDATE leads SET status = $1";
    const params = [status, id, req.userId];
    if (pipeline_stage) {
      query += ", pipeline_stage = $4";
      params.push(pipeline_stage);
    }
    query += " WHERE id = $2 AND user_id = $3 RETURNING *";
    const result = await pool.query(query, params);
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });

    if (pipeline_stage === 'Re-research') {
      const pendingJob = await pool.query(
        "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
        [req.userId]
      );
      if (pendingJob.rowCount === 0) {
        await pool.query(
          "INSERT INTO job_queue (user_id, job_type, run_at) VALUES ($1, 're_research', NOW())",
          [req.userId]
        );
      }
    }

    syncLeadToGoogleSheets(req.userId, result.rows[0]).catch(e => console.error("[SHEETS SYNC ERROR]", e));
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/leads/:id/order", authenticate, async (req, res) => {
  const { id } = req.params;
  const { kanban_order, human_escalation_reason } = req.body;
  try {
    let query = "UPDATE leads SET ";
    const sets = [];
    const params = [];
    let idx = 1;
    if (kanban_order !== undefined) {
      sets.push(`kanban_order = $${idx++}`);
      params.push(kanban_order);
    }
    if (human_escalation_reason !== undefined) {
      sets.push(`human_escalation_reason = $${idx++}`);
      params.push(human_escalation_reason);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    query += sets.join(", ");
    query += ` WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`;
    params.push(id, req.userId);
    const result = await pool.query(query, params);
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    syncLeadToGoogleSheets(req.userId, result.rows[0]).catch(e => console.error("[SHEETS SYNC ERROR]", e));
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    name, type, city, email, phone, rating, reviews, status, instagram, website, 
    website_status, owner_name, owner_role, owner_contact, qualification_reason,
    linkedin, facebook, whatsapp, twitter
  } = req.body;
  try {
    // Determine the transition status based on email presence
    // If status is passed, use it, else select the current one
    const currentLead = await pool.query("SELECT email, status FROM leads WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (currentLead.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    
    const activeStatus = status || currentLead.rows[0].status;
    const finalEmail = email !== undefined ? email : currentLead.rows[0].email;
    
    let finalStatus = activeStatus;
    if (finalEmail && activeStatus === 'no_email') {
      finalStatus = 'not contacted';
    } else if (!finalEmail && (activeStatus === 'not contacted' || activeStatus === 'new')) {
      finalStatus = 'no_email';
    }

    const result = await pool.query(
      `UPDATE leads SET 
        name = COALESCE($1, name), 
        type = COALESCE($2, type), 
        city = COALESCE($3, city), 
        email = $4, 
        phone = COALESCE($5, phone), 
        rating = COALESCE($6, rating), 
        reviews = COALESCE($7, reviews), 
        status = COALESCE($8, status), 
        instagram = COALESCE($9, instagram), 
        website = COALESCE($10, website), 
        website_status = COALESCE($11, website_status),
        owner_name = COALESCE($12, owner_name),
        owner_role = COALESCE($13, owner_role),
        owner_contact = COALESCE($14, owner_contact),
        qualification_reason = COALESCE($15, qualification_reason),
        linkedin = COALESCE($16, linkedin),
        facebook = COALESCE($17, facebook),
        whatsapp = COALESCE($18, whatsapp),
        twitter = COALESCE($19, twitter)
      WHERE id = $20 AND user_id = $21 RETURNING *`,
      [
        name || null, 
        type || null, 
        city || null, 
        finalEmail ? finalEmail.trim() : null, 
        phone || null, 
        rating !== undefined ? rating : null, 
        reviews !== undefined ? reviews : null, 
        finalStatus, 
        instagram || null, 
        website || null, 
        website_status || null, 
        owner_name || null,
        owner_role || null,
        owner_contact || null,
        qualification_reason || null,
        linkedin || null,
        facebook || null,
        whatsapp || null,
        twitter || null,
        id, 
        req.userId
      ]
    );
    if (result.rowCount > 0) {
      syncLeadToGoogleSheets(req.userId, result.rows[0]).catch(e => console.error("[SHEETS SYNC ERROR]", e));
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/leads", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE user_id = $1", [req.userId]);
    await pool.query("DELETE FROM emails WHERE user_id = $1", [req.userId]);
    res.json({ message: "All database records cleared successfully." });
  } catch (err) {
    console.error("DELETE /api/leads failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/leads/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    res.json({ message: "Lead deleted", lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Chat history for a specific lead
app.get("/api/leads/:leadId/chat", authenticate, async (req, res) => {
  const { leadId } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM lead_chat_messages WHERE lead_id = $1 AND user_id = $2 ORDER BY created_at ASC, id ASC",
      [leadId, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send a message to Lead AI Assistant and execute parsed actions
app.post("/api/leads/:leadId/chat", authenticate, async (req, res) => {
  const { leadId } = req.params;
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // 1. Fetch lead details
    const leadRes = await pool.query("SELECT * FROM leads WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
    if (leadRes.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    const lead = leadRes.rows[0];

    // 2. Fetch campaign/gmail settings
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(configRes.rows[0] || {});

    // 3. Fetch past chat history for this lead
    const historyRes = await pool.query(
      "SELECT role, content FROM lead_chat_messages WHERE lead_id = $1 AND user_id = $2 ORDER BY created_at ASC, id ASC LIMIT 20",
      [leadId, req.userId]
    );
    const history = historyRes.rows;

    // 4. Save user message to database
    await pool.query(
      "INSERT INTO lead_chat_messages (lead_id, user_id, role, content) VALUES ($1, $2, 'user', $3)",
      [leadId, req.userId, message]
    );

    // 5. Construct conversation prompt for Gemini
    let historyText = "";
    for (const msg of history) {
      historyText += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
    historyText += `User: ${message}\n`;

    const systemPrompt = `
You are a helpful sales assistant AI designed to help the user manage a prospect lead.
Prospect Details:
- Name: ${lead.name}
- Email: ${lead.email || "No email available"}
- Phone: ${lead.phone || "No phone available"}
- Website: ${lead.website || "No website"}
- Rating: ${lead.rating || "No rating"}
- Status: ${lead.status || "new"}
- Stage: ${lead.pipeline_stage || "New"}
- Type: ${lead.type || "unknown"}
- City: ${lead.city || "unknown"}

You can answer questions, give advice, suggest reply copies, or execute direct commands.
If the user asks you to perform an action, you must execute it by appending a single JSON-formatted action block at the very end of your response inside [ACTION: ...]. Supported actions:
1. Update status / stage: If they say "mark as replied", "move to won", "set stage to Closed", append:
   [ACTION: {"type": "UPDATE_STATUS", "status": "<status_name>", "pipeline_stage": "<stage_name>"}]
   Choose appropriate status name (e.g. 'not contacted', 'contacted', 'replied', 'won', 'archived') and stage name (e.g. 'New', 'Researched', 'Drafted', 'Contacted', 'Opened', 'Replied', 'Won', 'Archived').
2. Send an email: If they say "send them an email now", "email them asking for a call", or "send this email", append:
   [ACTION: {"type": "SEND_EMAIL", "subject": "<subject_here>", "body": "<body_here>"}]
3. Trash / delete lead: If they say "trash them" or "delete this lead", append:
   [ACTION: {"type": "TRASH_LEAD"}]
4. Create a reminder: If they say "remind me to follow up", "create a reminder", or similar, append:
   [ACTION: {"type": "CREATE_REMINDER", "title": "<reminder_title>", "message": "<reminder_message_or_task>"}]

Keep your responses conversational, helpful, and direct. If you trigger an action, make sure to let the user know in your message.
`;

    const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
    
    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nChat History:\n${historyText}\n\nAssistant:` }] }],
          generationConfig: {}
        }),
        signal: AbortSignal.timeout(30000)
      },
      () => {},
      0
    );

    const data = await response.json();
    const aiReply = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

    // 6. Process actions
    let executedAction = null;
    let actionResult = null;

    let cleanReply = aiReply;
    const actionMatch = aiReply.match(/\[ACTION:\s*(\{[\s\S]+?\})\s*\]/);
    if (actionMatch) {
      try {
        const actionData = JSON.parse(actionMatch[1]);
        cleanReply = aiReply.replace(/\[ACTION:\s*\{[\s\S]+?\}\s*\]/, "").trim();
        
        if (actionData.type === "TRASH_LEAD") {
          executedAction = "TRASH_LEAD";
          await pool.query("UPDATE leads SET status = 'archived', pipeline_stage = 'Archived' WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
          actionResult = { status: "archived", pipeline_stage: "Archived" };
        } else if (actionData.type === "CREATE_REMINDER") {
          executedAction = "CREATE_REMINDER";
          const notifTitle = actionData.title || `⏰ Reminder: ${lead.name}`;
          const notifMsg = actionData.message || `Follow up with ${lead.name}`;
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, 'reminder', 'Pipeline')`,
            [req.userId, notifTitle, notifMsg]
          );
          actionResult = { success: true, title: notifTitle, message: notifMsg };
        } else if (actionData.type === "UPDATE_STATUS") {
          executedAction = "UPDATE_STATUS";
          const newStatus = actionData.status;
          const statusMap = {
            "new": "New", "not contacted": "New", "researched": "Researched", "drafted": "Drafted",
            "contacted": "Contacted", "opened": "Opened", "replied": "Replied", "won": "Won",
            "interested": "Replied", "not interested": "Archived", "no_email": "Archived", "archived": "Archived"
          };
          const newStage = actionData.pipeline_stage || statusMap[newStatus?.toLowerCase()] || "New";
          await pool.query("UPDATE leads SET status = $1, pipeline_stage = $2 WHERE id = $3 AND user_id = $4", [newStatus, newStage, leadId, req.userId]);
          actionResult = { status: newStatus, pipeline_stage: newStage };
        } else if (actionData.type === "SEND_EMAIL") {
          executedAction = "SEND_EMAIL";
          const subject = actionData.subject;
          const body = actionData.body;

          if (config.gmail_user && config.gmail_pass && lead.email) {
            const nodemailer = await import("nodemailer");
            const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: config.gmail_pass, smtp_host: config.smtp_host, smtp_port: config.smtp_port });
            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body
            });

            // Log in emails table
            await pool.query(
              `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
               VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'sent', ARRAY['sent'], $6)`,
              [lead.name, lead.email, lead.name, subject, body, req.userId]
            );

            // Update contacted_at
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2",
              [leadId, req.userId]
            );
            
            actionResult = { success: true, message: `Email sent to ${lead.email}` };
          } else {
            actionResult = { success: false, error: "SMTP credentials or lead email missing" };
          }
        }
      } catch (jsonErr) {
        console.error("Failed to parse action JSON:", jsonErr.message);
      }
    }

    // Save assistant message to database
    await pool.query(
      "INSERT INTO lead_chat_messages (lead_id, user_id, role, content) VALUES ($1, $2, 'assistant', $3)",
      [leadId, req.userId, cleanReply]
    );

    res.json({
      reply: cleanReply,
      action: executedAction,
      actionResult
    });
  } catch (err) {
    console.error("[LEAD CHAT ERROR]:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET Global Copilot chat history
app.get("/api/ai/copilot", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM copilot_chat_messages WHERE user_id = $1 ORDER BY created_at ASC, id ASC",
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE Global Copilot chat history (Clear Chat)
app.delete("/api/ai/copilot", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM copilot_chat_messages WHERE user_id = $1", [req.userId]);
    res.json({ message: "Chat history cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send a message to Global AI Copilot and execute parsed actions
app.post("/api/ai/copilot", authenticate, async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // 1. Save user message to database
    await pool.query(
      "INSERT INTO copilot_chat_messages (user_id, role, content) VALUES ($1, 'user', $2)",
      [req.userId, message]
    );

    // 2. Fetch campaign/gmail settings
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(configRes.rows[0] || {});
    // Note: AI runs via agy CLI  no Gemini API key needed

    // 3. Fetch past copilot history
    const historyRes = await pool.query(
      "SELECT role, content FROM copilot_chat_messages WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 20",
      [req.userId]
    );

    // 4. Fetch status details
    const leadsRes = await pool.query("SELECT COUNT(*)::integer FROM leads WHERE user_id = $1", [req.userId]);
    const leadsCount = leadsRes.rows[0].count || 0;

    const recentLeadsRes = await pool.query(
      "SELECT id, name, email, status, pipeline_stage FROM leads WHERE user_id = $1 ORDER BY id DESC LIMIT 5",
      [req.userId]
    );
    let recentLeadsText = "";
    for (const l of recentLeadsRes.rows) {
      recentLeadsText += `- ID: ${l.id}, Name: ${l.name}, Email: ${l.email || "None"}, Stage: ${l.pipeline_stage || "New"}, Status: ${l.status}\n`;
    }

    const activeScanRes = await pool.query(
      "SELECT id, status, progress, error, created_at FROM scans WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [req.userId]
    );
    let scanStatusText = "No scans run yet.";
    if (activeScanRes.rowCount > 0) {
      const scan = activeScanRes.rows[0];
      scanStatusText = `ID: ${scan.id}, Status: ${scan.status}, Progress: ${scan.progress}%, Created At: ${scan.created_at}${scan.error ? `, Error: ${scan.error}` : ""}`;
    }

    const defaultStages = ["New", "Re-research", "Researched", "Drafted", "Contacted", "Follow Up", "Opened", "Replied", "Won", "Archived"];
    const stages = config.kanban_stages || defaultStages;

    // Fetch last 15 emails/replies/drafts to give the AI context about outreach history
    const recentEmailsRes = await pool.query(
      "SELECT id, from_name, from_email, subject, preview, category, labels, time_received FROM emails WHERE user_id = $1 ORDER BY time_received DESC, id DESC LIMIT 15",
      [req.userId]
    );
    let recentEmailsText = "No emails sent or received yet.";
    if (recentEmailsRes.rowCount > 0) {
      recentEmailsText = "";
      for (const e of recentEmailsRes.rows) {
        recentEmailsText += `- [${e.category.toUpperCase()}] From: ${e.from_name} <${e.from_email}> | Subject: "${e.subject || "(No Subject)"}" | Date: ${e.time_received}\n  Content Preview: "${e.preview || "(Empty)"}"\n`;
      }
    }

    // 5. Construct Prompt
    const systemPrompt = `
You are the Syntek Global AI Co-pilot, a powerful command assistant designed to help the user manage the entire platform.
You can query leads, update leads, run automations, manage stages, synchronize emails, and change configuration settings.

To execute actions on behalf of the user, append a JSON code block containing an array of action commands at the very end of your response.
Your response MUST end with:
\`\`\`json
[
  { "action": "MOVE_LEAD", "leadName": "Lucky Lab Coffee", "stage": "Won" }
]
\`\`\`

If no actions are requested or needed, you must output an empty array:
\`\`\`json
[]
\`\`\`

Available Action Commands:
1. { "action": "MOVE_LEAD", "leadName": "<Lead Name or Email>", "stage": "<Stage Name (e.g. New, Re-research, Researched, Contacted, Won, Follow Up, Archived)>" }
2. { "action": "CREATE_LEAD", "name": "<Lead Name>", "email": "<Lead Email (optional)>", "city": "<City (optional)>", "type": "<Niche/Type (optional)>", "website": "<Website (optional)>" }
3. { "action": "DELETE_LEAD", "leadName": "<Lead Name or Email>" }
4. { "action": "CREATE_STAGE", "stage": "<New Stage Name>" }
5. { "action": "EDIT_STAGE", "oldStage": "<Old Stage Name>", "newStage": "<New Stage Name>" }
6. { "action": "DELETE_STAGE", "stage": "<Stage Name>" }
7. { "action": "SYNC_INBOX" }
8. { "action": "RE_RESEARCH", "leadName": "<Lead Name or Email>" }
9. { "action": "RUN_AUTOMATION" }
10. { "action": "UPDATE_SETTINGS", "niche": "<niche (optional)>", "location": "<location (optional)>", "daily_lead_limit": <number (optional)> }
11. { "action": "BULK_RE_RESEARCH" } (moves all leads without an email or in 'no_email' status to 'Re-research' stage and queues background AI email scraper agent)
12. { "action": "DUPLICATE_LEADS_WITH_LINKEDIN", "stage": "<New Stage Name>" } (finds all leads that have a LinkedIn profile, ensures the new stage exists, duplicates them, and saves the duplicates in the new stage)
13. { "action": "TRASH_BOUNCED" } (finds all leads whose sent emails bounced with delivery errors and marks them as trashed/archived automatically)


Here is the current platform status:
- Total Leads count: ${leadsCount}
- Active Autopilot/Automation: ${config.is_active ? "Enabled" : "Disabled"}
- Niche: ${config.niche || "None"}
- Location: ${config.location || "None"}
- Daily Lead Limit: ${config.daily_lead_limit || 8}
- Gmail User: ${config.gmail_user || "Not Connected"}
- Kanban Stages: ${JSON.stringify(stages)}
- Active / Recent Scan Status: ${scanStatusText}

Recent leads (up to 5):
${recentLeadsText}

Recent emails/outreach history (last 15 messages sent/received/drafts):
${recentEmailsText}

Answer the user's message clearly, inform them of any actions you are queueing, and ALWAYS output the JSON action array block at the very end of your response.
`;

    // 6. Query AI via fetchGeminiWithRetry
    const rawContents = historyRes.rows.map(h => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }]
    }));

    // Ensure strict role alternation (merge consecutive messages of same role)
    const contents = [];
    for (const item of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts[0].text += "\n" + item.parts[0].text;
      } else {
        contents.push(item);
      }
    }

    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: message }] });
    } else if (contents[contents.length - 1].role !== "user") {
      // If history somehow does not end in user input, push current message
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    // fetchGeminiWithRetry routes through agy CLI  URL param is unused
    const payload = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const resObj = await fetchGeminiWithRetry(null, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const resJson = await resObj.json();
    const rawReply = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse reply and action block
    let cleanReply = rawReply;
    let actions = [];
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = rawReply.match(jsonBlockRegex);
    if (match) {
      cleanReply = rawReply.replace(jsonBlockRegex, "").trim();
      try {
        actions = JSON.parse(match[1].trim());
      } catch (jsonErr) {
        console.error("Failed to parse Copilot actions:", jsonErr.message);
      }
    }

    // 7. Execute Actions
    const actionResults = [];
    for (const act of actions) {
      try {
        if (act.action === "MOVE_LEAD") {
          const leadFind = await pool.query(
            "SELECT id, name FROM leads WHERE user_id = $1 AND (name ILIKE $2 OR email ILIKE $2) LIMIT 1",
            [req.userId, `%${act.leadName}%`]
          );
          if (leadFind.rowCount > 0) {
            const lead = leadFind.rows[0];
            const statusMap = {
              "New":          "not contacted",
              "Re-research":  "no_email",
              "Researched":   "researched",
              "Drafted":      "drafted",
              "Contacted":    "contacted",
              "Follow Up":    "contacted",
              "Opened":       "opened",
              "Replied":      "replied",
              "Won":          "won",
              "Archived":     "archived",
            };
            const newStatus = statusMap[act.stage] || "not contacted";
            await pool.query(
              "UPDATE leads SET pipeline_stage = $1, status = $2 WHERE id = $3 AND user_id = $4",
              [act.stage, newStatus, lead.id, req.userId]
            );
            actionResults.push({ success: true, message: `Moved lead "${lead.name}" to stage "${act.stage}"` });
          } else {
            actionResults.push({ success: false, error: `Lead "${act.leadName}" not found` });
          }
        }

        else if (act.action === "CREATE_LEAD") {
          const insRes = await pool.query(
            `INSERT INTO leads (name, email, city, type, website, status, pipeline_stage, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name`,
            [
              act.name,
              act.email || "",
              act.city || "",
              act.type || "",
              act.website || "",
              act.email ? "not contacted" : "no_email",
              act.email ? "New" : "Re-research",
              req.userId
            ]
          );
          actionResults.push({ success: true, message: `Created lead "${act.name}" (ID ${insRes.rows[0].id})` });
        }

        else if (act.action === "DELETE_LEAD") {
          const delRes = await pool.query(
            "DELETE FROM leads WHERE user_id = $1 AND (name ILIKE $2 OR email ILIKE $2) RETURNING name",
            [req.userId, `%${act.leadName}%`]
          );
          if (delRes.rowCount > 0) {
            actionResults.push({ success: true, message: `Deleted lead "${delRes.rows[0].name}"` });
          } else {
            actionResults.push({ success: false, error: `Lead "${act.leadName}" not found` });
          }
        }

        else if (act.action === "CREATE_STAGE") {
          const newStages = [...stages, act.stage];
          await pool.query(
            "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
            [newStages, req.userId]
          );
          actionResults.push({ success: true, message: `Created new stage "${act.stage}"` });
        }

        else if (act.action === "EDIT_STAGE") {
          const oldStage = act.oldStage;
          const newStage = act.newStage;
          const newStages = stages.map(s => s === oldStage ? newStage : s);
          await pool.query(
            "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
            [newStages, req.userId]
          );
          await pool.query(
            "UPDATE leads SET pipeline_stage = $1 WHERE pipeline_stage = $2 AND user_id = $3",
            [newStage, oldStage, req.userId]
          );
          actionResults.push({ success: true, message: `Renamed stage "${oldStage}" to "${newStage}"` });
        }

        else if (act.action === "DELETE_STAGE") {
          const newStages = stages.filter(s => s !== act.stage);
          await pool.query(
            "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
            [newStages, req.userId]
          );
          actionResults.push({ success: true, message: `Deleted stage "${act.stage}"` });
        }

        else if (act.action === "SYNC_INBOX") {
          const pendingSync = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'inbox_sync' AND status = 'pending'",
            [req.userId]
          );
          if (pendingSync.rowCount === 0) {
            await pool.query(
              "INSERT INTO job_queue (user_id, job_type, payload, run_at) VALUES ($1, 'inbox_sync', $2, NOW())",
              [req.userId, JSON.stringify({ config_id: config.id || 0 })]
            );
            actionResults.push({ success: true, message: "Queued inbox sync job" });
          } else {
            actionResults.push({ success: true, message: "Inbox sync job is already pending" });
          }
        }

        else if (act.action === "RE_RESEARCH") {
          const leadFind = await pool.query(
            "SELECT id, name FROM leads WHERE user_id = $1 AND (name ILIKE $2 OR email ILIKE $2) LIMIT 1",
            [req.userId, `%${act.leadName}%`]
          );
          if (leadFind.rowCount > 0) {
            const lead = leadFind.rows[0];
            await pool.query(
              "UPDATE leads SET pipeline_stage = 'Re-research', status = 'no_email', email = '', re_research_attempts = 0 WHERE id = $1",
              [lead.id]
            );
            await pool.query(
              "UPDATE campaign_settings SET re_research_enabled = TRUE WHERE user_id = $1",
              [req.userId]
            );
            const pendingJob = await pool.query(
              "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
              [req.userId]
            );
            if (pendingJob.rowCount === 0) {
              await pool.query(
                "INSERT INTO job_queue (user_id, job_type, run_at) VALUES ($1, 're_research', NOW())",
                [req.userId]
              );
            }
            actionResults.push({ success: true, message: `Initiated re-research for lead "${lead.name}" and enabled re-research agent.` });
          } else {
            actionResults.push({ success: false, error: `Lead "${act.leadName}" not found for re-research` });
          }
        }

        else if (act.action === "BULK_RE_RESEARCH") {
          // 1. Ensure Re-research and Manual Research by Boss stages exist
          if (!stages.includes("Re-research")) {
            const newStages = [...stages, "Re-research"];
            await pool.query(
              "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
              [newStages, req.userId]
            );
          }
          if (!stages.includes("Manual Research by Boss")) {
            // Refetch stages to make sure we don't overwrite the previous update
            const freshConfig = await pool.query("SELECT kanban_stages FROM campaign_settings WHERE user_id = $1", [req.userId]);
            const currentStages = freshConfig.rows[0]?.kanban_stages || stages;
            if (!currentStages.includes("Manual Research by Boss")) {
              const newStages = [...currentStages, "Manual Research by Boss"];
              await pool.query(
                "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
                [newStages, req.userId]
              );
            }
          }

          // 2. Enable re-research agent setting
          await pool.query(
            "UPDATE campaign_settings SET re_research_enabled = TRUE WHERE user_id = $1",
            [req.userId]
          );

          // 3. Move all leads without email to Re-research stage
          const updateRes = await pool.query(
            `UPDATE leads 
             SET pipeline_stage = 'Re-research', 
                 status = 'no_email', 
                 re_research_attempts = 0 
             WHERE user_id = $1 AND (email IS NULL OR email = '' OR email NOT LIKE '%@%')`,
            [req.userId]
          );

          // 4. Queue a re_research job if none pending
          const pendingJob = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
            [req.userId]
          );
          if (pendingJob.rowCount === 0) {
            await pool.query(
              "INSERT INTO job_queue (user_id, job_type, run_at) VALUES ($1, 're_research', NOW())",
              [req.userId]
            );
          }

          actionResults.push({ 
            success: true, 
            message: `Moved ${updateRes.rowCount} leads with no email to "Re-research" stage, enabled re-research agent, and queued background research job.` 
          });
        }

        else if (act.action === "DUPLICATE_LEADS_WITH_LINKEDIN") {
          const targetStage = act.stage || "Leads with LinkedIn Profiles";
          
          // 1. Ensure target stage exists
          const freshConfig = await pool.query("SELECT kanban_stages FROM campaign_settings WHERE user_id = $1", [req.userId]);
          const currentStages = freshConfig.rows[0]?.kanban_stages || stages;
          if (!currentStages.includes(targetStage)) {
            const newStages = [...currentStages, targetStage];
            await pool.query(
              "UPDATE campaign_settings SET kanban_stages = $1 WHERE user_id = $2",
              [newStages, req.userId]
            );
          }
          
          // 2. Query all leads with LinkedIn
          const linkedinLeads = await pool.query(
            "SELECT * FROM leads WHERE user_id = $1 AND linkedin IS NOT NULL AND linkedin != '' AND linkedin != 'null'",
            [req.userId]
          );
          
          let dupCount = 0;
          for (const lead of linkedinLeads.rows) {
            // Check duplicate in targetStage
            const existingDup = await pool.query(
              "SELECT id FROM leads WHERE user_id = $1 AND name = $2 AND pipeline_stage = $3 LIMIT 1",
              [req.userId, lead.name, targetStage]
            );
            if (existingDup.rowCount === 0) {
              await pool.query(
                `INSERT INTO leads (
                  name, type, city, email, phone, rating, reviews, status, instagram, user_id, 
                  website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, 
                  owner_role, owner_contact, qualification_reason, pipeline_stage, personalized_icebreaker
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
                [
                  lead.name, lead.type, lead.city, lead.email, lead.phone, lead.rating, lead.reviews, lead.status, lead.instagram, req.userId,
                  lead.website, lead.website_status, lead.linkedin, lead.facebook, lead.whatsapp, lead.twitter, lead.owner_name,
                  lead.owner_role, lead.owner_contact, lead.qualification_reason, targetStage, lead.personalized_icebreaker
                ]
              );
              dupCount++;
            }
          }
          
          actionResults.push({
            success: true,
            message: `Created stage "${targetStage}" and duplicated ${dupCount} leads with LinkedIn profiles into it.`
          });
        }

        else if (act.action === "RUN_AUTOMATION") {
          await pool.query(
            "UPDATE campaign_settings SET is_active = TRUE WHERE user_id = $1",
            [req.userId]
          );
          const pendingJob = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'campaign_run' AND status = 'pending'",
            [req.userId]
          );
          if (pendingJob.rowCount === 0) {
            await pool.query(
              "INSERT INTO job_queue (user_id, job_type, run_at) VALUES ($1, 'campaign_run', NOW())",
              [req.userId]
            );
          }
          actionResults.push({ success: true, message: "Activated Autopilot and queued campaign run" });
        }

        else if (act.action === "TRASH_BOUNCED") {
          const bouncedLeads = await pool.query(`
            SELECT DISTINCT l.id, l.name
            FROM leads l
            WHERE l.user_id = $1 AND l.status != 'trashed'
              AND l.id IN (
                SELECT DISTINCT lead_id FROM emails
                WHERE user_id = $1 AND lead_id IS NOT NULL
                  AND (
                    'bounced' = ANY(labels)
                    OR subject ILIKE '%address not found%'
                    OR subject ILIKE '%delivery failure%'
                    OR subject ILIKE '%undeliverable%'
                    OR subject ILIKE '%couldn''t be delivered%'
                    OR subject ILIKE '%failure notice%'
                    OR preview ILIKE '%address couldn''t be found%'
                    OR preview ILIKE '%unable to receive email%'
                  )
              )
          `, [req.userId]);
          if (bouncedLeads.rowCount > 0) {
            const ids = bouncedLeads.rows.map(r => r.id);
            await pool.query(
              "UPDATE leads SET status = 'trashed', pipeline_stage = 'Archived' WHERE id = ANY($1) AND user_id = $2",
              [ids, req.userId]
            );
            actionResults.push({ success: true, message: `Trashed ${bouncedLeads.rowCount} leads with bounced emails: ${bouncedLeads.rows.map(r => r.name).join(", ")}` });
          } else {
            actionResults.push({ success: true, message: "No new bounced leads found  all already archived!" });
          }
        }

        else if (act.action === "UPDATE_SETTINGS") {
          const { niche, location, daily_lead_limit, outreach_style } = act;
          await pool.query(
            `UPDATE campaign_settings SET 
              niche = COALESCE($1, niche),
              location = COALESCE($2, location),
              daily_lead_limit = COALESCE($3, daily_lead_limit),
              outreach_style = COALESCE($4, outreach_style)
             WHERE user_id = $5`,
            [
              niche === undefined ? null : niche, 
              location === undefined ? null : location, 
              daily_lead_limit === undefined ? null : daily_lead_limit, 
              outreach_style === undefined ? null : outreach_style,
              req.userId
            ]
          );
          actionResults.push({ success: true, message: "Settings updated successfully" });
        }
      } catch (actErr) {
        console.error("Copilot action execution failed:", actErr.message);
        actionResults.push({ success: false, error: actErr.message });
      }
    }

    // 8. Save assistant reply to database
    await pool.query(
      "INSERT INTO copilot_chat_messages (user_id, role, content) VALUES ($1, 'assistant', $2)",
      [req.userId, cleanReply]
    );

    res.json({
      reply: cleanReply,
      actions,
      actionResults
    });

  } catch (err) {
    console.error("[GLOBAL COPILOT ERROR]:", err);
    res.status(500).json({ error: err.message });
  }
});


// Pipeline Stages Customization Routes
app.get("/api/pipeline/stages", authenticate, async (req, res) => {
  try {
    let result = await pool.query(
      "SELECT * FROM pipeline_stages WHERE user_id = $1 ORDER BY position ASC",
      [req.userId]
    );
    
    if (result.rowCount === 0) {
      const defaults = [
        { id: "new", label: "New", color: "var(--color-indigo)", val: 100 },
        { id: "re_research", label: "Re-research", color: "#ec4899", val: 50 },
        { id: "researched", label: "Researched", color: "#3b82f6", val: 150 },
        { id: "drafted", label: "Drafted", color: "#8b5cf6", val: 200 },
        { id: "contacted", label: "Contacted", color: "var(--color-amber)", val: 250 },
        { id: "follow_up", label: "Follow Up", color: "#f97316", val: 300 },
        { id: "opened", label: "Opened", color: "#10b981", val: 400 },
        { id: "replied", label: "Replied", color: "var(--color-teal)", val: 500 },
        { id: "won", label: "Won", color: "var(--color-emerald)", val: 1000 },
        { id: "archived", label: "Archived", color: "#6b7280", val: 0 },
        { id: "trash", label: "Trash", color: "var(--color-crimson)", val: 0 }
      ];
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < defaults.length; i++) {
          const d = defaults[i];
          await client.query(
            "INSERT INTO pipeline_stages (user_id, stage_id, label, color, position, value_multiplier) VALUES ($1, $2, $3, $4, $5, $6)",
            [req.userId, d.id, d.label, d.color, i, d.val]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      
      result = await pool.query(
        "SELECT * FROM pipeline_stages WHERE user_id = $1 ORDER BY position ASC",
        [req.userId]
      );
    }
    
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/pipeline/stages failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/stages", authenticate, async (req, res) => {
  const { label, color, value_multiplier } = req.body;
  if (!label) {
    return res.status(400).json({ error: "Stage label is required" });
  }
  try {
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const stageId = `${baseId}_${uniqueSuffix}`;
    
    const posRes = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM pipeline_stages WHERE user_id = $1",
      [req.userId]
    );
    const nextPos = posRes.rows[0].next_pos;
    
    const result = await pool.query(
      "INSERT INTO pipeline_stages (user_id, stage_id, label, color, position, value_multiplier) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [req.userId, stageId, label, color || "#4f46e5", nextPos, value_multiplier !== undefined ? parseInt(value_multiplier, 10) : 100]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/pipeline/stages failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/pipeline/stages/reorder", authenticate, async (req, res) => {
  const { stageIds } = req.body;
  if (!Array.isArray(stageIds)) {
    return res.status(400).json({ error: "stageIds array is required" });
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < stageIds.length; i++) {
      await client.query(
        "UPDATE pipeline_stages SET position = $1 WHERE stage_id = $2 AND user_id = $3",
        [i, stageIds[i], req.userId]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /api/pipeline/stages/reorder failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put("/api/pipeline/stages/:stage_id", authenticate, async (req, res) => {
  const { stage_id } = req.params;
  const { label, color, value_multiplier } = req.body;
  if (!label) {
    return res.status(400).json({ error: "Stage label is required" });
  }
  try {
    const result = await pool.query(
      "UPDATE pipeline_stages SET label = $1, color = $2, value_multiplier = $3 WHERE stage_id = $4 AND user_id = $5 RETURNING *",
      [label, color || "#4f46e5", value_multiplier !== undefined ? parseInt(value_multiplier, 10) : 100, stage_id, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Stage not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /api/pipeline/stages/:stage_id failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pipeline/stages/:stage_id", authenticate, async (req, res) => {
  const { stage_id } = req.params;
  const { mergeIntoStageId } = req.body;
  
  if (!mergeIntoStageId) {
    return res.status(400).json({ error: "mergeIntoStageId is required to safely merge leads" });
  }
  if (stage_id === mergeIntoStageId) {
    return res.status(400).json({ error: "Cannot merge a stage into itself" });
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Move leads in deleted stage to target stage
    await client.query(
      "UPDATE leads SET status = $1 WHERE status = $2 AND user_id = $3",
      [mergeIntoStageId, stage_id, req.userId]
    );
    
    // Delete the stage
    const result = await client.query(
      "DELETE FROM pipeline_stages WHERE stage_id = $1 AND user_id = $2 RETURNING *",
      [stage_id, req.userId]
    );
    
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Stage not found" });
    }
    
    await client.query("COMMIT");
    res.json({ message: "Stage deleted and leads merged successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/pipeline/stages/:stage_id failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put("/api/pipeline/stages/:stage_id/move", authenticate, async (req, res) => {
  const { stage_id } = req.params;
  const { targetStageId } = req.body;
  if (!targetStageId) {
    return res.status(400).json({ error: "targetStageId is required to move leads" });
  }
  if (stage_id === targetStageId) {
    return res.status(400).json({ error: "Source and target stages must be different" });
  }
  try {
    const result = await pool.query(
      "UPDATE leads SET status = $1 WHERE status = $2 AND user_id = $3 RETURNING id",
      [targetStageId, stage_id, req.userId]
    );
    res.json({ message: `Successfully moved ${result.rowCount} leads`, count: result.rowCount });
  } catch (err) {
    console.error("PUT /api/pipeline/stages/:stage_id/move failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/pipeline/stages/:stage_id/clear", authenticate, async (req, res) => {
  const { stage_id } = req.params;
  try {
    let result;
    if (stage_id === "trashed") {
      result = await pool.query(
        "DELETE FROM leads WHERE status = $1 AND user_id = $2 RETURNING id",
        [stage_id, req.userId]
      );
      res.json({ message: `Successfully deleted ${result.rowCount} leads`, count: result.rowCount });
    } else {
      result = await pool.query(
        "UPDATE leads SET status = 'trashed' WHERE status = $1 AND user_id = $2 RETURNING id",
        [stage_id, req.userId]
      );
      res.json({ message: `Successfully moved ${result.rowCount} leads to trashed`, count: result.rowCount });
    }
  } catch (err) {
    console.error("PUT /api/pipeline/stages/:stage_id/clear failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// User Outboxes API (SMTP rotation senders)
app.get("/api/outboxes", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, daily_sent_limit, daily_sent_count, last_sent_at, is_active, smtp_host, smtp_port FROM user_outboxes WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/outboxes", authenticate, async (req, res) => {
  const { email, password, daily_sent_limit, smtp_host, smtp_port, imap_host, imap_port } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    // Ensure smtp columns exist
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;`).catch(() => {});
    await pool.query(`ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;`).catch(() => {});
    const encryptedPassword = encryptText(password);
    const result = await pool.query(
      "INSERT INTO user_outboxes (user_id, email, password, daily_sent_limit, smtp_host, smtp_port, imap_host, imap_port) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, daily_sent_limit, is_active, smtp_host, smtp_port, imap_host, imap_port",
      [req.userId, email, encryptedPassword, daily_sent_limit || 50, smtp_host || null, smtp_port ? parseInt(smtp_port) : null, imap_host || null, imap_port ? parseInt(imap_port) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/outboxes/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM user_outboxes WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Outbox not found" });
    res.json({ message: "Outbox deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Campaign Sequences API
app.get("/api/sequences", authenticate, async (req, res) => {
  try {
    const seqs = await pool.query("SELECT * FROM campaign_sequences WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    const result = [];
    for (let seq of seqs.rows) {
      const steps = await pool.query("SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_number ASC", [seq.id]);
      result.push({ ...seq, steps: steps.rows });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sequences", authenticate, async (req, res) => {
  const { name, steps } = req.body;
  if (!name) return res.status(400).json({ error: "Sequence name is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const seqRes = await client.query(
      "INSERT INTO campaign_sequences (user_id, name) VALUES ($1, $2) RETURNING *",
      [req.userId, name]
    );
    const seqId = seqRes.rows[0].id;
    
    const createdSteps = [];
    if (Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepRes = await client.query(
          "INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [seqId, i + 1, step.delay_days || 3, step.subject, step.body]
        );
        createdSteps.push(stepRes.rows[0]);
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ ...seqRes.rows[0], steps: createdSteps });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put("/api/sequences/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, steps } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    if (name) {
      await client.query("UPDATE campaign_sequences SET name = $1 WHERE id = $2 AND user_id = $3", [name, id, req.userId]);
    }
    
    if (Array.isArray(steps)) {
      await client.query("DELETE FROM sequence_steps WHERE sequence_id = $1", [id]);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await client.query(
          "INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES ($1, $2, $3, $4, $5)",
          [id, i + 1, step.delay_days || 3, step.subject, step.body]
        );
      }
    }
    
    await client.query("COMMIT");
    
    const seqRes = await pool.query("SELECT * FROM campaign_sequences WHERE id = $1 AND user_id = $2", [id, req.userId]);
    const stepsRes = await pool.query("SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_number ASC", [id]);
    res.json({ ...seqRes.rows[0], steps: stepsRes.rows });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete("/api/sequences/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM campaign_sequences WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Sequence not found" });
    res.json({ message: "Sequence deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Domain DNS Health Checker
app.get("/api/dns/validate", authenticate, async (req, res) => {
  const { domain, dkimSelector } = req.query;
  if (!domain) return res.status(400).json({ error: "Domain parameter is required" });
  
  const results = {
    spf: { valid: false, record: null },
    dmarc: { valid: false, record: null },
    dkim: { valid: false, record: null }
  };
  
  try {
    try {
      const records = await dns.promises.resolveTxt(domain);
      const spfRecord = records.flat().find(r => r.startsWith("v=spf1"));
      if (spfRecord) {
        results.spf.valid = true;
        results.spf.record = spfRecord;
      }
    } catch (e) {
      console.log("SPF check failed:", e.message);
    }
    
    try {
      const records = await dns.promises.resolveTxt(`_dmarc.${domain}`);
      const dmarcRecord = records.flat().find(r => r.startsWith("v=DMARC1"));
      if (dmarcRecord) {
        results.dmarc.valid = true;
        results.dmarc.record = dmarcRecord;
      }
    } catch (e) {
      console.log("DMARC check failed:", e.message);
    }
    
    if (dkimSelector) {
      try {
        const records = await dns.promises.resolveTxt(`${dkimSelector}._domainkey.${domain}`);
        const dkimRecord = records.flat().find(r => r.startsWith("v=DKIM1") || r.includes("p="));
        if (dkimRecord) {
          results.dkim.valid = true;
          results.dkim.record = dkimRecord;
        }
      } catch (e) {
        console.log("DKIM check failed:", e.message);
      }
    }
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Control Panel stats
app.get("/api/admin/dashboard", authenticate, async (req, res) => {
  try {
    const userCheck = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.userId]);
    if (userCheck.rowCount === 0 || !userCheck.rows[0].is_admin) {
      return res.status(403).json({ error: "Access denied. Admin authorization required." });
    }
    
    const totalUsers = await pool.query("SELECT COUNT(*) FROM users");
    const totalLeads = await pool.query("SELECT COUNT(*) FROM leads");
    const totalJobs = await pool.query("SELECT COUNT(*), status FROM job_queue GROUP BY status");
    const activeCampaigns = await pool.query("SELECT COUNT(*) FROM campaign_settings WHERE is_active = TRUE");
    const usersList = await pool.query("SELECT id, email, company_name, created_at, is_admin FROM users ORDER BY id DESC LIMIT 15");
    
    res.json({
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count, 10),
        totalLeads: parseInt(totalLeads.rows[0].count, 10),
        activeCampaigns: parseInt(activeCampaigns.rows[0].count, 10),
        jobs: totalJobs.rows.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count, 10);
          return acc;
        }, {})
      },
      users: usersList.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin feedbacks list
app.get("/api/admin/feedback", authenticate, async (req, res) => {
  try {
    const userCheck = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.userId]);
    if (userCheck.rowCount === 0 || !userCheck.rows[0].is_admin) {
      return res.status(403).json({ error: "Access denied. Admin authorization required." });
    }
    const feedbackList = await pool.query(`
      SELECT f.*, u.email as user_email, u.company_name as user_company
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.id DESC
    `);
    res.json(feedbackList.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin toggle user admin status
app.post("/api/admin/users/:id/toggle-admin", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const userCheck = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.userId]);
    if (userCheck.rowCount === 0 || !userCheck.rows[0].is_admin) {
      return res.status(403).json({ error: "Access denied. Admin authorization required." });
    }
    const targetUser = await pool.query("SELECT is_admin FROM users WHERE id = $1", [id]);
    if (targetUser.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const newAdminStatus = !targetUser.rows[0].is_admin;
    await pool.query("UPDATE users SET is_admin = $1 WHERE id = $2", [newAdminStatus, id]);
    res.json({ success: true, is_admin: newAdminStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Smart Inbox Routes
app.get("/api/emails", authenticate, async (req, res) => {
  try {
    const { tab = "all", page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Tab-aware WHERE clause  uses labels array to correctly categorise emails
    let tabFilter = "";
    if (tab === "inbox") {
      tabFilter = `AND e.labels @> ARRAY['inbox']::text[] AND (e.category IS NULL OR e.category != 'draft')`;
    } else if (tab === "pending") {
      tabFilter = `AND (e.labels && ARRAY['pending_reply','draft']::text[] OR e.category = 'draft')`;
    } else if (tab === "sent") {
      tabFilter = `AND e.labels @> ARRAY['sent']::text[]`;
    }

    const result = await pool.query(
      `SELECT e.*, COALESCE(l.is_opened, FALSE) AS lead_is_opened,
              l.contacted_at, l.followup_count, l.next_followup_at, l.qualification_score
       FROM emails e
       LEFT JOIN leads l ON LOWER(e.from_email) = LOWER(l.email) AND e.user_id = l.user_id
       WHERE e.user_id = $1 ${tabFilter}
       ORDER BY e.time_received DESC, e.id DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, parseInt(limit), offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::integer AS total FROM emails e WHERE e.user_id = $1 ${tabFilter}`,
      [req.userId]
    );
    const total = countRes.rows[0]?.total || 0;

    res.json({ emails: result.rows, total, page: parseInt(page), hasMore: offset + result.rows.length < total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/emails/sync", authenticate, async (req, res) => {
  try {
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(configRes.rows[0] || {});
    if (!config || !config.gmail_user) return res.status(404).json({ error: "Gmail not connected. Please connect Gmail under Settings first." });
    
    const result = await syncUserInbox(req.userId, config);
    if (result.success) {
      res.json({ message: "Mailbox synced successfully!", newReplies: result.count });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/emails", authenticate, async (req, res) => {
  const { tab = "inbox" } = req.query;
  try {
    let deleteWhere = "";
    if (tab === "inbox") {
      deleteWhere = `AND labels @> ARRAY['inbox']::text[] AND (category IS NULL OR category != 'draft')`;
    } else if (tab === "pending") {
      deleteWhere = `AND (labels && ARRAY['pending_reply','draft']::text[] OR category = 'draft')`;
    } else if (tab === "sent") {
      deleteWhere = `AND labels @> ARRAY['sent']::text[]`;
    } else {
      // Fallback: old behaviour (clear all non-sent)
      deleteWhere = `AND NOT ('sent' = ANY(labels)) AND (category IS NULL OR category != 'sent')`;
    }
    const result = await pool.query(
      `DELETE FROM emails WHERE user_id = $1 ${deleteWhere}`,
      [req.userId]
    );
    res.json({ success: true, deleted: result.rowCount, tab });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/emails/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { is_read, category, labels } = req.body;
  try {
    const result = await pool.query(
      "UPDATE emails SET is_read = COALESCE($1, is_read), category = COALESCE($2, category), labels = COALESCE($3, labels) WHERE id = $4 AND user_id = $5 RETURNING *",
      [
        is_read === undefined ? null : is_read,
        category === undefined ? null : category,
        labels === undefined ? null : labels,
        id,
        req.userId
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Email not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  Universal SMTP transport factory 
function getSmtpTransport(nodemailer, sender) {
  const email = (sender.email || "").toLowerCase();
  const host  = sender.smtp_host;
  const port  = sender.smtp_port;

  if (host && host.trim()) {
    return nodemailer.createTransport({
      host: host.trim(),
      port: parseInt(port) || 465,
      secure: parseInt(port) !== 587,
      auth: { user: sender.email, pass: sender.pass },
      tls: { rejectUnauthorized: false }
    });
  }
  if (email.endsWith("@gmail.com") || email.endsWith("@googlemail.com")) {
    return nodemailer.createTransport({ service: "gmail", auth: { user: sender.email, pass: sender.pass } });
  }
  if (email.endsWith("@outlook.com") || email.endsWith("@hotmail.com") || email.endsWith("@live.com") || email.endsWith("@msn.com")) {
    return nodemailer.createTransport({ service: "hotmail", auth: { user: sender.email, pass: sender.pass } });
  }
  if (email.endsWith("@yahoo.com") || email.endsWith("@ymail.com")) {
    return nodemailer.createTransport({ service: "yahoo", auth: { user: sender.email, pass: sender.pass } });
  }
  if (email.endsWith("@zoho.com") || email.endsWith("@zohomail.com")) {
    return nodemailer.createTransport({ host: "smtp.zoho.com", port: 465, secure: true, auth: { user: sender.email, pass: sender.pass } });
  }
  if (email.endsWith("@icloud.com") || email.endsWith("@me.com") || email.endsWith("@mac.com")) {
    return nodemailer.createTransport({ host: "smtp.mail.me.com", port: 587, secure: false, auth: { user: sender.email, pass: sender.pass } });
  }
  const domain = email.split("@")[1] || "";
  console.warn(`[SMTP] Unknown provider for ${email}  attempting smtp.${domain}:465`);
  return nodemailer.createTransport({
    host: `smtp.${domain}`,
    port: 465,
    secure: true,
    auth: { user: sender.email, pass: sender.pass },
    tls: { rejectUnauthorized: false }
  });
}

app.post("/api/emails/:id/reply", authenticate, async (req, res) => {
  const { id } = req.params;
  const { replyText, gmailUser, gmailPass } = req.body;
  try {
    // Fetch target email to find company details
    const emailResult = await pool.query("SELECT * FROM emails WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (emailResult.rowCount === 0) return res.status(404).json({ error: "Email not found" });
    const email = emailResult.rows[0];

    // If Gmail credentials are provided, send a real email
    if (gmailUser && gmailPass && email.from_email) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = getSmtpTransport(nodemailer.default, { email: gmailUser, pass: gmailPass });
        await transporter.sendMail({
          from: gmailUser,
          to: email.from_email,
          subject: email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`,
          text: replyText
        });
        console.log(`Real reply email sent from ${gmailUser} to ${email.from_email}`);
      } catch (mailErr) {
        console.error("Nodemailer failed in reply:", mailErr);
        const errStr = mailErr.message.toLowerCase();
        if (errStr.includes("recipient") || errStr.includes("address") || errStr.includes("not found") || errStr.includes("invalid") || errStr.includes("550")) {
           const matchedLead = await pool.query(
             "UPDATE leads SET status = 'trashed' WHERE email = $1 AND user_id = $2 RETURNING name",
             [email.from_email, req.userId]
           );
           if (matchedLead.rowCount > 0) {
             console.log(`[REPLY AUTO-TRASH] Marked lead ${matchedLead.rows[0].name} as trashed due to reply email bounce.`);
           }
        }
        return res.status(500).json({ error: `Gmail transmission failed: ${mailErr.message}` });
      }
    }

    // Mark email as read and tag replies
    await pool.query(
      "UPDATE emails SET is_read = TRUE, labels = array_append(labels, 'replied') WHERE id = $1 AND user_id = $2",
      [id, req.userId]
    );

    // Automatically update the lead status to contacted/replied in pipeline
    await pool.query(
      "UPDATE leads SET status = 'contacted' WHERE (email = $1 OR name ILIKE $2) AND user_id = $3",
      [email.from_email, `%${email.company}%`, req.userId]
    );

    res.json({ message: "Reply sent and lead stage advanced in pipeline" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getFallbackReplyTemplate(email, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const signature = useCompany && companyName ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

  const preview = (email.preview || "").toLowerCase();
  
  if (preview.includes("price") || preview.includes("cost") || preview.includes("how much")) {
    return `Hi ${email.from_name || "there"},\n\nThanks for asking! Our pricing is customized depending on your business requirements. I'd love to learn more about your setup to give you an accurate quote. Are you free for a quick chat this week?\n\nCheers,\n${signature}`;
  }
  
  if (preview.includes("interested") || preview.includes("yes") || preview.includes("sure") || preview.includes("ok")) {
    return `Hi ${email.from_name || "there"},\n\nGreat to hear! I'd love to schedule a quick 10-minute slot to demo what we do and align on next steps. Would tomorrow or Thursday work best for you?\n\nCheers,\n${signature}`;
  }
  
  return `Hi ${email.from_name || "there"},\n\nThanks for getting back to me! I would love to hop on a brief call this week to see if we'd be a good fit to help optimize your operations. Let me know if you have a preferred time to connect.\n\nCheers,\n${signature}`;
}

async function generateEmailReplyText(email, config, userId) {
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

  // Retrieve email history thread for this prospect to give conversational memory
  const threadRes = await pool.query(
    "SELECT * FROM emails WHERE from_email = $1 AND user_id = $2 ORDER BY id ASC",
    [email.from_email, userId]
  );

  let threadContext = "";
  for (const msg of threadRes.rows) {
    const isSent = msg.category === "sent" || (msg.labels && msg.labels.includes("sent"));
    threadContext += `${isSent ? "Me (Outreach)" : "Prospect"}: ${msg.preview}\n\n`;
  }

  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;

  let signature = "";
  if (useCompany && companyName) {
    signature = `${senderName}\n${senderRole}\n${companyName}`;
  } else {
    signature = `${senderName}\n${senderRole}`;
  }

  const promptText = `
    You are ${senderName}, working as "${senderRole}"${(useCompany && companyName) ? ` at ${companyName}` : ""}.
    You are replying to a prospect who sent you an email. Here is the entire email exchange thread history:
    
    ${threadContext}
    
    Write a highly personalized, short email reply (3-4 sentences maximum).
    - If the email indicates interest or asks questions, answer helpfully and suggest a 10-minute quick Zoom call this week to align.
    - If they ask for pricing, suggest a quick chat to evaluate their requirements.
    - Tone: Extremely warm, friendly, concise, and professional.
    - Signature: Use exactly this:
      Cheers,
      ${signature}
    - Instructions: Output ONLY the reply email body. Do not include subject lines or Markdown wrappers.
  `;

  try {
    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {}
        }),
        signal: AbortSignal.timeout(30000)
      },
      (type, text) => console.log(`[EMAIL REPLY RETRY] [${type.toUpperCase()}] ${text}`),
      0
    );

    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch (err) {
    console.error(`[GEMINI FETCH FAIL] Error: ${err.message}`);
    throw err;
  }
}

app.post("/api/emails/:id/generate-reply", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch target email
    const emailRes = await pool.query("SELECT * FROM emails WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (emailRes.rowCount === 0) {
      return res.status(404).json({ error: "Email not found" });
    }
    const email = emailRes.rows[0];

    // Fetch campaign settings
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    if (settingsRes.rowCount === 0) {
      return res.status(404).json({ error: "Campaign settings not found" });
    }
    const config = decryptConfig(settingsRes.rows[0]);

    // Check if AI is enabled for this lead/prospect
    const leadRes = await pool.query(
      "SELECT * FROM leads WHERE (email = $1 OR name ILIKE $2) AND user_id = $3 LIMIT 1",
      [email.from_email, `%${email.company}%`, req.userId]
    );
    const lead = leadRes.rows[0];
    if (lead && lead.ai_enabled === false) {
      return res.status(400).json({ error: "AI Autopilot is disabled for this lead." });
    }

    // Check meeting intent first
    const bookingCheck = await detectMeetingBookingIntent(email, config, req.userId);
    if (bookingCheck.isMeetingAgreed) {
      console.log(`[BOOKING ENGINE] Manual generate-reply: Meeting agreement detected at ${bookingCheck.meetingTime}!`);
      
      const summary = `Syntek Meeting: ${lead ? lead.name : email.from_name} & User`;
      const calendarEvent = await createGoogleCalendarEvent(req.userId, lead ? lead.name : email.from_name, email.from_email, summary, bookingCheck.meetingTime);
      
      if (calendarEvent && calendarEvent.meetLink) {
        // Update lead status to 'meeting_booked'
        if (lead) {
          await pool.query(
            "UPDATE leads SET status = 'meeting_booked' WHERE id = $1 AND user_id = $2",
            [lead.id, req.userId]
          );
        }
        
        const senderName = config.sender_name || "Muhammad Razi";
        const senderRole = config.sender_role || "Independent Developer";
        const companyName = config.company_name || "";
        const useCompany = config.use_company_branding || false;
        const signature = useCompany && companyName ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

        const replyText = `Hi ${lead ? lead.name : email.from_name},\n\nI've scheduled our call for ${new Date(bookingCheck.meetingTime).toLocaleString()}! Here is our Google Meet link:\n${calendarEvent.meetLink}\n\nLooking forward to speaking with you!\n\nCheers,\n${signature}`;
        
        return res.json({ replyText, meetingBooked: true, meetLink: calendarEvent.meetLink });
      }
    }

    const replyText = await generateEmailReplyText(email, config, req.userId);
    
    if (email.category === 'draft' || (email.labels && email.labels.includes('pending_reply'))) {
      // Regenerate: update existing draft preview in place
      await pool.query(
        "UPDATE emails SET preview = $1 WHERE id = $2 AND user_id = $3",
        [replyText, id, req.userId]
      );
      res.json({ replyText });
    } else {
      // Manual draft generation for an incoming inbox email
      //  Guard: prevent duplicate draft if one already exists for this from_email 
      const existingDraft = await pool.query(
        `SELECT id FROM emails WHERE user_id = $1 AND from_email = $2
         AND (labels && ARRAY['pending_reply','draft']::text[] OR category = 'draft')
         AND time_received > NOW() - INTERVAL '24 hours'
         ORDER BY id DESC LIMIT 1`,
        [req.userId, email.from_email]
      );
      if (existingDraft.rowCount > 0) {
        // Update existing draft instead of creating another
        await pool.query(
          "UPDATE emails SET preview = $1, time_received = NOW() WHERE id = $2 AND user_id = $3",
          [replyText, existingDraft.rows[0].id, req.userId]
        );
        const updatedDraft = await pool.query("SELECT * FROM emails WHERE id = $1", [existingDraft.rows[0].id]);
        return res.json({ replyText, newDraft: updatedDraft.rows[0], updated: true });
      }

      const draftSubject = email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`;
      const draftLabels = ['draft', 'pending_reply'];
      const insertRes = await pool.query(
        `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id, lead_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'draft', $6, $7, $8) RETURNING *`,
        [email.from_name, email.from_email, email.company, draftSubject, replyText, draftLabels, req.userId, lead ? lead.id : null]
      );
      res.json({ replyText, newDraft: insertRes.rows[0] });
    }
  } catch (err) {
    console.error("Failed to generate smart reply:", err);
    await handleGeminiError(req.userId, err, "Smart Reply Generation");
    res.status(err.message.includes("Quota") || err.message.includes("429") ? 429 : 400).json({ error: err.message });
  }
});

let cachedNgrokUrl = null;
async function getDynamicBaseUrl(req) {
  if (req) {
    const host = req.headers.host || "localhost:5000";
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return process.env.APP_URL || `${protocol}://${host}`;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    if (res.ok) {
      const data = await res.json();
      const publicTunnel = data.tunnels?.find(t => t.proto === 'https' || t.proto === 'http');
      if (publicTunnel && publicTunnel.public_url) {
        cachedNgrokUrl = publicTunnel.public_url;
        return cachedNgrokUrl;
      }
    }
  } catch (e) {
    // Ngrok API not running, ignore
  }

  return cachedNgrokUrl || "http://localhost:5000";
}

app.post("/api/send-email", authenticate, async (req, res) => {
  const { gmailUser, gmailPass, to, subject, body, leadId, draftId, smtp_host, smtp_port } = req.body;
  
  if (!gmailUser || !gmailPass) {
    return res.status(400).json({ error: "Gmail credentials are required." });
  }
  if (!to) {
    return res.status(400).json({ error: "Recipient email is required." });
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = getSmtpTransport(nodemailer.default, { email: gmailUser, pass: gmailPass, smtp_host, smtp_port });

    let leadName = to;
    let leadCompany = "";
    if (leadId) {
      const leadRes = await pool.query("SELECT * FROM leads WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
      if (leadRes.rowCount > 0) {
        leadName = leadRes.rows[0].name;
        leadCompany = leadRes.rows[0].name;
      }
    }

    const baseUrl = await getDynamicBaseUrl(req);
    const trackingTag = leadId ? `<br/><br/><img src="${baseUrl}/api/track-open/${leadId}" width="1" height="1" style="display:none;"/>` : "";
    const htmlBody = body.replace(/\n/g, "<br/>") + trackingTag;

    await transporter.sendMail({
      from: `"${gmailUser.split('@')[0]}" <${gmailUser}>`,
      to,
      subject,
      html: htmlBody
    });

    // Create an entry in emails table
    await pool.query(
      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'sent', ARRAY['sent'], $6)`,
      [leadName, to, leadCompany, subject, body, req.userId]
    );

    // If this email was sent from a draft, delete the draft
    if (draftId) {
      await pool.query("DELETE FROM emails WHERE id = $1 AND user_id = $2", [draftId, req.userId]);
    }

    if (leadId) {
      await pool.query(
        "UPDATE leads SET status = 'contacted', contacted_at = COALESCE(contacted_at, CURRENT_TIMESTAMP) WHERE id = $1 AND user_id = $2",
        [leadId, req.userId]
      );
    }

    res.json({ message: "Email sent successfully via SMTP!" });
  } catch (err) {
    console.error("Nodemailer send-email failed:", err);
    const errStr = err.message.toLowerCase();
    if (leadId && (errStr.includes("recipient") || errStr.includes("address") || errStr.includes("not found") || errStr.includes("invalid") || errStr.includes("550"))) {
       await pool.query("UPDATE leads SET status = 'trashed' WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
       console.log(`[API AUTO-TRASH] Marked lead ID ${leadId} as trashed due to bounce/address error: ${err.message}`);
    }
    res.status(500).json({ error: `SMTP transmission failed: ${err.message}` });
  }
});

// Centralized AI Copy Generator using Local agy CLI
app.post("/api/ai/generate", authenticate, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt parameter is required" });
  }
  try {
    const isJson = prompt.toLowerCase().includes("json");
    const response = await fetchGeminiWithRetry(null, {
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: isJson ? { responseMimeType: "application/json" } : {}
      })
    });
    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.json({ text: resultText });
  } catch (err) {
    console.error("Central AI copy generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Settings Config Endpoints
app.get("/api/settings", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = result.rows[0];
    if (config) {
      config.gmail_pass = decryptText(config.gmail_pass);
      config.gemini_key = decryptText(config.gemini_key);
      config.google_access_token = decryptText(config.google_access_token);
      config.google_refresh_token = decryptText(config.google_refresh_token);
      config.google_calendar_connected = !!config.google_calendar_access_token;
      // Delete sensitive calendar tokens to keep frontend secure
      delete config.google_calendar_access_token;
      delete config.google_calendar_refresh_token;
      config.kanbanStages = config.kanban_stages;
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings", authenticate, async (req, res) => {
  const { 
    niche, location, daily_lead_limit, preferred_time, timezone, is_active, 
    concurrent_jobs, gmail_user, gmail_pass, gemini_key, search_mode, 
    sender_name, sender_role, company_name, use_company_branding, 
    outreach_style, pitch_offer, custom_offer_details, schedule_type,
    sender_type, about_text, portfolio_url, social_linkedin, social_github,
    social_twitter, logo_url, banner_url, profile_icon_url, google_sandbox_mode,
    work_samples, required_contact, sequence_id, autopilot_mode, sender_location,
    kanban_stages, re_research_enabled,
    auto_rereserach_on_bounce, auto_rereserach_no_email, auto_detect_auto_reply,
    auto_reply_to_followup, ai_draft_replies_enabled, copilot_reply_mode,
    copilot_reply_all, escalate_cost, escalate_mockups, escalate_terms,
    auto_book_meetings, slack_webhook_url, google_sheets_spreadsheet_id, google_sheets_sync_enabled
  } = req.body;
  try {
    let finalStages = kanban_stages;
    if (finalStages && Array.isArray(finalStages)) {
      const protectedStages = ["New", "Re-research", "Contacted", "Follow Up", "Replied", "Won", "Archived"];
      protectedStages.forEach(stg => {
        if (!finalStages.includes(stg)) {
          finalStages.push(stg);
        }
      });

      // Detect and execute stage name changes to update leads pipeline_stage values
      const oldConfigRes = await pool.query("SELECT kanban_stages FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
      const oldConfig = oldConfigRes.rows[0];
      if (oldConfig && oldConfig.kanban_stages && Array.isArray(oldConfig.kanban_stages)) {
        const oldStages = oldConfig.kanban_stages;
        if (oldStages.length === finalStages.length) {
          for (let idx = 0; idx < oldStages.length; idx++) {
            const oldName = oldStages[idx];
            const newName = finalStages[idx];
            if (oldName !== newName) {
              console.log(`[STAGE RENAME] Renaming lead stage from "${oldName}" to "${newName}" for User ${req.userId}...`);
              await pool.query(
                "UPDATE leads SET pipeline_stage = $1 WHERE pipeline_stage = $2 AND user_id = $3",
                [newName, oldName, req.userId]
              );
            }
          }
        }
      }
    }

    const result = await pool.query(
      `UPDATE campaign_settings SET 
        niche = COALESCE($1, niche), 
        location = COALESCE($2, location), 
        daily_lead_limit = COALESCE($3, daily_lead_limit), 
        preferred_time = COALESCE($4, preferred_time), 
        timezone = COALESCE($5, timezone), 
        is_active = COALESCE($6, is_active), 
        concurrent_jobs = COALESCE($7, concurrent_jobs), 
        gmail_user = COALESCE($8, gmail_user), 
        gmail_pass = COALESCE($9, gmail_pass), 
        gemini_key = COALESCE($10, gemini_key),
        search_mode = COALESCE($11, search_mode),
        sender_name = COALESCE($12, sender_name),
        sender_role = COALESCE($13, sender_role),
        company_name = COALESCE($14, company_name),
        use_company_branding = COALESCE($15, use_company_branding),
        outreach_style = COALESCE($16, outreach_style),
        pitch_offer = COALESCE($17, pitch_offer),
        custom_offer_details = COALESCE($18, custom_offer_details),
        schedule_type = COALESCE($19, schedule_type),
        sender_type = COALESCE($20, sender_type),
        about_text = COALESCE($21, about_text),
        portfolio_url = COALESCE($22, portfolio_url),
        social_linkedin = COALESCE($23, social_linkedin),
        social_github = COALESCE($24, social_github),
        social_twitter = COALESCE($25, social_twitter),
        logo_url = COALESCE($26, logo_url),
        banner_url = COALESCE($27, banner_url),
        profile_icon_url = COALESCE($28, profile_icon_url),
        google_sandbox_mode = COALESCE($29, google_sandbox_mode),
        work_samples = COALESCE($30, work_samples),
        required_contact = COALESCE($31, required_contact),
        sequence_id = CASE WHEN $32 = TRUE THEN $33::integer WHEN $34 = TRUE THEN NULL ELSE sequence_id END,
        autopilot_mode = COALESCE($35, autopilot_mode),
        sender_location = COALESCE($37, sender_location),
        kanban_stages = COALESCE($38, kanban_stages),
        re_research_enabled = COALESCE($39, re_research_enabled),
        auto_rereserach_on_bounce = COALESCE($40, auto_rereserach_on_bounce),
        auto_rereserach_no_email = COALESCE($41, auto_rereserach_no_email),
        auto_detect_auto_reply = COALESCE($42, auto_detect_auto_reply),
        auto_reply_to_followup = COALESCE($43, auto_reply_to_followup),
        ai_draft_replies_enabled = COALESCE($44, ai_draft_replies_enabled),
        copilot_reply_mode = COALESCE($45, copilot_reply_mode),
        copilot_reply_all = COALESCE($46, copilot_reply_all),
        escalate_cost = COALESCE($47, escalate_cost),
        escalate_mockups = COALESCE($48, escalate_mockups),
        escalate_terms = COALESCE($49, escalate_terms),
        auto_book_meetings = COALESCE($50, auto_book_meetings),
        slack_webhook_url = COALESCE($51, slack_webhook_url),
        google_sheets_spreadsheet_id = COALESCE($52, google_sheets_spreadsheet_id),
        google_sheets_sync_enabled = COALESCE($53, google_sheets_sync_enabled)
      WHERE user_id = $36 RETURNING *`,
      [
        niche === undefined ? null : niche,
        location === undefined ? null : location,
        daily_lead_limit === undefined ? null : daily_lead_limit,
        preferred_time === undefined ? null : preferred_time,
        timezone === undefined ? null : timezone,
        is_active === undefined ? null : is_active,
        concurrent_jobs === undefined ? null : concurrent_jobs,
        gmail_user === undefined ? null : gmail_user,
        gmail_pass === undefined ? null : (gmail_pass ? encryptText(gmail_pass) : ""),
        gemini_key === undefined ? null : (gemini_key ? encryptText(gemini_key) : ""),
        search_mode === undefined ? null : search_mode,
        sender_name === undefined ? null : sender_name,
        sender_role === undefined ? null : sender_role,
        company_name === undefined ? null : company_name,
        use_company_branding === undefined ? null : use_company_branding,
        outreach_style === undefined ? null : outreach_style,
        pitch_offer === undefined ? null : pitch_offer,
        custom_offer_details === undefined ? null : custom_offer_details,
        schedule_type === undefined ? null : schedule_type,
        sender_type === undefined ? null : sender_type,
        about_text === undefined ? null : about_text,
        portfolio_url === undefined ? null : portfolio_url,
        social_linkedin === undefined ? null : social_linkedin,
        social_github === undefined ? null : social_github,
        social_twitter === undefined ? null : social_twitter,
        logo_url === undefined ? null : logo_url,
        banner_url === undefined ? null : banner_url,
        profile_icon_url === undefined ? null : profile_icon_url,
        google_sandbox_mode === undefined ? null : google_sandbox_mode,
        work_samples === undefined ? null : work_samples,
        required_contact === undefined ? null : required_contact,
        sequence_id !== undefined && sequence_id !== null,
        sequence_id,
        sequence_id === null,
        autopilot_mode === undefined ? null : autopilot_mode,
        req.userId,
        sender_location === undefined ? null : sender_location,
        finalStages === undefined ? null : finalStages,
        re_research_enabled === undefined ? null : re_research_enabled,
        auto_rereserach_on_bounce === undefined ? null : auto_rereserach_on_bounce,
        auto_rereserach_no_email === undefined ? null : auto_rereserach_no_email,
        auto_detect_auto_reply === undefined ? null : auto_detect_auto_reply,
        auto_reply_to_followup === undefined ? null : auto_reply_to_followup,
        ai_draft_replies_enabled === undefined ? null : ai_draft_replies_enabled,
        copilot_reply_mode === undefined ? null : copilot_reply_mode,
        copilot_reply_all === undefined ? null : copilot_reply_all,
        escalate_cost === undefined ? null : escalate_cost,
        escalate_mockups === undefined ? null : escalate_mockups,
        escalate_terms === undefined ? null : escalate_terms,
        auto_book_meetings === undefined ? null : auto_book_meetings,
        slack_webhook_url === undefined ? null : slack_webhook_url,
        google_sheets_spreadsheet_id === undefined ? null : google_sheets_spreadsheet_id,
        google_sheets_sync_enabled === undefined ? null : google_sheets_sync_enabled
      ]
    );
    const config = result.rows[0];
    if (config) {
      config.gmail_pass = decryptText(config.gmail_pass);
      config.gemini_key = decryptText(config.gemini_key);
      config.google_access_token = decryptText(config.google_access_token);
      config.google_refresh_token = decryptText(config.google_refresh_token);
      config.kanbanStages = config.kanban_stages;
    }
    res.json(config);
  } catch (err) {
    console.error("POST /api/settings error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// AI Support Chat Assistant Route
app.post("/api/support/chat", authenticate, async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // Fetch campaign settings to get Gemini API key
    const settingsRes = await pool.query("SELECT gemini_key FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const geminiKey = settingsRes.rows[0]?.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

    const systemInstruction = `
      You are the Syntek AI Support Assistant. Syntek is a premium, fully autonomous B2B growth and lead management SaaS platform built by Muhammad Razi.
      
      CRITICAL INFORMATION:
      - Syntek is designed to be 100% AUTONOMOUS. Once a user enables "Background Autopilot" (via the toggle in the Lead Finder, Campaigns, or Settings tabs), the system runs automatically in the background on the server.
      - The user DOES NOT need to perform manual tasks. Once Autopilot is ON, the server-side cron jobs automatically:
        1. Scrape Yelp leads daily using the default Niche and Location settings.
        2. Qualify leads via Gemini DeepSearch (discovering emails, checking website status, scoring socials).
        3. Compose personalized cold emails using Gemini (injecting user bio, work samples, and business stats).
        4. Send outreach emails via SMTP (Gmail).
        5. Check the Inbox for client replies, detect meeting bookings, auto-schedule events on Google Calendar with custom Google Meet links, and reply to the client with the Meet invite.
        6. Advance deal stages automatically on the Kanban Board.
      - Manual buttons (like "Run Scan" or "Queue Outbound SMTP") and the "Client Sender Loop" are for testing or overrides.
      
      Core Features & Navigation Guide:
      1. **Launch Center / Dashboard**: The marketing home view. Displays system flows, founder details (Muhammad Razi), and live cron sequence logs.
      2. **Lead Finder**: Search niches & locations. Features:
         - "Yelp Web Scraper" (fast scraping)
         - "Gemini DeepSearch" (advanced web search to qualifiy emails/socials)
         - Autopilot Status toggle card to trigger background cycles.
      3. **Campaigns & Email Outreach**:
         - Select tone styles (ROI, Casual, Direct, Feedback) and pitch offers.
         - Click "Run Client Sender Loop" to watch emails send in the browser sequentially, or toggle "Background Autopilot" to let the server handle it quietly.
      4. **Smart Inbox**: Displays client responses. Generates AI Smart Replies.
      5. **Pipeline**: Drag-and-drop Kanban deal board (Not Contacted -> In Outreach -> Engaged -> Hot Leads -> Meeting Booked -> Closed).
      6. **Settings**: Refactored tabbed configurations:
         - *Profile & Brand*: Choose Developer vs Company, input Bio, and write portfolio Work Samples.
         - *Campaign Scheduler*: Set daily lead limits, timezone, runs coordinate timings, and toggle Autopilot.
         - *SMTP & API Nodes*: Connect SMTP Gmail App passwords and authorize Google Calendar.
      7. **Onboarding Setup Wizard**: Adaptive onboarding modal loaded on startup.
      
      Guidelines:
      - Help users understand that Syntek runs hands-free. Explain how to configure their parameters and turn on Autopilot.
      - Keep answers friendly, short, structured, and bulleted.
    `;

    // Map history to Gemini API format
    const contents = [];
    if (history && Array.isArray(history)) {
      history.forEach(chat => {
        contents.push({
          role: chat.role === "user" ? "user" : "model",
          parts: [{ text: chat.text }]
        });
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {}
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `Gemini API error: ${response.status} - ${errText}` });
    }

    const data = await response.json();
    const reply = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    res.json({ reply });
  } catch (err) {
    console.error("Support assistant chat error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Custom Templates Endpoints
app.get("/api/templates", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM templates WHERE user_id = $1 ORDER BY id DESC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/templates", authenticate, async (req, res) => {
  const { name, subject, body, sender_type } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: "Template name, subject, and body are required." });
  }
  try {
    const result = await pool.query(
      "INSERT INTO templates (name, subject, body, sender_type, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, subject, body, sender_type || "all", req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ message: "Template deleted successfully", template: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Feedback Endpoints
app.post("/api/feedback", authenticate, async (req, res) => {
  const { category, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Feedback message is required" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO feedback (user_id, category, message) VALUES ($1, $2, $3) RETURNING *",
      [req.userId, category || "Other", message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Feedback submission error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/feedback", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM feedback WHERE user_id = $1 ORDER BY id DESC",
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Feedback fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Waitlist Route
app.post("/api/waitlist", waitlistRateLimit, async (req, res) => {
  const { name, email, company } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    // Check if email already waitlisted
    const check = await pool.query("SELECT * FROM waitlist WHERE email = $1", [email]);
    if (check.rowCount > 0) {
      return res.status(400).json({ error: "This email is already registered on our waitlist!" });
    }
    await pool.query(
      "INSERT INTO waitlist (name, email, company) VALUES ($1, $2, $3)",
      [name || "", email.trim().toLowerCase(), company || ""]
    );
    res.status(201).json({ message: "Added to waitlist successfully" });
  } catch (err) {
    console.error("Waitlist error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Email Open Tracking Endpoint
app.get("/api/track-open/:leadId", async (req, res) => {
  const { leadId } = req.params;
  try {
    const leadCheck = await pool.query("SELECT is_opened, name, user_id, sent_pitch_id FROM leads WHERE id = $1", [leadId]);
    if (leadCheck.rowCount > 0) {
      const lead = leadCheck.rows[0];
      
      // Increment template open_count on first open
      if (!lead.is_opened && lead.sent_pitch_id) {
        await pool.query(
          "UPDATE pitch_templates SET open_count = open_count + 1 WHERE id = $1",
          [lead.sent_pitch_id]
        );
      }
      
      await pool.query(
        `UPDATE leads 
         SET is_opened = TRUE, 
             opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP),
             status = CASE 
               WHEN status IN ('replied', 'won', 'archived', 'trashed') THEN status 
               ELSE 'opened' 
             END,
             pipeline_stage = CASE 
               WHEN pipeline_stage IN ('Replied', 'Won', 'Archived') THEN pipeline_stage 
               ELSE 'Opened' 
             END
         WHERE id = $1`,
        [leadId]
      );
      console.log(`[TRACK] Lead "${lead.name}" (ID ${leadId}) opened their outreach email.`);

      // Notify user only on the first open event
      if (!lead.is_opened) {
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5)`,
            [lead.user_id, ` Email Opened: ${lead.name}`, `They just opened your outreach email.`, 'system', 'Pipeline']
          );
        } catch (notifErr) {
          console.error("Failed to insert open notification:", notifErr.message);
        }
      }
    } else {
      console.log(`[TRACK] Lead ID ${leadId} opened email but lead was not found in database.`);
    }
    
    // Serve transparent 1x1 GIF
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": pixel.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private"
    });
    res.end(pixel);
  } catch (err) {
    console.error("Tracking pixel error:", err);
    res.status(500).end();
  }
});

// AI Autopilot Toggle for Lead
app.put("/api/leads/:id/toggle-ai", authenticate, async (req, res) => {
  const { id } = req.params;
  const { ai_enabled } = req.body;
  try {
    const result = await pool.query(
      "UPDATE leads SET ai_enabled = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [ai_enabled, id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  HELPER FUNCTIONS FOR MULTI-STAGE CONTACT SCRAPING 

function extractJsonArray(text) {
  const startIdx = text.indexOf("[");
  if (startIdx === -1) {
    throw new Error("No JSON array start bracket found in response");
  }
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === "[") {
      depth++;
    } else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        const jsonSub = text.substring(startIdx, i + 1);
        try {
          return JSON.parse(jsonSub);
        } catch (e) {
          // Ignore and continue search
        }
      }
    }
  }
  const endIdx = text.lastIndexOf("]");
  if (endIdx > startIdx) {
    const jsonSub = text.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonSub);
  }
  throw new Error("No matching closing bracket found for JSON array");
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x3A;/g, ":");
}

function cleanJsonContent(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("<!--")) cleaned = cleaned.substring(4);
  if (cleaned.endsWith("-->")) cleaned = cleaned.substring(0, cleaned.length - 3);
  return decodeHtmlEntities(cleaned.trim());
}

function cleanUrl(url) {
  if (!url) return null;
  let decoded = decodeHtmlEntities(url);
  decoded = decoded.replace(/\\u002f/g, "/").replace(/\\/g, "");
  if (decoded.startsWith("//")) {
    decoded = "http:" + decoded;
  }
  return decoded;
}

function isValidEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();

  // 1. Filter out common asset/media extensions disguised as emails
  const invalidExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico",
    ".css", ".js", ".zip", ".pdf", ".mp4", ".mp3", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot"
  ];
  if (invalidExtensions.some(ext => lower.endsWith(ext))) {
    return false;
  }

  // Split username and domain
  const parts = lower.split("@");
  if (parts.length !== 2) return false;
  const [username, domain] = parts;

  // 2. Filter out placeholder/fake domains
  const placeholderDomains = [
    "example.com", "domain.com", "yourdomain.com", "company.com", "business.com",
    "template.com", "website.com", "test.com", "email.com", "mysite.com", "site.com",
    "sentry.io", "wixpress.com", "w3.org", "schema.org", "googleapis.com",
    "gravatar.com", "wordpress.org", "wordpress.com", "squarespace.com", "wix.com",
    "shopify.com", "weebly.com", "medium.com", "pinterest.com", "linkedin.com",
    "youtube.com", "apple.com", "microsoft.com", "adobe.com", "github.com",
    "twitter.com", "instagram.com", "facebook.com"
  ];
  
  if (placeholderDomains.some(d => domain === d || domain.endsWith("." + d))) {
    return false;
  }

  // 3. Filter out placeholder usernames
  const placeholderUsernames = [
    "user", "username", "yourname", "name", "email", "your_email", "youremail",
    "test", "tester", "testing", "myemail", "placeholder", "fake", "dummy"
  ];
  if (placeholderUsernames.some(u => username === u)) {
    return false;
  }

  // 4. Exclude emails that are just template forms
  if (lower === "info@company.com" || lower === "contact@company.com" || lower === "support@company.com") {
    return false;
  }

  return true;
}

function parseYelpSearchHtml(html, defaultLocation, defaultNiche) {
  const businessesMap = new Map();

  function addBiz({ name, phone, rating, reviewCount, url, alias }) {
    if (!name) return;
    
    // Clean name
    let cleanName = decodeHtmlEntities(name).replace(/<[^>]+>/g, "").trim();
    if (!cleanName || cleanName.toLowerCase().includes("see more reviews") || cleanName.toLowerCase().includes("read more")) {
      return;
    }

    // Clean yelp detail URL
    let yelpUrl = url || "";
    if (!yelpUrl && alias) {
      yelpUrl = `/biz/${alias}`;
    }
    if (yelpUrl.includes("redirect_url=")) {
      try {
        const urlObj = new URL("https://www.yelp.com" + yelpUrl);
        const redir = urlObj.searchParams.get("redirect_url");
        if (redir) yelpUrl = redir;
      } catch (e) {}
    }
    if (yelpUrl && !yelpUrl.startsWith("http")) {
      yelpUrl = `https://www.yelp.com${yelpUrl.split("?")[0]}`;
    }

    const key = (alias || cleanName).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) return;

    // Clean phone number format
    let formattedPhone = phone || "";
    if (formattedPhone.startsWith("+1")) {
      formattedPhone = `(${formattedPhone.substring(2, 5)}) ${formattedPhone.substring(5, 8)}-${formattedPhone.substring(8)}`;
    }

    const existing = businessesMap.get(key) || {};
    // Avoid overriding clean business name with fallback links
    let finalName = cleanName;
    if (existing.name && (cleanName.toLowerCase().includes("see more") || cleanName.toLowerCase().includes("reviews") || cleanName.length < existing.name.length - 8)) {
      finalName = existing.name;
    }

    businessesMap.set(key, {
      name: finalName,
      alias: alias || existing.alias || key,
      phone: formattedPhone || existing.phone || "",
      rating: rating || existing.rating || 4.0,
      reviews: reviewCount || existing.reviews || 0,
      url: yelpUrl || existing.url || "",
      city: defaultLocation,
      type: defaultNiche
    });
  }

  // Walk JSON object to find business data
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.name && (obj.businessUrl || obj.alias || obj.rating)) {
      addBiz({
        name: obj.name,
        phone: obj.phone,
        rating: obj.rating,
        reviewCount: obj.reviewCount,
        url: obj.businessUrl || obj.url,
        alias: obj.alias
      });
    }
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === "object") {
        walk(obj[k]);
      }
    }
  }

  // 1. Scan JSON-LD script tags
  const scriptRegex = /<script\s*([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];

    if (attrs.includes("type=\"application/json\"") || attrs.includes("data-id=\"react-root-props\"") || content.includes("react_root_props")) {
      try {
        let clean = cleanJsonContent(content);
        if (content.includes("react_root_props")) {
          const propsMatch = content.match(/react_root_props\s*=\s*(\{[\s\S]+?\});/i);
          if (propsMatch) {
            clean = decodeHtmlEntities(propsMatch[1]);
          }
        }
        const parsed = JSON.parse(clean);
        walk(parsed);
      } catch (e) {}
    } else if (attrs.includes("type=\"application/ld+json\"")) {
      try {
        const clean = cleanJsonContent(content);
        const parsed = JSON.parse(clean);
        if (parsed["@type"] === "ItemList" && parsed.itemListElement) {
          for (const item of parsed.itemListElement) {
            const biz = item.item;
            if (biz && (biz["@type"] === "LocalBusiness" || biz["@type"] === "Restaurant" || biz["@type"] === "FoodEstablishment")) {
              addBiz({
                name: biz.name,
                phone: biz.telephone,
                rating: biz.aggregateRating ? parseFloat(biz.aggregateRating.ratingValue) : 4.0,
                reviewCount: biz.aggregateRating ? parseInt(biz.aggregateRating.reviewCount) : 0,
                url: biz.url
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. Fallback: Parse /biz/ links from HTML
  const bizHrefRegex = /<a[^>]+href="\/biz\/([a-zA-Z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let hrefMatch;
  while ((hrefMatch = bizHrefRegex.exec(html)) !== null) {
    const alias = hrefMatch[1];
    const innerText = hrefMatch[2].replace(/<[^>]+>/g, "").trim();
    if (innerText && !innerText.toLowerCase().includes("see all") && !innerText.toLowerCase().includes("read more")) {
      addBiz({
        name: innerText,
        alias: alias,
        url: `/biz/${alias}`
      });
    }
  }

  return Array.from(businessesMap.values());
}

function extractWebsiteFromYelpDetail(html) {
  // Method 1: Look for JSON/JS objects with website URL
  const scriptRegex = /<script\s*([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    if (content.includes("BusinessWebsite") || content.includes("website")) {
      try {
        let clean = cleanJsonContent(content);
        if (content.includes("react_root_props")) {
          const propsMatch = content.match(/react_root_props\s*=\s*(\{[\s\S]+?\});/i);
          if (propsMatch) {
            clean = decodeHtmlEntities(propsMatch[1]);
          }
        }
        const parsed = JSON.parse(clean);
        let foundUrl = null;
        function walk(obj) {
          if (!obj || foundUrl) return;
          if (obj.__typename === "BusinessWebsite" && obj.url) {
            foundUrl = obj.url;
            return;
          }
          if (obj.website && typeof obj.website === "object" && obj.website.url) {
            foundUrl = obj.website.url;
            return;
          }
          if (typeof obj === "object") {
            for (const k of Object.keys(obj)) {
              walk(obj[k]);
            }
          }
        }
        walk(parsed);
        if (foundUrl) {
          return cleanUrl(foundUrl);
        }
      } catch (e) {}
    }
  }

  // Method 2: Regex for biz_redir URL parameter
  const redirRegex = /biz_redir\?url=([^"&'\s>]+)/gi;
  let redirMatch;
  while ((redirMatch = redirRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(redirMatch[1]);
      if (!decoded.includes("facebook.com") && !decoded.includes("instagram.com") && !decoded.includes("twitter.com") && !decoded.includes("yelp.com") && !decoded.includes("google.com")) {
        return cleanUrl(decoded);
      }
    } catch(e) {}
  }
  
  // Method 3: Try to find a simple link with website_link_type=website
  const webRedirRegex = /url=([^"&'\s>]+)&amp;[^"]*website_link_type=website/i;
  const webMatch = html.match(webRedirRegex);
  if (webMatch) {
    try {
      return cleanUrl(decodeURIComponent(webMatch[1]));
    } catch(e) {}
  }
  
  return null;
}

async function crawlWebsiteForEmail(websiteUrl, logCallback = () => {}) {
  const emails = new Set();
  const phones = new Set();
  const socialLinks = { instagram: "", facebook: "" };
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive"
  };
  let hasBooking = false;
  let websiteStatus = 'active';
  const bookingKeywords = [
    "calendly.com", "acuityscheduling.com", "opentable.com", "resy.com", 
    "mindbodyonline.com", "vagaro.com", "schedulicity.com", "wa.me", 
    "whatsapp.com/send", "square.site", "bookeo.com", "simplybook.me", 
    "setmore.com", "10to8.com"
  ];

  try {
    let res;
    let retries = 0;
    const maxRetries = 2;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    while (retries <= maxRetries) {
      try {
        res = await fetch(websiteUrl, { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          if (res.status === 429 && retries < maxRetries) {
            retries++;
            logCallback("warn", `[-] Rate limit (429) hit on ${websiteUrl}. Retrying in ${retries * 2}s...`);
            await sleep(retries * 2000);
            continue;
          }
          if ([401, 403, 429].includes(res.status)) {
            websiteStatus = 'active';
          } else {
            websiteStatus = 'down';
          }
          throw new Error(`HTTP status ${res.status}`);
        }
        websiteStatus = 'active';
        break;
      } catch (err) {
        const errCode = err.cause?.code || err.code;
        const isTimeout = err.name === 'TimeoutError' || err.code === 'UND_ERR_HEADERS_TIMEOUT' || err.message?.includes('timeout');
        const isDnsRetryable = errCode === 'EAI_AGAIN';

        if (retries < maxRetries && (isTimeout || isDnsRetryable)) {
          retries++;
          const reason = isDnsRetryable ? "DNS lookup timeout (EAI_AGAIN)" : "Timeout/Network error";
          logCallback("warn", `[-] ${reason} on ${websiteUrl}. Retrying in ${retries * 1.5}s (retry ${retries}/${maxRetries})...`);
          await sleep(retries * 1500);
          continue;
        }

        if (errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errCode === 'EHOSTUNREACH' || errCode === 'ENETUNREACH' || errCode === 'EAI_AGAIN') {
          websiteStatus = 'down';
        } else {
          websiteStatus = 'active';
        }
        throw err;
      }
    }

    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // Check for booking links on homepage
    for (const kw of bookingKeywords) {
      if (lowerHtml.includes(kw)) {
        hasBooking = true;
        break;
      }
    }
    if (!hasBooking) {
      if (lowerHtml.includes("book online") || lowerHtml.includes("book now") || 
          lowerHtml.includes("make reservation") || lowerHtml.includes("scheduling") || 
          lowerHtml.includes("appointment")) {
        hasBooking = true;
      }
    }

    // 1. Search for emails on homepage
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const homepageEmails = html.match(emailRegex) || [];
    for (const email of homepageEmails) {
      if (isValidEmail(email)) {
        emails.add(email.toLowerCase().trim());
      } else {
        const lowerEmail = email.toLowerCase().trim();
        const isAsset = [
          ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico",
          ".css", ".js", ".zip", ".pdf", ".mp4", ".mp3", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot"
        ].some(ext => lowerEmail.endsWith(ext));
        if (!isAsset) {
          logCallback("warn", `[-] Ignored placeholder email: ${email}`);
        }
      }
    }

    // 2. Search for phone numbers on homepage
    const telMatch = html.match(/href=["']tel:([^"']+)["']/gi);
    if (telMatch) {
      for (const tm of telMatch) {
        const ph = tm.replace(/href=["']tel:/i, "").replace(/["']/g, "").replace(/%20/g, " ").trim();
        if (ph.length > 5) phones.add(ph);
      }
    }
    const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
    let pMatch;
    while ((pMatch = phoneRegex.exec(html)) !== null) {
      const formatted = `(${pMatch[1]}) ${pMatch[2]}-${pMatch[3]}`;
      phones.add(formatted);
    }

    // 3. Find social links on homepage
    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
    if (igMatch) socialLinks.instagram = "@" + igMatch[1].replace(/\/$/, "").split(/[?#]/)[0];
    const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.-]+)/i);
    if (fbMatch) socialLinks.facebook = "https://facebook.com/" + fbMatch[1].replace(/\/$/, "").split(/[?#]/)[0];

    // 4. Find contact page link
    const linkRegex = /href=["']([^"']*(?:contact|about|info|reach|connect|help|support)[^"']*)["']/gi;
    let match;
    const subpagesToCrawl = new Set();
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1].trim();
      try {
        const absoluteUrl = new URL(href, websiteUrl).toString();
        if (new URL(absoluteUrl).hostname === new URL(websiteUrl).hostname) {
          subpagesToCrawl.add(absoluteUrl);
        }
      } catch (e) {}
    }

    const subpages = Array.from(subpagesToCrawl).slice(0, 2);
    if (subpages.length > 0) {
      logCallback("info", `[-] Searching website subpages: ${subpages.map(s => {
        try { return new URL(s).pathname; } catch (e) { return s; }
      }).join(", ")}`);
    }

    // Crawl first 2 subpages
    for (const subpage of subpages) {
      try {
        const subRes = await fetch(subpage, { headers, signal: AbortSignal.timeout(8000) });
        if (subRes.ok) {
          const subHtml = await subRes.text();
          const subLowerHtml = subHtml.toLowerCase();

          // Check subpage for booking links
          if (!hasBooking) {
            for (const kw of bookingKeywords) {
              if (subLowerHtml.includes(kw)) {
                hasBooking = true;
                break;
              }
            }
            if (!hasBooking) {
              if (subLowerHtml.includes("book online") || subLowerHtml.includes("book now") || 
                  subLowerHtml.includes("make reservation") || subLowerHtml.includes("scheduling") || 
                  subLowerHtml.includes("appointment")) {
                hasBooking = true;
              }
            }
          }

          const subEmails = subHtml.match(emailRegex) || [];
          for (const email of subEmails) {
            if (isValidEmail(email)) {
              emails.add(email.toLowerCase().trim());
            } else {
              const lowerEmail = email.toLowerCase().trim();
              const isAsset = [
                ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico",
                ".css", ".js", ".zip", ".pdf", ".mp4", ".mp3", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot"
              ].some(ext => lowerEmail.endsWith(ext));
              if (!isAsset) {
                logCallback("warn", `[-] Ignored placeholder email: ${email}`);
              }
            }
          }

          const subTelMatch = subHtml.match(/href=["']tel:([^"']+)["']/gi);
          if (subTelMatch) {
            for (const tm of subTelMatch) {
              const ph = tm.replace(/href=["']tel:/i, "").replace(/["']/g, "").replace(/%20/g, " ").trim();
              if (ph.length > 5) phones.add(ph);
            }
          }
          let spMatch;
          while ((spMatch = phoneRegex.exec(subHtml)) !== null) {
            const formatted = `(${spMatch[1]}) ${spMatch[2]}-${spMatch[3]}`;
            phones.add(formatted);
          }
        }
      } catch (subErr) {
        logCallback("warn", `[-] Failed to crawl subpage ${subpage}: ${subErr.message}`);
      }
    }

    return { emails: Array.from(emails), phones: Array.from(phones), socials: socialLinks, hasBooking, websiteStatus };

  } catch (err) {
    logCallback("warn", `[-] Website crawl failed for ${websiteUrl}: ${err.message}`);
    if (websiteStatus === 'active') {
      const errCode = err.cause?.code || err.code;
      if (errCode === 'ENOTFOUND' || errCode === 'ECONNREFUSED' || errCode === 'EHOSTUNREACH' || errCode === 'ENETUNREACH') {
        websiteStatus = 'down';
      }
    }
    return { emails: [], phones: [], socials: socialLinks, hasBooking: false, websiteStatus };
  }
}

function getLeadQualification(lead, pitchOffer, hasBooking = false, requiredContact = 'email_or_phone', strictFilter = true) {
  const email = lead.email;
  const phone = lead.phone;
  const instagram = lead.instagram;
  const linkedin = lead.linkedin;
  const facebook = lead.facebook;
  const whatsapp = lead.whatsapp;
  const twitter = lead.twitter;

  const hasEmail = !!(email && email.trim());
  const hasPhone = !!(phone && phone.trim());
  const hasInsta = !!(instagram && instagram.trim() && instagram !== "null");
  const hasLinkedin = !!(linkedin && linkedin.trim() && linkedin !== "null");
  const hasFacebook = !!(facebook && facebook.trim() && facebook !== "null");
  const hasWhatsapp = !!(whatsapp && whatsapp.trim() && whatsapp !== "null");
  const hasTwitter = !!(twitter && twitter.trim() && twitter !== "null");
  
  const hasAnySocial = hasInsta || hasLinkedin || hasFacebook || hasTwitter;

  if (requiredContact === 'email') {
    if (!hasEmail) return { isMatch: false, reason: "missing required email address" };
  } else if (requiredContact === 'phone') {
    if (!hasPhone) return { isMatch: false, reason: "missing required phone number" };
  } else if (requiredContact === 'instagram') {
    if (!hasInsta) return { isMatch: false, reason: "missing required Instagram profile" };
  } else if (requiredContact === 'linkedin') {
    if (!hasLinkedin) return { isMatch: false, reason: "missing required LinkedIn profile" };
  } else if (requiredContact === 'facebook') {
    if (!hasFacebook) return { isMatch: false, reason: "missing required Facebook profile" };
  } else if (requiredContact === 'whatsapp') {
    if (!hasWhatsapp) return { isMatch: false, reason: "missing required WhatsApp detail" };
  } else if (requiredContact === 'any_social') {
    if (!hasAnySocial) return { isMatch: false, reason: "missing required social media links (Instagram, LinkedIn, Facebook, or Twitter)" };
  } else if (requiredContact === 'email_and_social') {
    if (!hasEmail || !hasAnySocial) return { isMatch: false, reason: "requires both an email address and at least one social media link" };
  } else if (requiredContact === 'all') {
    if (!hasEmail || !hasPhone || !hasAnySocial) return { isMatch: false, reason: "requires email address, phone number, and at least one social media link" };
  } else if (requiredContact === 'email_or_phone') {
    if (!hasEmail && !hasPhone) return { isMatch: false, reason: "missing contact details (requires email or phone)" };
  } else if (requiredContact === 'any') {
    // no constraints
  }

  if (strictFilter) {
    const status = lead.website_status || 'unknown';
    if (pitchOffer === "website_dev") {
      return { isMatch: true };
    }
    if (pitchOffer === "whatsapp_bot") {
      if (status === "active" && hasBooking) {
        return { isMatch: false, reason: `already has online booking tools on active website` };
      }
      return { isMatch: true };
    }
  }

  return { isMatch: true };
}

function isLeadMatchingService(lead, pitchOffer, hasBooking = false, requiredContact = 'email_or_phone') {
  return getLeadQualification(lead, pitchOffer, hasBooking, requiredContact).isMatch;
}

async function fetchGeminiWithRetry(url, options, logCallback = () => {}, maxRetries = 3) {

  let promptText = "";
  try {
    const bodyObj = JSON.parse(options.body);
    // If it's a chat sequence with multiple contents
    if (bodyObj.contents && Array.isArray(bodyObj.contents)) {
      if (bodyObj.contents.length > 1 || (bodyObj.contents[0] && bodyObj.contents[0].role)) {
        const partsText = bodyObj.contents.map(c => `${c.role === "user" ? "User" : "AI"}: ${c.parts?.[0]?.text || ""}`).join("\n");
        const systemText = bodyObj.systemInstruction?.parts?.[0]?.text || "";
        promptText = `${systemText ? `Instructions: ${systemText}\n\n` : ""}Conversation history:\n${partsText}\n\nAssistant reply:`;
      } else {
        promptText = bodyObj.contents[0]?.parts?.[0]?.text || "";
      }
    } else {
      promptText = bodyObj.contents?.[0]?.parts?.[0]?.text || "";
    }
  } catch (e) {
    console.error("Failed to parse prompt from fetch options:", e);
  }

  if (!promptText) {
    throw new Error("Prompt text is empty or invalid");
  }

  let attempt = 0;
  while (attempt <= maxRetries) {
    console.log(`[AI AGENT] Attempting to route prompt to Antigravity CLI (agy -p) [Attempt ${attempt + 1}/${maxRetries + 1}]...`);
    try {
      const agyResponse = await new Promise((resolve, reject) => {
        const child = spawn("agy", ["--print-timeout", "20m", "-p", promptText]);
        let stdout = "";
        let stderr = "";

        const timeoutId = setTimeout(() => {
          child.kill();
          reject(new Error("Antigravity CLI (agy) request timed out."));
        }, 900000); // 15 minutes timeout

        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("close", (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`ExitCode:${code} Stderr:${stderr.trim()}`));
          }
        });

        child.on("error", (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      const lowerResp = agyResponse.toLowerCase();
      if (lowerResp.includes("too many requests") || lowerResp.includes("rate limit") || lowerResp.includes("quota exceeded") || lowerResp.includes("resource has been exhausted") || /\b429\b/.test(lowerResp)) {
        throw new Error(`Rate limit or quota error inside agy output: ${agyResponse}`);
      }

      // Mock the Gemini response JSON format
      const mockData = {
        candidates: [{
          content: {
            parts: [{
              text: agyResponse
            }]
          }
        }]
      };

      console.log(`[AI AGENT] Antigravity CLI (agy) executed successfully.`);
      return {
        ok: true,
        status: 200,
        json: async () => mockData,
        text: async () => JSON.stringify(mockData)
      };

    } catch (err) {
      console.warn(`[AI AGENT] [Attempt ${attempt + 1}/${maxRetries + 1}] Antigravity CLI (agy) failed: ${err.message}`);
      
      attempt++;
      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
        console.log(`[AI AGENT] Waiting ${Math.round(delay)}ms before agy retry...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[AI AGENT] All Antigravity CLI (agy) retries failed: ${err.message}`);
        throw new Error(`Antigravity CLI (agy) failed after ${maxRetries + 1} attempts: ${err.message}`);
      }
    }
  }
}

async function sendGeminiErrorEmail(userId, contextDescription, errorMessage) {
  try {
    const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
    const userEmail = userRes.rows[0]?.email;
    if (!userEmail) return;

    const settingsRes = await pool.query("SELECT gmail_user, gmail_pass FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
    const gmailUser = settingsRes.rows[0]?.gmail_user;
    const gmailPass = decryptText(settingsRes.rows[0]?.gmail_pass);

    if (!gmailUser || !gmailPass) {
      console.warn(`[NOTIFY EMAIL FAIL] No Gmail SMTP credentials configured for User ${userId}. Cannot send error notification email.`);
      return;
    }

    const nodemailer = await import("nodemailer");
    const transporter = getSmtpTransport(nodemailer.default, { email: gmailUser, pass: gmailPass });

    const subject = ` ACTION REQUIRED: Gemini API Key Error Detected during ${contextDescription}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
        <h2 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 10px;">Gemini API Error Detected</h2>
        <p>Hello,</p>
        <p>Our platform encountered a critical error while communicating with the Gemini API for your account.</p>
        <div style="background-color: #f9f2f2; border-left: 4px solid #d9534f; padding: 10px 15px; margin: 20px 0; font-family: monospace;">
          <strong>Operation Context:</strong> ${contextDescription}<br/>
          <strong>API Error Details:</strong> ${errorMessage}
        </div>
        <p><strong>Action Required:</strong></p>
        <p>Since this is a SaaS platform where you configure and use your own API credentials, please check, change, or recharge your Gemini API key under the <strong>Settings</strong> page in your dashboard.</p>
        <p>Until this key is updated, your outreach campaigns, lead qualifications, and AI copywriting features will remain paused.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #777;">This is an automated system notification from your Lead Generator Platform.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"${gmailUser.split('@')[0]}" <${gmailUser}>`,
      to: userEmail,
      subject,
      html: htmlBody
    });
    console.log(`[NOTIFY EMAIL SUCCESS] Sent Gemini API error email to User ${userEmail}`);
  } catch (err) {
    console.error("[NOTIFY EMAIL ERROR] Failed to send Gemini API error email:", err.message);
  }
}

async function handleGeminiError(userId, err, contextDescription) {
  const errMsg = err.message || err.toString();
  console.error(`[GEMINI ERROR DETECTED] User ${userId} context: ${contextDescription}. Error:`, errMsg);

  // 1. Insert a system notification into the user's Inbox (emails table)
  try {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await pool.query(
      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), FALSE, 'system', ARRAY['unread', 'system-error'], $6)`,
      [
        'Gemini AI Assistant',
        'system@platform.com',
        'SaaS AI Node',
        ' Gemini API Key Action Required',
        `An error occurred during ${contextDescription}: "${errMsg}". Please check, change, or recharge your Gemini API key in Settings.`,
        userId
      ]
    );
    console.log(`[GEMINI ERROR NOTI] Inserted system notification in Inbox for User ${userId}`);
  } catch (dbErr) {
    console.error(`[GEMINI ERROR NOTI FAIL] Failed to insert system notification for User ${userId}:`, dbErr.message);
  }

  // 2. Send an email notification to the user
  await sendGeminiErrorEmail(userId, contextDescription, errMsg);
}

async function qualifyLeadsWithAI(leads, pitchOffer, customOfferDetails, apiKey) {
  if (leads.length === 0) return [];

  const promptText = `
You are an expert B2B lead qualification agent.
The user is running an outreach campaign for the following service:
- Campaign Offer Type: ${pitchOffer}
- Custom Pitch Details: ${customOfferDetails || 'None provided'}

Here is a list of local businesses we found and crawled:
${JSON.stringify(leads.map(l => ({
  name: l.name,
  type: l.type,
  city: l.city,
  email: l.email,
  phone: l.phone,
  rating: l.rating,
  reviews: l.reviews,
  website: l.website,
  website_status: l.website_status,
  hasBooking: l.hasBooking,
  instagram: l.instagram,
  owner_name: l.owner_name || null,
  owner_role: l.owner_role || null,
  owner_contact: l.owner_contact || null
})), null, 2)}

Instructions:
1. For each business, determine if they are a high-potential lead for the campaign offer.
2. Follow these standard guidelines:
   - "website_dev": Prioritize businesses with no website, down/broken websites, or outdated/slow websites that need a complete redesign.
   - "whatsapp_bot": Prioritize popular reservation-based businesses (e.g. cafes, restaurants, salons, spas) that do NOT already have a booking scheduler or booking widget on their website.
   - "ai_chatbot": Prioritize businesses with active social media channels (e.g. Instagram, Facebook) but no automated FAQ/customer service reply flow.
   - "custom": Carefully verify that the business fits the custom offer pitch details: ${customOfferDetails}.
3. CRITICAL: A business MUST have either a public email address or a phone number to qualify. If both are null/empty, mark them as unqualified (isMatch = false) with the reason "missing contact details".
4. Review the decision-maker profile (owner_name, owner_role, owner_contact). If present, utilize this to personalize the qualification reason.
5. Provide a qualification score from 0 to 100 based on the following potential pain points breakdown:
   - Website outdated / down / missing: +20 max
   - No chatbot / customer support agent: +10 max
   - No online booking / scheduler widget: +15 max
   - Slow website loading speed / technical issues: +10 max
   - Lacks AI automation: +15 max
   - Poor user experience or bad layout: +20 max
   - Low reviews or rating counts: +5 max
   - Inactive or missing social media presence: +5 max
6. Provide a personalized, direct reason (saved as qualification log) explaining exactly why they match the pain points of the service (if qualifies) or why they were skipped/rejected (if unqualified). This reason should include details on their website status, presence/absence of automation, and their owner details.

Return your response as a valid JSON array of objects. Each object must have these exact keys:
"name" (string), "isMatch" (boolean), "score" (integer, 0-100), "reason" (string)

Return ONLY the JSON array. Do not output any conversational text.
`;

  try {
    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(30000)
      },
      (type, text) => console.log(`[QUALIFICATION RETRY] [${type.toUpperCase()}] ${text}`),
      3
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    return extractJsonArray(text);
  } catch (err) {
    console.error("Error in AI lead qualification:", err.message);
    throw err;
  }
}

app.post("/api/scan", authenticate, scanRateLimit, async (req, res) => {
  const { niche, location, limit: reqLimit } = req.body;

  let scanId;
  try {
    const insertScan = await pool.query(
      "INSERT INTO scans (user_id, status, logs, progress) VALUES ($1, 'running', $2, 0) RETURNING id",
      [req.userId, JSON.stringify([{ type: "info", text: "Initializing scanner engine..." }])]
    );
    scanId = insertScan.rows[0].id;
    res.json({ scan_id: scanId });
  } catch (err) {
    console.error("Failed to create scan row:", err.message);
    return res.status(500).json({ error: "Failed to initialize scan" });
  }

  setImmediate(async () => {
    const searchLogs = [{ type: "info", text: "Initializing scanner engine..." }];

    const addLog = (text) => {
      let type = "info";
      if (text.includes("[WARN]")) {
        type = "warn";
      } else if (text.includes("[ERROR]") || text.includes("[danger]") || text.toLowerCase().includes("failed")) {
        type = "danger";
      } else if (text.includes("[SUCCESS]") || text.toLowerCase().includes("success") || text.toLowerCase().includes("saved")) {
        type = "success";
      }
      
      console.log(`[SCAN LOG] [${type.toUpperCase()}] ${text}`);
      searchLogs.push({ type, text });
      
      let progress = 5;
      if (text.includes("Stage 1 Completed")) {
        progress = 40;
      } else if (text.includes("Pipeline finished")) {
        progress = 100;
      } else {
        const leadMatch = text.match(/\[Lead\s+(\d+)\/(\d+)\]/i);
        if (leadMatch) {
          const current = parseInt(leadMatch[1], 10);
          const total = parseInt(leadMatch[2], 10);
          progress = 40 + Math.round((current / (total || 1)) * 55);
        } else if (searchLogs.length > 2) {
          progress = Math.min(35, 5 + Math.round(searchLogs.length * 1.5));
        }
      }
      
      pool.query(
        "UPDATE scans SET logs = $1, progress = $2 WHERE id = $3",
        [JSON.stringify(searchLogs), progress, scanId]
      ).catch(e => console.error("Failed to update scan logs in DB:", e.message));
    };

    try {
      const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
      const config = settingsRes.rows[0] ? decryptConfig(settingsRes.rows[0]) : {};
      
      const userRes = await pool.query("SELECT subscription_tier FROM users WHERE id = $1", [req.userId]);
      const userTier = (userRes.rows[0]?.subscription_tier || "agency").toLowerCase();
      let maxLimit = 50;
      if (userTier === "free") maxLimit = 5;
      else if (userTier === "growth") maxLimit = 25;

      const resolvedLimit = Math.min(maxLimit, parseInt(reqLimit || config.daily_lead_limit || 5, 10));
      const resolvedNiche = niche || config.niche || "Cafes";
      const resolvedLocation = location || config.location || "Austin, TX";

      addLog(`[PIPELINE] Resolved parameters - Niche: "${resolvedNiche}", Location: "${resolvedLocation}", Limit: ${resolvedLimit}`);
      
      const processedLeads = await runScraperPipeline({
        userId: req.userId,
        niche: resolvedNiche,
        location: resolvedLocation,
        limit: resolvedLimit,
        scanId,
        addLog
      });

      const scanStatusRes = await pool.query("SELECT status FROM scans WHERE id = $1", [scanId]);
      if (scanStatusRes.rowCount > 0 && scanStatusRes.rows[0].status === "stopped") {
        addLog(`[PIPELINE] Lead Finder process stopped by user. ${processedLeads.length} leads processed.`);
      } else {
        addLog(`[PIPELINE] Lead Finder process completed. ${processedLeads.length} leads processed successfully.`);
        await pool.query(
          "UPDATE scans SET status = 'completed', progress = 100 WHERE id = $1",
          [scanId]
        );
        
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.userId, ` Scan Completed`, `Found and qualified ${processedLeads.length} leads for '${resolvedNiche}' in ${resolvedLocation}.`, 'system', 'Leads']
          );
        } catch (notifErr) {
          console.error("Failed to insert scan notification:", notifErr.message);
        }
      }

    } catch (err) {
      addLog(`[PIPELINE] [ERROR] Lead scanning failed: ${err.message}`);
      await pool.query(
        "UPDATE scans SET status = 'failed', error = $1 WHERE id = $2",
        [err.message, scanId]
      );
    }
  });
});


async function getAvailableOutbox(userId, config) {
  try {
    const outboxes = await pool.query(
      "SELECT * FROM user_outboxes WHERE user_id = $1 AND is_active = TRUE ORDER BY daily_sent_count ASC, id ASC",
      [userId]
    );
    
    const todayStr = new Date().toDateString();
    for (const outbox of outboxes.rows) {
      const lastSentDate = outbox.last_sent_at ? new Date(outbox.last_sent_at).toDateString() : null;
      let sentCount = outbox.daily_sent_count;
      if (lastSentDate !== todayStr) {
        await pool.query("UPDATE user_outboxes SET daily_sent_count = 0, last_sent_at = NOW() WHERE id = $1", [outbox.id]);
        sentCount = 0;
      }
      
      if (sentCount < outbox.daily_sent_limit) {
        const decryptedPass = decryptText(outbox.password);
        return {
          email: outbox.email,
          pass: decryptedPass,
          id: outbox.id,
          isCustom: true,
          smtp_host: outbox.smtp_host || null,
          smtp_port: outbox.smtp_port || null,
        };
      }
    }
  } catch (err) {
    console.error("[OUTBOX ROTATION] Error selecting custom outbox:", err.message);
  }
  
  // Fallback to campaign_settings gmail credentials if none available or limits reached
  if (config.gmail_user && config.gmail_pass) {
    return {
      email: config.gmail_user,
      pass: decryptText(config.gmail_pass),
      id: null,
      isCustom: false,
      smtp_host: config.smtp_host || null,
      smtp_port: config.smtp_port || null,
    };
  }
  
  return null;
}


function formatProfessionalEmailHtml(bodyText, config = {}) {
  if (!bodyText) return "";
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const portfolioUrl = config.portfolio_url || "noryvex.com";
  const socialLinkedin = config.social_linkedin || "";
  const socialTwitter = config.social_twitter || "";

  let signatureTitle = senderRole;
  if (useCompany && companyName) {
    signatureTitle = `${senderRole} · ${companyName}`;
  }

  // Split plain text into paragraphs
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const mainParagraphsHtml = paragraphs.map(p => {
    const htmlPara = p.replace(/\n/g, "<br/>");
    return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #1e293b;">${htmlPara}</p>`;
  }).join("");

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 24px 16px; background-color: #ffffff;">
  ${mainParagraphsHtml}

  <!-- Executive Professional Signature Block -->
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
    <div style="font-weight: 700; font-size: 16px; color: #0f172a; letter-spacing: -0.01em;">${senderName}</div>
    <div style="font-size: 13.5px; color: #64748b; margin-top: 2px; font-weight: 500;">${signatureTitle}</div>
    ${portfolioUrl ? `<div style="margin-top: 8px;"><a href="${portfolioUrl.startsWith('http') ? portfolioUrl : 'https://' + portfolioUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13.5px; font-weight: 600;">🌐 ${portfolioUrl}</a></div>` : ''}
    ${(socialLinkedin || socialTwitter) ? `
      <div style="margin-top: 10px; font-size: 12.5px; color: #94a3b8; display: flex; gap: 12px;">
        ${socialLinkedin ? `<a href="${socialLinkedin}" target="_blank" style="color: #475569; text-decoration: none;">💼 LinkedIn</a>` : ''}
        ${socialTwitter ? `<a href="${socialTwitter}" target="_blank" style="color: #475569; text-decoration: none;">🐦 Twitter/X</a>` : ''}
      </div>
    ` : ''}
  </div>
</div>
  `.trim();
}

async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const portfolioUrl = config.portfolio_url || "noryvex.com";

  // Decision maker greeting
  const recipientName = lead.owner_name ? lead.owner_name.split(' ')[0] : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";

  // Custom Icebreaker from research or fallback
  let icebreaker = lead.personalized_icebreaker;
  if (!icebreaker || icebreaker.length < 5) {
    icebreaker = `Noticed ${lead.name} has a great local presence in ${lead.city || "your area"}.`;
  }

  const pitchOffer = config.pitch_offer || "whatsapp_bot";
  const customOfferDetails = config.custom_offer_details || "";

  let offerShort = "a custom AI booking assistant to handle client requests 24/7";
  if (pitchOffer === "website_dev") {
    offerShort = "a high-performing website overhaul that converts web traffic into bookings";
  } else if (pitchOffer === "ai_chatbot") {
    offerShort = "an automated AI receptionist for website & Instagram inquiry response";
  } else if (pitchOffer === "custom" && customOfferDetails) {
    offerShort = customOfferDetails;
  }

  const templateIndex = Math.abs(lead.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 4;

  let subject = `Quick question for ${lead.name}`;
  let body = `${greeting}\n\n${icebreaker}\n\nI build ${offerShort} without adding to front-desk workload.\n\nTook me a minute to sketch how it would look for ${lead.name}. Open to a 2-minute preview?\n\nBest,\n${senderName}${portfolioUrl ? `\n${portfolioUrl}` : ""}`;

  if (templateIndex === 1) {
    subject = `Idea for ${lead.name}`;
    body = `${greeting}\n\n${icebreaker}\n\nAre you currently looking to automate online bookings or customer inquiries for ${lead.name} this quarter?\n\nI help local businesses implement simple, automated tools that handle inquiries instantly.\n\nShould I send over a quick 30-second preview of how it would look?\n\nCheers,\n${senderName}`;
  } else if (templateIndex === 2) {
    subject = `Question regarding ${lead.name}`;
    body = `${greeting}\n\n${icebreaker}\n\nI'm a developer helping companies in ${lead.city || "your area"} streamline customer booking & website leads.\n\nWould you be open to seeing a 10-second mock-up of what an automated scheduling widget would look like for ${lead.name}?\n\nBest regards,\n${senderName}`;
  } else if (templateIndex === 3) {
    subject = `${lead.name} outreach`;
    body = `${greeting}\n\n${icebreaker}\n\nIf improving online conversions or automating client scheduling is on your radar for ${lead.name}, I'd love to share a quick idea.\n\nWorth a 2-minute look this week?\n\nThanks,\n${senderName}`;
  }

  return { subject, body };
}

async function syncUserInbox(userId, config) {
  const { gmail_user, gmail_pass } = config;
  if (!gmail_user || !gmail_pass) {
    console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Gmail credentials not configured. Skipping sync.`);
    return { success: false, error: "Gmail SMTP/IMAP credentials not connected. Please connect Gmail under settings." };
  }

  //  Ensure new columns exist (safe inline migration for when startup migrations failed) 
  try {
    await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS email_uid VARCHAR(150) DEFAULT NULL;`);
    await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS followup_number INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_uid ON emails(user_id, email_uid) WHERE email_uid IS NOT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP DEFAULT NULL;`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_strategy JSONB DEFAULT NULL;`);
  } catch (migErr) {
    console.warn(`[EMAIL AGENT] [SYNC] Inline migration warning (non-fatal): ${migErr.message}`);
  }
  const emailLower = (gmail_user || "").toLowerCase();
  let imapHost = null;
  let imapPort = 993;
  if (emailLower.endsWith("@gmail.com") || emailLower.endsWith("@googlemail.com")) { imapHost = "imap.gmail.com"; }
  else if (emailLower.endsWith("@outlook.com") || emailLower.endsWith("@hotmail.com") || emailLower.endsWith("@live.com") || emailLower.endsWith("@msn.com")) { imapHost = "outlook.office365.com"; }
  else if (emailLower.endsWith("@yahoo.com") || emailLower.endsWith("@ymail.com")) { imapHost = "imap.mail.yahoo.com"; }
  else if (emailLower.endsWith("@icloud.com") || emailLower.endsWith("@me.com") || emailLower.endsWith("@mac.com")) { imapHost = "imap.mail.me.com"; }
  else if (emailLower.endsWith("@zoho.com") || emailLower.endsWith("@zohomail.com")) { imapHost = "imap.zoho.com"; }
  else {
    try {
      const outboxRes = await pool.query("SELECT smtp_host, imap_host, imap_port FROM user_outboxes WHERE user_id = $1 AND email = $2 LIMIT 1", [userId, gmail_user]);
      if (outboxRes.rowCount > 0) {
        const ob = outboxRes.rows[0];
        imapHost = ob.imap_host || ob.smtp_host || null;
        imapPort = ob.imap_port || 993;
      }
    } catch (e) { console.warn("[EMAIL AGENT] [SYNC] Could not fetch outbox host:", e.message); }
    // Also check campaign_settings for stored smtp_host/imap_host
    if (!imapHost) {
      try {
        const csRes = await pool.query("SELECT smtp_host, imap_host, imap_port FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
        if (csRes.rowCount > 0) {
          const cs = csRes.rows[0];
          imapHost = cs.imap_host || cs.smtp_host || null;
          if (cs.imap_port) imapPort = cs.imap_port;
        }
      } catch(e) { /* ignore */ }
    }
    if (!imapHost) { const domain = emailLower.split("@")[1] || ""; imapHost = "mail." + domain; }
  }
  console.log(`[EMAIL AGENT] [SYNC] Connecting to IMAP (${imapHost}:${imapPort}) for User ${userId} (${gmail_user})...`);
  // Fetch all leads for this user to match incoming senders
  const leadsRes = await pool.query(
    "SELECT id, name, email, ai_enabled, status, sent_pitch_id FROM leads WHERE user_id = $1 AND email IS NOT NULL AND status != 'trashed'",
    [userId]
  );
  if (leadsRes.rowCount === 0) {
    console.log(`[EMAIL AGENT] [SYNC] User ${userId}: No active leads in database. Skipping mailbox check.`);
    return { success: true, count: 0 };
  }

  const leadsMap = new Map();
  for (const lead of leadsRes.rows) {
    leadsMap.set(lead.email.toLowerCase().trim(), lead);
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: {
      user: gmail_user,
      pass: gmail_pass
    },
    logger: false,
    clientInfo: {
      name: "Syntek-SaaS"
    }
  });

  client.on("error", (err) => {
    console.error(`[EMAIL AGENT] [SYNC ERROR] ImapFlow encountered an error for User ${userId}:`, err.message);
  });

  try {
    await client.connect();
    
    // Select and lock INBOX in a single safe block
    const lock = await client.getMailboxLock("INBOX");
    let newRepliesCount = 0;
    
    try {
      const totalMessages = client.mailbox.exists;
      console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Connected. Inbox count: ${totalMessages}`);

      if (totalMessages > 0) {
        // Check last 100 messages to keep sync fast and thorough
        const startRange = Math.max(1, totalMessages - 100);
        const range = `${startRange}:${totalMessages}`;
        
        for await (let message of client.fetch(range, { envelope: true, bodyParts: ['1'] })) {
          if (!message.envelope || !message.envelope.from || message.envelope.from.length === 0) continue;
          
          const fromEmail = message.envelope.from[0].address.toLowerCase().trim();
          const subject = message.envelope.subject || "No Subject";
          const date = message.envelope.date;

          // Detect mail delivery bounce notifications (invalid/non-existent addresses)
          const isBounceSender = fromEmail.includes("mailer-daemon") || fromEmail.includes("postmaster") || fromEmail.includes("noreply") || fromEmail.includes("no-reply");
          const isBounceSubject = /delivery status notification|undeliverable|delivery failure|returned mail|bounce|address not found|couldn't be delivered|mail delivery failed|failure notice/i.test(subject);

          if (isBounceSender || isBounceSubject) {
            let bodyPreview = "";
            const bodyBuffer = message.bodyParts ? message.bodyParts.get('1') : null;
            if (bodyBuffer) {
              let text = bodyBuffer.toString('utf-8');
              text = text.replace(/<[^>]*>/g, ' ');
              text = text.replace(/\s+/g, ' ').trim();
              bodyPreview = text.toLowerCase();
            }

            // Also check subject for bounce keywords if body scan fails
            const bounceBodyKeywords = ["address couldn't be found", "couldn't be delivered", "address not found", "unable to receive email", "550", "5.1.1", "user unknown", "no such user", "account does not exist", "delivery has failed"];
            const isBounceBody = bounceBodyKeywords.some(kw => bodyPreview.includes(kw)) || isBounceSubject;

            if (isBounceBody || bodyPreview) {
              for (const emailKey of leadsMap.keys()) {
                // Skip empty email keys  "".includes("") is always true and causes false matches
                if (!emailKey || emailKey.length < 6) continue;
                if (bodyPreview.includes(emailKey) || subject.toLowerCase().includes(emailKey)) {
                  const bouncedLead = leadsMap.get(emailKey);
                  const autoResOnBounce = config.auto_rereserach_on_bounce !== false;
                  if (autoResOnBounce) {
                    console.log(`[EMAIL AGENT] [SYNC BOUNCE] Bounce detected for lead: ${bouncedLead.name} (${emailKey}). Moving to Re-research.`);
                    await pool.query(
                      "UPDATE leads SET status = 'no_email', pipeline_stage = 'Re-research', re_research_attempts = 0 WHERE id = $1 AND user_id = $2",
                      [bouncedLead.id, userId]
                    );
                  } else {
                    console.log(`[EMAIL AGENT] [SYNC BOUNCE] Bounce detected for lead: ${bouncedLead.name} (${emailKey}). Auto-rerouting disabled: archiving.`);
                    await pool.query(
                      "UPDATE leads SET status = 'archived', pipeline_stage = 'Archived' WHERE id = $1 AND user_id = $2",
                      [bouncedLead.id, userId]
                    );
                  }
                  // Mark all this lead's emails as bounced
                  await pool.query(
                    "UPDATE emails SET labels = array_append(labels, 'bounced') WHERE from_email = $1 AND user_id = $2 AND NOT ('bounced' = ANY(labels))",
                    [emailKey, userId]
                  );
                  // Delete the mailer-daemon bounce notification from inbox (it's noise, not a real reply)
                  await pool.query(
                    "DELETE FROM emails WHERE from_email ILIKE '%mailer-daemon%' AND user_id = $1 AND time_received > NOW() - INTERVAL '1 hour'",
                    [userId]
                  );
                  // Notify user
                  try {
                    await pool.query(
                      `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'system', 'Pipeline')`,
                      [userId, ` Bounced Email: ${bouncedLead.name}`, autoResOnBounce ? `Email bounced. Lead moved to Re-research for email lookup.` : `Email bounced. Lead moved to Archived.`]
                    );
                  } catch (_) {}
                  break;
                }
              }
            }
            continue; // Skip normal processing for bounce notification
          }

          // Check if this matches a lead email
          const matchedLead = leadsMap.get(fromEmail);
          if (matchedLead) {
            const messageId = message.envelope.messageId || null;
            // Build a robust email_uid: prefer Gmail UID (message.uid), fallback to messageId, then hash of email+subject+date
            const emailUid = message.uid
              ? `uid:${userId}:${message.uid}`
              : messageId
                ? `mid:${messageId}`
                : `hash:${fromEmail}:${subject}:${date ? new Date(date).toISOString().slice(0,19) : 'nodate'}`;

            // Primary dedup: check email_uid (safe  column may not exist yet)
            let emailCheck = { rowCount: 0, rows: [] };
            try {
              emailCheck = await pool.query(
                "SELECT id FROM emails WHERE user_id = $1 AND email_uid = $2",
                [userId, emailUid]
              );
            } catch (dupErr) {
              if (dupErr.code !== '42703') throw dupErr; // only swallow "column does not exist"
            }

            // Fallback dedup: message_id
            if (emailCheck.rowCount === 0 && messageId) {
              emailCheck = await pool.query(
                "SELECT id FROM emails WHERE user_id = $1 AND message_id = $2",
                [userId, messageId]
              );
            }

            // Fallback dedup: from_email + subject + date (within ±2 minutes)
            if (emailCheck.rowCount === 0 && date) {
              const exactDate = new Date(date).toISOString();
              emailCheck = await pool.query(
                `SELECT id FROM emails WHERE user_id = $1 AND from_email = $2 AND subject = $3
                 AND time_received BETWEEN $4::timestamptz - INTERVAL '2 minutes' AND $4::timestamptz + INTERVAL '2 minutes'`,
                [userId, fromEmail, subject, exactDate]
              );
            }

            if (emailCheck.rowCount === 0) {
              console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Found new reply from ${matchedLead.name} (${fromEmail})!`);

              // Download preview of body text
              let bodyPreview = "No body content found.";
              const bodyBuffer = message.bodyParts ? message.bodyParts.get('1') : null;
              if (bodyBuffer) {
                let text = bodyBuffer.toString('utf-8');
                text = text.replace(/<[^>]*>/g, ' ');
                text = text.split('\n')
                           .map(line => line.replace(/[ \t]+/g, ' ').trim())
                           .join('\n')
                           .replace(/\n{3,}/g, '\n\n')
                           .trim();
                if (text.length > 0) {
                  bodyPreview = text.substring(0, 800);
                }
              }

              // Classify the incoming email category using AI
              const detectedCategory = await classifyIncomingEmail(bodyPreview, subject, config, userId);

              // Insert email reply record  includes email_uid for dedup
              let insertedEmail;
              try {
                insertedEmail = await pool.query(
                  `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id, message_id, email_uid, lead_id)
                   VALUES ($1, $2, $3, $4, $5, COALESCE($9::timestamptz, NOW()), FALSE, $6, ARRAY['inbox'], $7, $8, $10, $11) RETURNING *`,
                  [matchedLead.name, fromEmail, matchedLead.name, subject, bodyPreview, detectedCategory, userId, messageId, date ? new Date(date).toISOString() : null, emailUid, matchedLead.id]
                );
              } catch (insertErr) {
                if (insertErr.code === '23505') {
                  console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Duplicate message blocked via unique constraint (email_uid). Skipping.`);
                  continue;
                }
                // Column doesn't exist yet (migration race)  fall back to basic INSERT
                if (insertErr.code === '42703') {
                  console.warn(`[EMAIL AGENT] [SYNC] email_uid column not found  falling back to basic INSERT.`);
                  try {
                    insertedEmail = await pool.query(
                      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id, message_id)
                       VALUES ($1, $2, $3, $4, $5, COALESCE($9::timestamptz, NOW()), FALSE, $6, ARRAY['inbox'], $7, $8) RETURNING *`,
                      [matchedLead.name, fromEmail, matchedLead.name, subject, bodyPreview, detectedCategory, userId, messageId, date ? new Date(date).toISOString() : null]
                    );
                  } catch (fallbackErr) {
                    if (fallbackErr.code === '23505') { continue; }
                    throw fallbackErr;
                  }
                } else {
                  throw insertErr;
                }
              }

              //  AUTO-REPLY / SPAM DETECTION 
              const detectAutoReplyEnabled = config.auto_detect_auto_reply !== false;
              if (detectAutoReplyEnabled && detectedCategory === 'spam') {
                console.log(`[EMAIL AGENT] Auto-reply/spam detected from ${matchedLead.name}. Moving to Manual Research by Boss. No draft generated.`);
                await pool.query(
                  "UPDATE emails SET labels = array_append(labels, 'auto_reply') WHERE id = $1 AND NOT ('auto_reply' = ANY(labels))",
                  [insertedEmail.rows[0].id]
                );
                // Move lead to Manual Research by Boss  needs manual attention, not real reply
                await pool.query(
                  "UPDATE leads SET pipeline_stage = 'Manual Research by Boss' WHERE id = $1 AND user_id = $2 AND pipeline_stage NOT IN ('Replied','Won','Archived')",
                  [matchedLead.id, userId]
                );
                continue;
              }

              // Increment template reply_count  only for real human replies (not auto-replies)
              if (matchedLead.sent_pitch_id && matchedLead.status !== 'replied' && matchedLead.status !== 'archived') {
                await pool.query(
                  "UPDATE pitch_templates SET reply_count = reply_count + 1 WHERE id = $1",
                  [matchedLead.sent_pitch_id]
                );
              }

              // Update lead status/stage based on AI category detection
              if (detectedCategory === 'not_interested') {
                await pool.query(
                  "UPDATE leads SET status = 'archived', pipeline_stage = 'Archived' WHERE id = $1 AND user_id = $2",
                  [matchedLead.id, userId]
                );
                console.log(`[EMAIL AGENT] Prospect ${matchedLead.name} marked not_interested. Automatically archived.`);
              } else if (detectedCategory === 'interested') {
                await pool.query(
                  "UPDATE leads SET status = 'replied', pipeline_stage = 'Replied' WHERE id = $1 AND user_id = $2",
                  [matchedLead.id, userId]
                );
                console.log(`[EMAIL AGENT] Prospect ${matchedLead.name} marked interested! Lead stage moved to Replied.`);
              } else {
                // follow_up or unread  move to Replied for human follow-up
                await pool.query(
                  "UPDATE leads SET status = 'replied', pipeline_stage = 'Replied' WHERE id = $1 AND user_id = $2",
                  [matchedLead.id, userId]
                );
              }

              // Insert real-time database notification for the reply
              try {
                let notifTitle = ` New Reply: ${matchedLead.name}`;
                let notifMsg = `Subject: ${subject}`;
                let notifType = 'reply';

                if (detectedCategory === 'interested') {
                  notifTitle = ` Hot Reply: ${matchedLead.name}`;
                  notifMsg = `They are interested! Stage moved to Replied.`;
                  notifType = 'reply';
                } else if (detectedCategory === 'not_interested') {
                  notifTitle = ` Declined: ${matchedLead.name}`;
                  notifMsg = `Declined offer. Lead auto-archived.`;
                  notifType = 'system';
                }

                await pool.query(
                  `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, 'Inbox')`,
                  [userId, notifTitle, notifMsg, notifType]
                );
              } catch (notifErr) {
                console.error("Failed to insert reply notification:", notifErr.message);
              }

              newRepliesCount++;

              //  AI Draft Reply / Meeting detection & Escalations 
              if (matchedLead.ai_enabled && config.ai_draft_replies_enabled !== false) {
                console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Generating draft reply or handling booking for ${matchedLead.name}...`);
                try {
                  let replyText = "";
                  let draftSubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
                  let draftLabels = ['draft', 'pending_reply'];

                  // 1. Check for Cost / Mockup / NDA Escalation keywords
                  const bodyLower = bodyPreview.toLowerCase();
                  let escalationReason = null;
                  if (config.escalate_cost !== false && /price|cost|quote|how much|rate|pricing/i.test(bodyLower)) {
                    escalationReason = "Cost/Pricing Request";
                  } else if (config.escalate_mockups !== false && /mockup|wireframe|design sample|custom sample|prototype/i.test(bodyLower)) {
                    escalationReason = "Design Mockup Request";
                  } else if (config.escalate_terms !== false && /nda|agreement|contract|terms|sign/i.test(bodyLower)) {
                    escalationReason = "NDA/Terms Request";
                  }

                  if (escalationReason) {
                    console.log(`[EMAIL AGENT] Human action required escalation detected: ${escalationReason} for Lead ${matchedLead.name}`);
                    await pool.query(
                      "UPDATE leads SET pipeline_stage = 'Follow Up', human_escalation_reason = $1 WHERE id = $2 AND user_id = $3",
                      [escalationReason, matchedLead.id, userId]
                    );
                    draftLabels.push('needs_review');
                  }

                  // 2. Detect meeting booking intent
                  const bookingCheck = await detectMeetingBookingIntent(insertedEmail.rows[0], config, userId);
                  
                  if (bookingCheck.isMeetingAgreed) {
                    console.log(`[EMAIL AGENT] Meeting booking intent agreed for ${matchedLead.name}`);
                    
                    // Insert suggestion
                    const sugRes = await pool.query(
                      `INSERT INTO calendar_event_suggestions (user_id, lead_id, lead_name, lead_email, title, description, status)
                       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
                      [
                        userId, 
                        matchedLead.id, 
                        matchedLead.name, 
                        fromEmail, 
                        `Meeting with ${matchedLead.name}`, 
                        `Introductory call scheduled via Syntek Lead AI Copilot. Thread subject: ${subject}`,
                      ]
                    );
                    
                    // Check auto book meetings setting and Google OAuth connected status
                    const calendarToken = await getGoogleCalendarToken(userId);
                    const shouldAutoBook = config.auto_book_meetings === true && calendarToken;
                    
                    if (shouldAutoBook) {
                      console.log(`[EMAIL AGENT] Auto booking calendar event for User ${userId}...`);
                      const eventTime = bookingCheck.meetingTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                      const success = await createGoogleCalendarEvent(userId, {
                        title: `Meeting with ${matchedLead.name}`,
                        description: `Introductory call scheduled via Syntek Lead AI Copilot. Thread subject: ${subject}`,
                        attendeeEmail: fromEmail,
                        startTime: eventTime
                      });
                      if (success) {
                        await pool.query(
                          "UPDATE calendar_event_suggestions SET status = 'confirmed' WHERE id = $1",
                          [sugRes.rows[0].id]
                        );
                        replyText = `Hi ${matchedLead.name},\n\nGreat to hear from you! I have scheduled our meeting on the calendar and sent you an invitation with a Google Meet link.\n\nLooking forward to speaking with you!\n\nBest regards,\n${config.sender_name || "Your Name"}`;
                      }
                    }
                    
                    if (!replyText) {
                      const senderName = config.sender_name || "Your Name";
                      const senderRole = config.sender_role || "Developer";
                      replyText = `Hi ${matchedLead.name},\n\nGreat to hear from you! I'd love to schedule a call to discuss further.\n\nWhen works best for you? Feel free to suggest a time and I'll confirm.\n\nBest,\n${senderName}\n${senderRole}`;
                    }
                  } else {
                    replyText = await generateEmailReplyText(insertedEmail.rows[0], config, userId);
                  }

                  if (replyText) {
                    if (escalationReason) {
                      replyText = `[ NEEDS HUMAN REVIEW: Prospect requested pricing/mockup/NDA info]\n\n${replyText}`;
                    }

                    // Save as DRAFT for user review
                    await pool.query(
                      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id, lead_id)
                       VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'draft', $6, $7, $8)`,
                      [matchedLead.name, fromEmail, matchedLead.name, draftSubject, replyText, draftLabels, userId, matchedLead.id]
                    );
                    console.log(`[EMAIL AGENT] [DRAFT SAVED] Draft reply for ${matchedLead.name} saved  awaiting user approval.`);
                    try {
                      await pool.query(
                        `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'system', 'Inbox')`,
                        [userId, ` AI Draft Reply: ${matchedLead.name}`, `Draft response generated. Review and send from Inbox.`]
                      );
                    } catch (_) {}
                  }
                } catch (draftErr) {
                  console.error(`[EMAIL AGENT] [DRAFT ERROR] Failed to generate draft for ${matchedLead.name}:`, draftErr.message);
                }
              }
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, count: newRepliesCount };
  } catch (err) {
    console.error(`[EMAIL AGENT] [SYNC IMAP CONNECTION ERROR] User ${userId} failed:`, err.message);
    try {
      await client.logout();
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getAiPreferredTime(niche) {
  const n = (niche || "").toLowerCase();
  if (n.includes("cafe") || n.includes("coffee")) {
    return "10:00";
  } else if (n.includes("restaurant") || n.includes("food") || n.includes("brunch") || n.includes("bakery")) {
    return "14:30";
  } else if (n.includes("gym") || n.includes("spa") || n.includes("salon") || n.includes("fitness")) {
    return "11:00";
  }
  return "11:15";
}

async function processJobQueueBatch() {
  try {
    // 1. Recover stuck jobs: locked_at < NOW() - 30 minutes AND status = 'running' -> pending
    await pool.query(`
      UPDATE job_queue
      SET status = 'pending', locked_at = NULL, error_log = 'Recovered from stuck state (timeout)'
      WHERE status = 'running' AND locked_at < NOW() - INTERVAL '30 minutes'
    `);

    // 2. Fetch and lock ready jobs: run_at <= NOW() AND status = 'pending'
    const res = await pool.query(`
      UPDATE job_queue
      SET status = 'running', locked_at = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM job_queue
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    if (res.rowCount === 0) return;

    console.log(`[JOB QUEUE] Processing ${res.rowCount} jobs...`);

    for (const job of res.rows) {
      runJob(job).catch(err => {
        console.error(`[JOB QUEUE] Unhandled job execution failure for Job ID ${job.id}:`, err);
      });
    }
  } catch (err) {
    console.error("[JOB QUEUE] Error processing job batch:", err.message);
  }
}

async function runReResearchAgent(userId, config) {
  if (config && config.re_research_enabled === false) {
    console.log(`[RE-RESEARCH AGENT] Skipped: Re-research is disabled for User ${userId}`);
    return;
  }
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
  
  // Fetch up to 5 leads in 'Re-research' stage that have had < 3 attempts
  const leadsRes = await pool.query(
    `SELECT * FROM leads 
     WHERE user_id = $1 AND pipeline_stage = 'Re-research' AND status = 'no_email' AND COALESCE(re_research_attempts, 0) < 3
     LIMIT 5`,
    [userId]
  );
  
  if (leadsRes.rowCount === 0) {
    console.log(`[RE-RESEARCH AGENT] No leads in Re-research stage for User ${userId}.`);
    return;
  }

  console.log(`[RE-RESEARCH AGENT] Starting email search for ${leadsRes.rowCount} leads...`);

  for (const lead of leadsRes.rows) {
    // Increment attempts count
    await pool.query(
      "UPDATE leads SET re_research_attempts = COALESCE(re_research_attempts, 0) + 1 WHERE id = $1",
      [lead.id]
    );

    const promptText = `
You are an AI Email Finder Agent. Your task is to find the official, public email address of this business:
- Name: ${lead.name}
- Type/Niche: ${lead.type}
- City/Location: ${lead.city}
- Website: ${lead.website || "Not provided"}

Grounding search strategy:
Use your search capabilities to search for the business name and location, visit their website or contact/social pages (like Facebook or LinkedIn), and locate a public contact email address (e.g. info@..., hello@..., contact@..., or a personal contact email of the owner/manager).

Response format:
If you find a valid email address, respond ONLY with the email address in plain text (e.g., info@company.com).
If you absolutely cannot find any valid email address, respond with "NOT_FOUND".
Do not output any other explanations, formatting, markdown, or conversational text.
`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }] }]
      };
      
      const resObj = await fetchGeminiWithRetry(url, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resJson = await resObj.json();
      const resText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = (resText || "").trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (emailRegex.test(cleaned)) {
        // Successfully found email!
        await pool.query(
          `UPDATE leads 
           SET email = $1, 
               status = 'not contacted', 
               pipeline_stage = 'New',
               re_research_attempts = 0
           WHERE id = $2`,
          [cleaned, lead.id]
        );
        console.log(`[RE-RESEARCH SUCCESS] Found email "${cleaned}" for lead "${lead.name}" (ID ${lead.id}). Moved to New.`);
        
        // Notify user
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES ($1, $2, $3, 'system', 'Pipeline')`,
          [userId, ` Email Found: ${lead.name}`, `Re-research found email ${cleaned}. Lead moved back to New.`]
        );
      } else {
        console.log(`[RE-RESEARCH FAILED] Could not find email for lead "${lead.name}" (ID ${lead.id}). Model replied: ${resText}`);
        await pool.query(
          `UPDATE leads 
           SET pipeline_stage = 'Manual Research by Boss', 
               status = 'no_email'
           WHERE id = $1`,
          [lead.id]
        );
        console.log(`[RE-RESEARCH MOVED] Lead "${lead.name}" (ID ${lead.id}) moved to Manual Research by Boss because email could not be found.`);
        
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES ($1, $2, $3, 'system', 'Pipeline')`,
          [userId, ` Manual Research Required: ${lead.name}`, `AI research agent could not find an email. Lead moved to Manual Research by Boss.`]
        );
      }
    } catch (err) {
      console.error(`[RE-RESEARCH ERROR] Failed for lead "${lead.name}" (ID ${lead.id}):`, err.message);
    }
  }
}

async function runLeadEnrichmentAgent(userId, config) {
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
  
  // Find up to 5 leads that have email but no personalized icebreaker, and are not archived
  const leadsRes = await pool.query(
    `SELECT * FROM leads 
     WHERE user_id = $1 
       AND email IS NOT NULL AND email != '' 
       AND status != 'archived' 
       AND personalized_icebreaker IS NULL
     LIMIT 5`,
    [userId]
  );
  
  if (leadsRes.rowCount === 0) {
    return;
  }
  
  console.log(`[ENRICHMENT AGENT] Starting enrichment search for ${leadsRes.rowCount} leads...`);
  
  for (const lead of leadsRes.rows) {
    const promptText = `
You are an AI Lead Enrichment Agent. Your task is to research this business online and write a highly personalized, warm 1-sentence compliment/icebreaker that we can use to start a cold outreach email to the owner or manager.
- Name: ${lead.name}
- Type/Niche: ${lead.type}
- City/Location: ${lead.city}
- Website: ${lead.website || "Not provided"}

Grounding research strategy:
Use your search capabilities to search for the business name, city, website, or social pages (like Facebook or Yelp reviews).
Find a real, recent fact, milestone, positive review snippet, or launch.
Examples of good 1-sentence icebreakers:
- "I saw your amazing customer reviews praising the friendly staff and great espresso blend at Houndstooth Cafe last week, congrats!"
- "I noticed your team recently celebrated 10 years of serving the Austin community, what a milestone!"
- "I saw your recent project portfolio showcase of the boutique apartment designs in Boston, they look stunning!"

Response format:
Respond ONLY with the 1-sentence icebreaker in plain text. Do not include quotes, subject lines, explanations, or any other conversational text.
If you absolutely cannot find any specific recent details or achievements, respond with a general friendly compliment tailored to their high rating/reviews or niche in their city (e.g. "I was looking at the great reviews for your coffee shop in Austin and wanted to reach out...").
`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ googleSearch: {} }]
      };
      
      const resObj = await fetchGeminiWithRetry(url, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resJson = await resObj.json();
      const resText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = (resText || "").trim().replace(/^["']|["']$/g, ''); // strip outer quotes if any

      if (cleaned && cleaned.length > 5 && !cleaned.includes("NOT_FOUND")) {
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = $1 WHERE id = $2",
          [cleaned, lead.id]
        );
        console.log(`[ENRICHMENT SUCCESS] Generated icebreaker for lead "${lead.name}" (ID ${lead.id}): ${cleaned}`);
      } else {
        // Set a default friendly fallback icebreaker so we don't keep retrying it indefinitely
        const fallback = `I was looking at the great local reviews for your ${lead.type || 'business'} in ${lead.city} and wanted to reach out.`;
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = $1 WHERE id = $2",
          [fallback, lead.id]
        );
        console.log(`[ENRICHMENT FALLBACK] Set fallback icebreaker for lead "${lead.name}" (ID ${lead.id})`);
      }
    } catch (err) {
      console.error(`[ENRICHMENT ERROR] Failed for lead "${lead.name}" (ID ${lead.id}):`, err.message);
    }
  }
}

async function runJob(job) {
  const { id, user_id, job_type } = job;
  console.log(`[JOB QUEUE] Starting job ${id} (type: ${job_type}) for user ${user_id}`);
  try {
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1", [user_id]);
    if (configRes.rowCount === 0) {
      throw new Error(`Campaign settings not found for user ${user_id}`);
    }
    const config = decryptConfig(configRes.rows[0]);

    if (job_type === "campaign_run") {
      await triggerCronCampaign(config);
    } else if (job_type === "inbox_sync") {
      await syncUserInbox(user_id, config);
    } else if (job_type === "re_research") {
      await runReResearchAgent(user_id, config);
    } else if (job_type === "lead_enrichment") {
      await runLeadEnrichmentAgent(user_id, config);
    } else {
      throw new Error(`Unknown job type: ${job_type}`);
    }

    // Mark as completed
    await pool.query(`
      UPDATE job_queue
      SET status = 'completed', locked_at = NULL, error_log = NULL
      WHERE id = $1
    `, [id]);
    console.log(`[JOB QUEUE] Job ${id} completed successfully.`);
  } catch (err) {
    console.error(`[JOB QUEUE] Job ${id} failed:`, err.message);
    const hasMoreAttempts = job.attempts < job.max_attempts;
    await pool.query(`
      UPDATE job_queue
      SET status = $1, locked_at = NULL, error_log = $2
      WHERE id = $3
    `, [hasMoreAttempts ? 'pending' : 'failed', err.message, id]);
  }
}

function startCronScheduler() {
  console.log("[LEAD MANAGER AGENT] Background Campaign Cron Scheduler & Job Queue Worker initialized.");
  
  // Start the job queue processing loop every 15 seconds
  setInterval(async () => {
    await processJobQueueBatch();
  }, 15000);

  // Immediately run batch process once on boot
  processJobQueueBatch().catch(err => {
    console.error("[JOB QUEUE] Initial boot batch run failed:", err.message);
  });

  // Checking scheduling queue every 60 seconds to queue daily campaigns
  setInterval(async () => {
    try {
      const todayStr = new Date().toDateString();
      const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE is_active = TRUE");
      
      for (const config of settingsRes.rows) {
        const userId = config.user_id;
        if (config.last_cron_run_date === todayStr) {
          continue; 
        }

        let timeToUse = config.preferred_time || "09:00";
        if (config.schedule_type === "ai") {
          timeToUse = getAiPreferredTime(config.niche);
        }

        const [prefHour, prefMin] = timeToUse.split(":");
        const now = new Date();
        
        let tzHour = now.getHours();
        let tzMin = now.getMinutes();
        
        if (config.timezone === "est") {
          const estStr = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
          const [h, m] = estStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        } else if (config.timezone === "pst") {
          const pstStr = now.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
          const [h, m] = pstStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        }

        const curHour = tzHour.toString().padStart(2, "0");
        const curMin = tzMin.toString().padStart(2, "0");

        if (curHour === prefHour && curMin === prefMin) {
          // Check if already queued for today
          const checkQueue = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'campaign_run' AND run_at::date = CURRENT_DATE",
            [userId]
          );
          if (checkQueue.rowCount === 0) {
            await pool.query("UPDATE campaign_settings SET last_cron_run_date = $1 WHERE user_id = $2", [todayStr, userId]);
            console.log(`[LEAD MANAGER AGENT] [CRON] Queuing daily campaign for User ${userId} (${timeToUse} ${config.timezone})`);
            await pool.query(`
              INSERT INTO job_queue (user_id, job_type, payload, run_at)
              VALUES ($1, 'campaign_run', $2, NOW())
            `, [userId, JSON.stringify({ config_id: config.id })]);
          }
        }
      }
    } catch (err) {
      console.error("[LEAD MANAGER AGENT] [CRON ERROR] Scheduler check failed:", err.message);
    }
  }, 60000);

  // Sync Inbox Replies for all users with Gmail connected every 5 minutes (300000ms) by queueing sync jobs
  setInterval(async () => {
    try {
      const allConfigs = await pool.query("SELECT * FROM campaign_settings");
      for (const rawConfig of allConfigs.rows) {
        const config = decryptConfig(rawConfig);
        if (config && config.gmail_user && config.gmail_pass) {
          // Avoid queueing if a pending sync job is already in queue
          const pendingSync = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'inbox_sync' AND status = 'pending'",
            [config.user_id]
          );
          if (pendingSync.rowCount === 0) {
            console.log(`[EMAIL AGENT] [CRON SYNC] Queueing inbox sync for User ${config.user_id}...`);
            await pool.query(`
              INSERT INTO job_queue (user_id, job_type, payload, run_at)
              VALUES ($1, 'inbox_sync', $2, NOW())
            `, [config.user_id, JSON.stringify({ config_id: config.id })]);
          }
        }
      }
    } catch (e) {
      console.error("[EMAIL AGENT] [CRON SYNC ERROR] Inbox sync queueing failed:", e.message);
    }
  }, 300000);

  // Check for leads needing re-research every 2 minutes (120000ms)
  setInterval(async () => {
    try {
      const activeUsers = await pool.query(
        "SELECT DISTINCT user_id FROM leads WHERE pipeline_stage = 'Re-research' AND status = 'no_email' AND COALESCE(re_research_attempts, 0) < 3"
      );
      for (const row of activeUsers.rows) {
        const userId = row.user_id;

        // Skip if re-research agent is disabled for this user
        const settingsRes = await pool.query(
          "SELECT re_research_enabled FROM campaign_settings WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        if (settingsRes.rowCount > 0 && settingsRes.rows[0].re_research_enabled === false) {
          continue;
        }

        const pendingJob = await pool.query(
          "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
          [userId]
        );
        if (pendingJob.rowCount === 0) {
          console.log(`[RE-RESEARCH AGENT] Queueing email search job for User ${userId}...`);
          await pool.query(`
            INSERT INTO job_queue (user_id, job_type, run_at)
            VALUES ($1, 're_research', NOW())
          `, [userId]);
        }
      }
    } catch (err) {
      console.error("[RE-RESEARCH CRON ERROR] Failed:", err.message);
    }
  }, 120000);

  // Check for leads needing enrichment every 2 minutes (120000ms)
  setInterval(async () => {
    try {
      const activeUsers = await pool.query(
        "SELECT DISTINCT user_id FROM leads WHERE personalized_icebreaker IS NULL AND email IS NOT NULL AND email != '' AND status != 'archived'"
      );
      for (const row of activeUsers.rows) {
        const userId = row.user_id;
        const pendingJob = await pool.query(
          "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'lead_enrichment' AND status = 'pending'",
          [userId]
        );
        if (pendingJob.rowCount === 0) {
          console.log(`[ENRICHMENT AGENT] Queueing enrichment job for User ${userId}...`);
          await pool.query(`
            INSERT INTO job_queue (user_id, job_type, run_at)
            VALUES ($1, 'lead_enrichment', NOW())
          `, [userId]);
        }
      }
    } catch (err) {
      console.error("[ENRICHMENT CRON ERROR] Failed:", err.message);
    }
  }, 120000);

  // Evolve low-performing pitch templates every 10 minutes (600000ms)
  setInterval(async () => {
    try {
      console.log("[AI PITCH OPTIMIZER] Checking for low-performing pitch templates to evolve...");
      const allConfigs = await pool.query("SELECT * FROM campaign_settings");
      for (const rawConfig of allConfigs.rows) {
        const config = decryptConfig(rawConfig);
        if (config) {
          await evolvePitchTemplate(config.user_id, config);
        }
      }
    } catch (err) {
      console.error("[AI PITCH OPTIMIZER ERROR] Failed running evolution agent:", err.message);
    }
  }, 600000);
}

async function refreshGoogleAccessToken(config) {
  const { user_id, google_refresh_token } = config;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!google_refresh_token || !clientId || !clientSecret) {
    return null;
  }

  console.log(`[LEAD MANAGER AGENT] [GOOGLE CALENDAR] Refreshing OAuth access token for User ${user_id}...`);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: google_refresh_token,
        grant_type: "refresh_token"
      })
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${await res.text()}`);
    }

    const data = await res.json();
    const expiryTime = Date.now() + (data.expires_in * 1000);

    await pool.query(
      `UPDATE campaign_settings SET 
        google_access_token = $1, 
        google_token_expiry = $2 
      WHERE user_id = $3`,
      [data.access_token, expiryTime, user_id]
    );

    return data.access_token;
  } catch (err) {
    console.error(`[LEAD MANAGER AGENT] [GOOGLE CALENDAR] Token refresh failed for User ${user_id}:`, err.message);
    return null;
  }
}

async function createGoogleCalendarEvent(userId, arg2, arg3, arg4, arg5) {
  let title, description, attendeeEmail, startTime;

  if (typeof arg2 === "object" && arg2 !== null) {
    title = arg2.title;
    description = arg2.description;
    attendeeEmail = arg2.attendeeEmail;
    startTime = arg2.startTime;
  } else {
    // Positional style: (userId, leadName, leadEmail, summary, startDateTime)
    const leadName = arg2;
    attendeeEmail = arg3;
    title = arg4;
    startTime = arg5;
    description = `Syntek AI Autopilot booked call with prospect ${leadName} (${attendeeEmail})`;
  }

  // 1. Try to get Google Calendar Token first
  let accessToken = await getGoogleCalendarToken(userId);
  if (!accessToken) {
    // 2. Fallback to primary Google account token
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
    const config = configRes.rows[0];
    if (config && config.google_connected) {
      accessToken = config.google_access_token;
      if (config.google_token_expiry && parseInt(config.google_token_expiry) <= Date.now() + 60000) {
        try {
          accessToken = await refreshGoogleAccessToken(config);
        } catch (_) {}
      }
    }
  }

  if (!accessToken) {
    console.error(`[CALENDAR EVENT CREATE] User ${userId} has no Google token configured.`);
    return false;
  }

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    console.error(`[CALENDAR EVENT CREATE] Invalid start time: ${startTime}`);
    return false;
  }
  const end = new Date(start.getTime() + 30 * 60 * 1000); // Default 30 min duration

  const body = {
    summary: title,
    description: description,
    start: {
      dateTime: start.toISOString(),
      timeZone: "UTC"
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "UTC"
    },
    attendees: [
      { email: attendeeEmail }
    ],
    conferenceData: {
      createRequest: {
        requestId: `meet-${userId}-${Date.now()}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet"
        }
      }
    }
  };

  const makeRequest = async (token) => {
    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  };

  try {
    let res = await makeRequest(accessToken);

    if (res.status === 401) {
      // Try refreshing calendar token
      const result = await pool.query("SELECT google_calendar_refresh_token, google_refresh_token FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
      const calRefreshEnc = result.rows[0]?.google_calendar_refresh_token;
      if (calRefreshEnc) {
        const refreshDec = decryptText(calRefreshEnc);
        const newAccess = await refreshGoogleCalendarToken(userId, refreshDec);
        if (newAccess) {
          res = await makeRequest(newAccess);
        }
      } else {
        const primaryRefresh = result.rows[0]?.google_refresh_token;
        if (primaryRefresh) {
          const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
          const newAccess = await refreshGoogleAccessToken(configRes.rows[0]);
          if (newAccess) {
            res = await makeRequest(newAccess);
          }
        }
      }
    }

    if (!res.ok) {
      console.error("[CALENDAR EVENT CREATE] Failed:", await res.text());
      return false;
    }

    const data = await res.json();
    let meetLink = "";
    if (data.conferenceData && data.conferenceData.entryPoints) {
      const entryPoint = data.conferenceData.entryPoints.find(ep => ep.entryPointType === "video");
      if (entryPoint && entryPoint.uri) {
        meetLink = entryPoint.uri;
      }
    }
    console.log(`[CALENDAR EVENT CREATE] Scheduled event for User ${userId}. Meet link: ${meetLink || "none"}`);
    return {
      meetLink,
      eventLink: data.htmlLink || "https://calendar.google.com"
    };
  } catch (err) {
    console.error("[CALENDAR EVENT CREATE] Error:", err.message);
    return false;
  }
}

async function detectMeetingBookingIntent(email, config, userId) {
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

  // Fetch thread history
  const threadRes = await pool.query(
    "SELECT * FROM emails WHERE from_email = $1 AND user_id = $2 ORDER BY id ASC",
    [email.from_email, userId]
  );

  let threadContext = "";
  for (const msg of threadRes.rows) {
    const isSent = msg.category === "sent" || (msg.labels && msg.labels.includes("sent"));
    threadContext += `${isSent ? "Me (Outreach)" : "Prospect"}: ${msg.preview}\n\n`;
  }

  const todayStr = new Date().toISOString();

  const promptText = `
    Analyze the cold outreach email exchange history between an outreach agent and a local business prospect.
    Your task is to identify if the prospect has agreed to schedule a call/meeting or suggested a time/slot to chat.

    Exchange history:
    ${threadContext}

    Current reference date and time (ISO format in UTC): ${todayStr}

    Rules:
    - If the prospect says things like "sure, send me an invite", "I'm free tomorrow at 2 PM", "how about next Tuesday morning?", or "Thursday afternoon works", set "isMeetingAgreed" to true.
    - If they say "not interested", "stop emailing", "maybe next month", or ask standard questions without agreeing to a calendar slot yet, set "isMeetingAgreed" to false.
    - Extract "meetingTime" as a valid ISO 8601 string (e.g. YYYY-MM-DDTHH:MM:SSZ) in UTC.
    - Calculate the date/time carefully based on the prospect's timezone context or relative offsets. (E.g. If they suggest "tomorrow at 11 AM" and today is June 4, the date is June 5. If they just say "Thursday afternoon" and today is Thursday, assume the upcoming Thursday or default to 14:00 local).
    
    You must output a valid JSON object with the following schema:
    {
      "isMeetingAgreed": boolean,
      "confidence": number (float between 0.0 and 1.0),
      "meetingTime": string (ISO-8601 UTC date time, e.g. "2026-06-05T15:00:00Z"),
      "reasoning": string (brief summary explaining date/time calculation reasoning)
    }

    Do not include any conversational explanation, markdown code blocks, intros, or outros. Output only the raw JSON.
  `;

  try {
    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(30000)
      },
      (type, text) => console.log(`[MEETING DETECT RETRY] [${type.toUpperCase()}] ${text}`),
      3
    );

    if (!response) return { isMeetingAgreed: false };

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text) return { isMeetingAgreed: false };
    
    return JSON.parse(text);
  } catch (err) {
    console.error("[AI MEETING DETECT FAIL]", err.message);
    return { isMeetingAgreed: false };
  }
}

//  Bridge Endpoints (frontend-compatible aliases) 

// Bridge: /api/deepsearch  triggers async scan-deepsearch and returns scanId



// Alias: /api/scan-deepsearch  used by LeadFinder.jsx deepsearch mode; returns {scan_id}
app.post("/api/scan-deepsearch", authenticate, scanRateLimit, async (req, res) => {
  // Normalize body: frontend sends pitchOffer/requiredContact, deepsearch expects pitch_offer/required_contact
  req.body.pitch_offer    = req.body.pitchOffer    || req.body.pitch_offer;
  req.body.required_contact = req.body.requiredContact || req.body.required_contact;
  // We delegate to /api/deepsearch inline handler but first create scan and return scan_id
  try {
    const { niche, location, limit, pitch_offer, required_contact } = req.body;
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(settingsRes.rows[0]) || {};
    const userRes = await pool.query("SELECT subscription_tier FROM users WHERE id = $1", [req.userId]);
    const userTier = (userRes.rows[0]?.subscription_tier || "agency").toLowerCase();
    let maxLimit = 50;
    if (userTier === "free") maxLimit = 5;
    else if (userTier === "growth") maxLimit = 25;
    const resolvedLimit    = Math.min(maxLimit, parseInt(limit || config.daily_lead_limit || 8, 10));
    const resolvedNiche    = niche    || config.niche    || "Clinics";
    const resolvedLocation = location || config.location || "Austin, TX";
    const resolvedPitch    = pitch_offer    || config.pitch_offer    || "whatsapp_bot";
    const resolvedContact  = required_contact || config.required_contact || "email_or_phone";
    const apiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

    const scanRes = await pool.query(
      "INSERT INTO scans (user_id, status, progress, logs) VALUES ($1, 'running', 0, $2) RETURNING id",
      [req.userId, JSON.stringify([{ type: "info", text: `Starting DeepSearch for "${resolvedNiche}" in ${resolvedLocation}...` }])]
    );
    const scan_id = scanRes.rows[0].id;
    res.json({ scan_id });  // Return immediately so frontend can poll

    const addLog = (type, text) => pool.query(
      "UPDATE scans SET logs = logs || $1::jsonb WHERE id = $2",
      [JSON.stringify([{ type, text }]), scan_id]
    ).catch(() => {});

    // Background: run AI deepsearch
    (async () => {
      try {
        addLog("info", "AI is scanning the web for leads...");
        await pool.query("UPDATE scans SET progress = 15 WHERE id = $1", [scan_id]);

        // Use Gemini to generate leads list
        const prompt = `You are a B2B lead research expert. Find ${resolvedLimit} real businesses matching: Niche: "${resolvedNiche}", Location: "${resolvedLocation}". For each business provide: name, type, city, email (if likely public), phone, website, rating (1-5), reviews count, owner_name (if known). Return as JSON array. Only real businesses.`;
        
        let rawLeads = [];
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
          });
          const geminiData = await geminiRes.json();
          const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const match = text.match(/[[sS]*]/);
          if (match) rawLeads = JSON.parse(match[0]);
        } catch (e) {
          addLog("warn", `AI error: ${e.message}. Saving partial results.`);
        }

        await pool.query("UPDATE scans SET progress = 70 WHERE id = $1", [scan_id]);
        addLog("info", `Processing ${rawLeads.length} leads...`);

        let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;
          try {
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT DO NOTHING`,
              [
                lead.name, lead.type || resolvedNiche, lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.0,
                lead.reviews ? parseInt(lead.reviews, 10) : 0,
                lead.email ? "not contacted" : "no_email",
                lead.website || null, req.userId
              ]
            );
            saved++;
          } catch { /* skip duplicate */ }
        }

        await pool.query(
          "UPDATE scans SET status = 'done', progress = 100, logs = logs || $1::jsonb, total_found = $2 WHERE id = $3",
          [JSON.stringify([{ type: "success", text: ` Done. ${saved} leads saved.` }]), saved, scan_id]
        );
      } catch (err) {
        await pool.query("UPDATE scans SET status = 'error', progress = 100 WHERE id = $1", [scan_id]);
        addLog("error", `Scan failed: ${err.message}`);
      }
    })();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.post("/api/deepsearch", authenticate, async (req, res) => {
  try {
    const { niche, location, limit, pitch_offer, required_contact, mode } = req.body;
    // Create scan record
    const scanRes = await pool.query(
      "INSERT INTO scans (user_id, status, progress, logs) VALUES ($1, 'running', 0, $2) RETURNING id",
      [req.userId, JSON.stringify([{ type: "info", text: "Starting DeepSearch..." }])]
    );
    const scanId = scanRes.rows[0].id;

    // Return scan ID immediately so client can poll
    res.json({ scanId, message: "Scan started. Poll /api/scan/status/:scanId for progress." });

    // Run the scan in background by calling the internal scan-deepsearch logic inline
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(settingsRes.rows[0]) || {};
    const apiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

    const userRes = await pool.query("SELECT subscription_tier FROM users WHERE id = $1", [req.userId]);
    const userTier = (userRes.rows[0]?.subscription_tier || "agency").toLowerCase();
    let maxLimit = 50;
    if (userTier === "free") maxLimit = 5;
    else if (userTier === "growth") maxLimit = 25;

    const resolvedLimit = Math.min(maxLimit, parseInt(limit || config.daily_lead_limit || 8, 10));
    const resolvedNiche = niche || config.niche || "Cafes";
    const resolvedLocation = location || config.location || "Austin, TX";
    const resolvedPitch = pitch_offer || config.pitch_offer || "whatsapp_bot";
    const resolvedContact = required_contact || config.required_contact || "email_or_phone";

    const addLog = (type, text) => {
      pool.query(
        "UPDATE scans SET logs = logs || $1::jsonb WHERE id = $2",
        [JSON.stringify([{ type, text }]), scanId]
      ).catch(() => {});
    };

    (async () => {
      try {
        const leadsFound = await performDeepSearchDirect(resolvedNiche, resolvedLocation, apiKey, resolvedLimit, {
          ...config,
          pitch_offer: resolvedPitch,
          required_contact: resolvedContact,
        });

        // Save leads
        let saved = 0;
        for (const lead of leadsFound) {
          try {
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, owner_role, owner_contact, qualification_reason, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
               ON CONFLICT DO NOTHING`,
              [
                lead.name, lead.type || "Business", lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.0,
                lead.reviews ? parseInt(lead.reviews, 10) : 0,
                lead.email ? "not contacted" : "no_email",
                lead.instagram || null, lead.website || null, lead.website_status || "unknown",
                lead.linkedin || null, lead.facebook || null, lead.whatsapp || null, lead.twitter || null,
                lead.owner_name || null, lead.owner_role || null, lead.owner_contact || null,
                lead.qualification_reason || null,
                req.userId
              ]
            );
            saved++;
          } catch { /* skip duplicate */ }
        }

        await pool.query(
          "UPDATE scans SET status = 'done', progress = 100, logs = logs || $1::jsonb WHERE id = $2",
          [JSON.stringify([{ type: "success", text: ` Done. ${saved} leads saved.` }]), scanId]
        );
      } catch (err) {
        await pool.query(
          "UPDATE scans SET status = 'error', error = $1 WHERE id = $2",
          [err.message, scanId]
        );
      }
    })();
  } catch (err) {
    console.error("[/api/deepsearch bridge error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Emergency stop endpoint for automation runs
app.post("/api/automation/stop/:jobId", authenticate, (req, res) => {
  const { jobId } = req.params;
  if (activeAutomationRuns.has(jobId)) {
    activeAutomationRuns.set(jobId, true); // true = stop requested
    console.log(`[AUTOMATION] Stop signal sent for job ${jobId} (user ${req.userId})`);
    res.json({ success: true, message: "Stop signal sent. Current step will finish before stopping." });
  } else {
    res.status(404).json({ error: "Job not found or already completed." });
  }
});

// Get active automation status
app.get("/api/automation/status", authenticate, (req, res) => {
  const jobs = [];
  for (const [jobId, stopped] of activeAutomationRuns.entries()) {
    if (jobId.startsWith(`${req.userId}:`)) {
      jobs.push({ jobId, stopped });
    }
  }
  res.json({ jobs });
});

// Bridge: /api/autopilot/run  triggers full campaign cycle (scrape + email)
app.post("/api/autopilot/run", authenticate, async (req, res) => {
  try {
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    if (settingsRes.rowCount === 0) {
      return res.status(400).json({ error: "No campaign settings found. Please complete setup first." });
    }
    const config = decryptConfig(settingsRes.rows[0]);
    config.user_id = req.userId;

    const { niche, location, mode } = req.body;
    if (niche) config.niche = niche;
    if (location) config.location = location;

    // Create a unique jobId and register as active
    const jobId = `${req.userId}:${Date.now()}`;
    activeAutomationRuns.set(jobId, false); // false = not stopped

    // Return immediately with jobId, run in background
    res.json({
      message: "Autopilot run started.",
      jobId,
      log: [{ type: "info", text: "Autopilot run triggered. Check your leads and inbox shortly." }]
    });

    // Background execution
    (async () => {
      try {
        await triggerCronCampaign({
          ...config,
          gemini_key: config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity",
          autopilot_mode: mode || config.autopilot_mode || "both",
          jobId,
          stopSignalFn: () => activeAutomationRuns.get(jobId) === true,
        });
        console.log(`[AUTOPILOT] Manual run complete for user ${req.userId}`);
      } catch (err) {
        console.error(`[AUTOPILOT] Manual run failed for user ${req.userId}:`, err.message);
      } finally {
        activeAutomationRuns.delete(jobId);
      }
    })();
  } catch (err) {
    console.error("[/api/autopilot/run bridge error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Bridge: /api/campaigns/run  send emails to not-contacted leads using AI
app.post("/api/campaigns/run", authenticate, async (req, res) => {
  try {
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(settingsRes.rows[0] || {});

    if (!config.gmail_user || !config.gmail_pass) {
      return res.status(400).json({ error: "Gmail not connected. Go to Settings to connect Gmail first." });
    }

    const leadsRes = await pool.query(
      "SELECT * FROM leads WHERE user_id = $1 AND status = 'not contacted' AND email IS NOT NULL AND email != '' ORDER BY id ASC LIMIT 20",
      [req.userId]
    );
    const leads = leadsRes.rows;

    if (leads.length === 0) {
      return res.json({ message: "No leads to contact.", emailsSent: 0, log: [{ type: "info", text: "No uncontacted leads with email found." }] });
    }

    // Create a jobId for stop signaling
    const jobId = `${req.userId}:cr:${Date.now()}`;
    activeAutomationRuns.set(jobId, false);

    res.json({
      message: `Starting email campaign for ${leads.length} leads in the background.`,
      jobId,
      emailsSent: 0,
      log: [{ type: "info", text: `Sending to ${leads.length} leads...` }]
    });

    // Background email sending
    (async () => {
      let sent = 0;
      const emailedThisRun = new Set(); // dedup within this run
      try {
        const nodemailer = await import("nodemailer");
        const transporter = getSmtpTransport(nodemailer.default, { email: config.gmail_user, pass: decryptText(config.gmail_pass), smtp_host: config.smtp_host, smtp_port: config.smtp_port });

        for (const lead of leads) {
          // Check stop signal
          if (activeAutomationRuns.get(jobId) === true) {
            console.log(`[CAMPAIGNS/RUN] Stop signal received. Stopping after ${sent} emails.`);
            break;
          }

          // Skip if already emailed this address in this run
          const normalizedEmail = (lead.email || "").toLowerCase().trim();
          if (!normalizedEmail || emailedThisRun.has(normalizedEmail)) {
            console.log(`[CAMPAIGNS/RUN] Skipping ${lead.email}  already sent in this run.`);
            continue;
          }

          try {
            // Hard DB re-check: confirm lead is still not-contacted AND no email sent to this address in last 24h
            const freshCheck = await pool.query(
              `SELECT l.id, l.status FROM leads l WHERE l.id = $1 AND l.user_id = $2 AND l.status = 'not contacted'`,
              [lead.id, req.userId]
            );
            if (freshCheck.rowCount === 0) {
              console.log(`[CAMPAIGNS/RUN] Skipping ${lead.email}  status changed to '${lead.status}' (already contacted).`);
              continue;
            }

            const recentEmailCheck = await pool.query(
              `SELECT id FROM emails WHERE user_id = $1 AND from_email = $2 AND time_received > NOW() - INTERVAL '24 hours' LIMIT 1`,
              [req.userId, normalizedEmail]
            );
            if (recentEmailCheck.rowCount > 0) {
              console.log(`[CAMPAIGNS/RUN] Skipping ${lead.email}  email already sent to this address in the last 24h.`);
              // Mark as contacted so it doesn't get picked up again
              await pool.query(
                "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2",
                [lead.id, req.userId]
              );
              continue;
            }

            // Mark as contacted BEFORE sending to prevent race conditions
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'not contacted'",
              [lead.id, req.userId]
            );

            // Generate personalized email using the full AI outreach function
            const { subject, body } = await generateDeveloperOutreach(lead, config);

            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
            });

            // Record in emails table so Inbox shows it
            await pool.query(
              `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
               VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'sent', ARRAY['sent'], $6)`,
              [lead.name, normalizedEmail, lead.name, subject, body.substring(0, 300), req.userId]
            );

            emailedThisRun.add(normalizedEmail);
            sent++;
            console.log(`[CAMPAIGNS/RUN] Sent to ${lead.email} (${sent}/${leads.length})`);
          } catch (e) {
            console.error(`[CAMPAIGNS/RUN] Failed for ${lead.email}:`, e.message);
            // Revert contacted status if send failed
            await pool.query(
              "UPDATE leads SET status = 'not contacted', pipeline_stage = NULL, contacted_at = NULL WHERE id = $1 AND user_id = $2 AND contacted_at > NOW() - INTERVAL '1 minute'",
              [lead.id, req.userId]
            ).catch(() => {});
          }
          // Delay between sends to avoid Gmail rate limits
          await new Promise(r => setTimeout(r, 3000));
        }
      } finally {
        activeAutomationRuns.delete(jobId);
        console.log(`[CAMPAIGNS/RUN] Campaign complete: ${sent}/${leads.length} emails sent for user ${req.userId}`);
        
        // Insert database notification for manual campaign completion
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.userId, ` Campaign Complete`, `Successfully sent ${sent}/${leads.length} outbound campaign emails.`, 'campaign', 'Pipeline']
          );
        } catch (notifErr) {
          console.error("Failed to insert manual campaign notification:", notifErr.message);
        }
      }
    })();
  } catch (err) {
    console.error("[/api/campaigns/run bridge error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 
// ADMIN PANEL ROUTES  (all under /admin/api/* + /admin page)
// 

// Serve the admin HTML panel
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Admin login
app.post("/admin/api/login", adminRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  // Constant-time email compare
  const emailMatch = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const passMatch  = bcryptjs.compareSync(password, ADMIN_PASS_HASH);
  if (!emailMatch || !passMatch) {
    console.warn(`[ADMIN] Failed login attempt from ${req.ip} with email: ${email}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = generateAdminToken();
  console.log(`[ADMIN] Successful login from ${req.ip}`);
  res.json({ token, email: ADMIN_EMAIL });
});

// Admin stats overview
app.get("/admin/api/stats", authenticateAdmin, async (req, res) => {
  try {
    const [users, leads, emails, activity] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_disabled) as disabled, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month FROM users"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'replied') as replied, COUNT(*) FILTER (WHERE status = 'won') as won FROM leads"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE category = 'sent') as sent FROM emails"),
      pool.query("SELECT COUNT(*) as total FROM admin_activity_log"),
    ]);
    res.json({
      users: users.rows[0],
      leads: leads.rows[0],
      emails: emails.rows[0],
      activity: activity.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all users with their stats
app.get("/admin/api/users", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.company_name, u.created_at, u.is_admin, u.is_disabled,
             u.subscription_tier, u.subscription_status, u.copilot_enabled, u.plan_label, u.admin_note,
             (SELECT COUNT(*) FROM leads l WHERE l.user_id = u.id) AS lead_count,
             (SELECT COUNT(*) FROM emails e WHERE e.user_id = u.id) AS email_count,
             (SELECT COUNT(*) FROM emails e WHERE e.user_id = u.id AND e.category = 'sent') AS sent_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new user
app.post("/admin/api/users", authenticateAdmin, async (req, res) => {
  const { company_name, email, password, subscription_tier, plan_label } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) return res.status(409).json({ error: "User with this email already exists" });
    const hashedPw = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (company_name, email, password, subscription_tier, plan_label)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, company_name, subscription_tier, plan_label, created_at`,
      [company_name || "", email, hashedPw, subscription_tier || "agency", plan_label || "Free"]
    );
    const newUser = result.rows[0];
    await pool.query(`INSERT INTO campaign_settings (user_id, company_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [newUser.id, company_name || ""]);
    await pool.query(`INSERT INTO admin_activity_log (action, details, target_user_id) VALUES ($1, $2, $3)`,
      ["CREATE_USER", `Created user: ${email}`, newUser.id]);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user (plan, copilot, disable, note, password)
app.put("/admin/api/users/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { subscription_tier, plan_label, copilot_enabled, is_disabled, is_admin, admin_note, new_password } = req.body;
  try {
    let newPw = undefined;
    if (new_password) {
      newPw = hashPassword(new_password);
    }
    const result = await pool.query(
      `UPDATE users SET
        subscription_tier  = COALESCE($1, subscription_tier),
        plan_label         = COALESCE($2, plan_label),
        copilot_enabled    = COALESCE($3, copilot_enabled),
        is_disabled        = COALESCE($4, is_disabled),
        is_admin           = COALESCE($5, is_admin),
        admin_note         = COALESCE($6, admin_note),
        password           = COALESCE($7, password)
       WHERE id = $8 RETURNING id, email, company_name, subscription_tier, plan_label, copilot_enabled, is_disabled, is_admin, admin_note`,
      [subscription_tier, plan_label, copilot_enabled, is_disabled, is_admin, admin_note, newPw ?? null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
    await pool.query(`INSERT INTO admin_activity_log (action, details, target_user_id) VALUES ($1, $2, $3)`,
      ["UPDATE_USER", `Updated user ${result.rows[0].email}: ${JSON.stringify(req.body)}`, parseInt(id)]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user + all their data
app.delete("/admin/api/users/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [id]);
    if (userRes.rowCount === 0) return res.status(404).json({ error: "User not found" });
    const email = userRes.rows[0].email;
    // Cascade delete (leads, emails, settings etc via FK ON DELETE CASCADE)
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    await pool.query(`INSERT INTO admin_activity_log (action, details) VALUES ($1, $2)`,
      ["DELETE_USER", `Deleted user: ${email} (ID: ${id})`]);
    res.json({ success: true, message: `User ${email} and all their data deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle copilot for a user
app.post("/admin/api/users/:id/toggle-copilot", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE users SET copilot_enabled = NOT copilot_enabled WHERE id = $1 RETURNING id, email, copilot_enabled", [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
    await pool.query(`INSERT INTO admin_activity_log (action, details, target_user_id) VALUES ($1, $2, $3)`,
      ["TOGGLE_COPILOT", `Copilot ${result.rows[0].copilot_enabled ? "enabled" : "disabled"} for ${result.rows[0].email}`, parseInt(id)]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle disable/enable user
app.post("/admin/api/users/:id/toggle-disable", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE users SET is_disabled = NOT is_disabled WHERE id = $1 RETURNING id, email, is_disabled", [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
    await pool.query(`INSERT INTO admin_activity_log (action, details, target_user_id) VALUES ($1, $2, $3)`,
      ["TOGGLE_DISABLE", `Account ${result.rows[0].is_disabled ? "disabled" : "enabled"} for ${result.rows[0].email}`, parseInt(id)]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin activity log
app.get("/admin/api/activity", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.email as user_email FROM admin_activity_log a
       LEFT JOIN users u ON a.target_user_id = u.id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  GOOGLE CALENDAR INTEGRATION HELPER FUNCTIONS 
async function getGoogleCalendarToken(userId) {
  const result = await pool.query(
    "SELECT google_calendar_access_token, google_calendar_refresh_token FROM campaign_settings WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  if (result.rowCount === 0) return null;
  const config = result.rows[0];
  if (!config.google_calendar_access_token) return null;

  return decryptText(config.google_calendar_access_token);
}

async function refreshGoogleCalendarToken(userId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    if (!res.ok) {
      console.error("[CALENDAR REFRESH] Request failed:", await res.text());
      return null;
    }

    const data = await res.json();
    const encryptedAccess = encryptText(data.access_token);
    await pool.query(
      "UPDATE campaign_settings SET google_calendar_access_token = $1 WHERE user_id = $2",
      [encryptedAccess, userId]
    );
    return data.access_token;
  } catch (err) {
    console.error("[CALENDAR REFRESH] Error:", err.message);
    return null;
  }
}



//  GOOGLE CALENDAR INTEGRATION ROUTES 
app.get("/api/integrations/google-calendar/auth", authenticate, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "Google OAuth credentials are not configured on the server. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file." });
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/integrations/google-calendar/callback`;
  const state = req.userId.toString();
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets")}&access_type=offline&prompt=consent&state=${state}`;

  res.json({ authUrl });
});

app.get("/api/integrations/google-calendar/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`/settings?calendar=error&message=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`/settings?calendar=error&message=Missing code or state`);
  }

  const userId = parseInt(state);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/integrations/google-calendar/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[CALENDAR CALLBACK] Exchange failed:", errBody);
      return res.redirect(`/settings?calendar=error&message=Token exchange failed`);
    }

    const tokenData = await tokenRes.json();
    const encryptedAccess = encryptText(tokenData.access_token);
    const encryptedRefresh = tokenData.refresh_token ? encryptText(tokenData.refresh_token) : null;

    if (encryptedRefresh) {
      await pool.query(
        "UPDATE campaign_settings SET google_calendar_access_token = $1, google_calendar_refresh_token = $2, google_calendar_calendar_id = 'primary' WHERE user_id = $3",
        [encryptedAccess, encryptedRefresh, userId]
      );
    } else {
      await pool.query(
        "UPDATE campaign_settings SET google_calendar_access_token = $1, google_calendar_calendar_id = 'primary' WHERE user_id = $2",
        [encryptedAccess, userId]
      );
    }

    res.redirect(`/settings?calendar=success`);
  } catch (err) {
    console.error("[CALENDAR CALLBACK] Error:", err.message);
    res.redirect(`/settings?calendar=error&message=${encodeURIComponent(err.message)}`);
  }
});

app.delete("/api/integrations/google-calendar/disconnect", authenticate, async (req, res) => {
  try {
    await pool.query(
      "UPDATE campaign_settings SET google_calendar_access_token = NULL, google_calendar_refresh_token = NULL, google_calendar_calendar_id = NULL WHERE user_id = $1",
      [req.userId]
    );
    res.json({ message: "Google Calendar disconnected successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/integrations/google-calendar/suggestions", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM calendar_event_suggestions WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/integrations/google-calendar/suggestions/:id/dismiss", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      "UPDATE calendar_event_suggestions SET status = 'dismissed' WHERE id = $1 AND user_id = $2",
      [id, req.userId]
    );
    res.json({ message: "Suggestion dismissed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/integrations/google-calendar/suggestions/:id/confirm", authenticate, async (req, res) => {
  const { id } = req.params;
  const { eventTime } = req.body;
  try {
    const sugRes = await pool.query(
      "SELECT * FROM calendar_event_suggestions WHERE id = $1 AND user_id = $2",
      [id, req.userId]
    );
    if (sugRes.rowCount === 0) {
      return res.status(404).json({ error: "Suggestion not found" });
    }
    const sug = sugRes.rows[0];

    const eventTimeStr = eventTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const eventSuccess = await createGoogleCalendarEvent(req.userId, {
      title: sug.title,
      description: sug.description,
      attendeeEmail: sug.lead_email,
      startTime: eventTimeStr
    });

    if (eventSuccess) {
      await pool.query(
        "UPDATE calendar_event_suggestions SET status = 'confirmed' WHERE id = $1 AND user_id = $2",
        [id, req.userId]
      );
      res.json({ success: true, message: "Calendar event scheduled successfully!" });
    } else {
      res.status(500).json({ error: "Failed to schedule event on Google Calendar. Verify authorization." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/integrations/google-calendar/events", authenticate, async (req, res) => {
  const { title, description, attendeeEmail, startTime } = req.body;
  if (!title || !attendeeEmail || !startTime) {
    return res.status(400).json({ error: "Missing required fields (title, attendeeEmail, startTime)" });
  }
  try {
    const success = await createGoogleCalendarEvent(req.userId, {
      title, description, attendeeEmail, startTime
    });
    if (success) {
      res.json({ success: true, message: "Calendar event scheduled successfully!" });
    } else {
      res.status(500).json({ error: "Failed to schedule event on Google Calendar. Verify connection." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//  GOOGLE SHEETS INTEGRATION HELPER & ROUTES 
async function syncLeadToGoogleSheets(userId, lead) {
  try {
    const settingsRes = await pool.query(
      "SELECT google_sheets_spreadsheet_id, google_sheets_sync_enabled, google_calendar_access_token, google_calendar_refresh_token FROM campaign_settings WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (settingsRes.rowCount === 0) return false;
    const settings = settingsRes.rows[0];
    if (!settings.google_sheets_sync_enabled || !settings.google_sheets_spreadsheet_id) {
      return false;
    }

    let accessToken = settings.google_calendar_access_token ? decryptText(settings.google_calendar_access_token) : null;
    if (!accessToken) return false;

    const spreadsheetId = settings.google_sheets_spreadsheet_id;

    const appendRow = async (token) => {
      const range = "Sheet1!A:G";
      const values = [
        [
          lead.id ? String(lead.id) : "",
          lead.name || "",
          lead.email || "",
          lead.company || "",
          lead.pipeline_stage || "",
          lead.last_contacted_at ? new Date(lead.last_contacted_at).toISOString() : new Date().toISOString(),
          lead.notes || ""
        ]
      ];

      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values
        })
      });
    };

    let res = await appendRow(accessToken);
    if (res.status === 401 && settings.google_calendar_refresh_token) {
      const refreshDecrypted = decryptText(settings.google_calendar_refresh_token);
      const newAccess = await refreshGoogleCalendarToken(userId, refreshDecrypted);
      if (newAccess) {
        res = await appendRow(newAccess);
      }
    }

    if (!res.ok) {
      console.error("[GOOGLE SHEETS SYNC] Append failed:", await res.text());
      return false;
    }

    console.log(`[GOOGLE SHEETS SYNC] Successfully synced lead ${lead.email} to spreadsheet ${spreadsheetId}`);
    return true;
  } catch (err) {
    console.error("[GOOGLE SHEETS SYNC] Error:", err.message);
    return false;
  }
}

app.post("/api/integrations/google-sheets/test", authenticate, async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "Spreadsheet ID is required" });
    }

    const settingsRes = await pool.query(
      "SELECT google_calendar_access_token, google_calendar_refresh_token FROM campaign_settings WHERE user_id = $1 LIMIT 1",
      [req.userId]
    );
    if (settingsRes.rowCount === 0 || !settingsRes.rows[0].google_calendar_access_token) {
      return res.status(400).json({ error: "Google account not connected. Please connect Google Calendar first." });
    }

    const settings = settingsRes.rows[0];
    let accessToken = decryptText(settings.google_calendar_access_token);

    const getMeta = async (token) => {
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
    };

    let apiRes = await getMeta(accessToken);
    if (apiRes.status === 401 && settings.google_calendar_refresh_token) {
      const refreshDecrypted = decryptText(settings.google_calendar_refresh_token);
      const newAccess = await refreshGoogleCalendarToken(req.userId, refreshDecrypted);
      if (newAccess) {
        apiRes = await getMeta(newAccess);
      }
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Spreadsheet check failed: ${errText}` });
    }

    const data = await apiRes.json();
    res.json({ title: data.properties.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/integrations/google-sheets/sync", authenticate, async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    const settingsRes = await pool.query(
      "SELECT google_sheets_spreadsheet_id, google_calendar_access_token, google_calendar_refresh_token FROM campaign_settings WHERE user_id = $1 LIMIT 1",
      [req.userId]
    );
    if (settingsRes.rowCount === 0 || !settingsRes.rows[0].google_calendar_access_token) {
      return res.status(400).json({ error: "Google account not connected. Please connect Google Calendar first." });
    }
    const settings = settingsRes.rows[0];
    const targetSpreadsheetId = spreadsheetId || settings.google_sheets_spreadsheet_id;
    if (!targetSpreadsheetId) {
      return res.status(400).json({ error: "No spreadsheet ID specified." });
    }

    let accessToken = decryptText(settings.google_calendar_access_token);
    
    // Fetch all leads
    const leadsRes = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    if (leadsRes.rowCount === 0) {
      return res.json({ message: "No leads to sync.", count: 0 });
    }

    const values = [
      ["ID", "Name", "Email", "Company", "Pipeline Stage", "Last Contacted", "Notes"]
    ];
    leadsRes.rows.forEach(lead => {
      values.push([
        lead.id ? String(lead.id) : "",
        lead.name || "",
        lead.email || "",
        lead.company || "",
        lead.pipeline_stage || "",
        lead.last_contacted_at ? new Date(lead.last_contacted_at).toISOString() : "",
        lead.notes || ""
      ]);
    });

    const updateSheet = async (token) => {
      const range = `Sheet1!A1:G${values.length}`;
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${range}?valueInputOption=RAW`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values
        })
      });
    };

    let apiRes = await updateSheet(accessToken);
    if (apiRes.status === 401 && settings.google_calendar_refresh_token) {
      const refreshDecrypted = decryptText(settings.google_calendar_refresh_token);
      const newAccess = await refreshGoogleCalendarToken(req.userId, refreshDecrypted);
      if (newAccess) {
        apiRes = await updateSheet(newAccess);
      }
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Failed to update sheet: ${errBody}` });
    }

    res.json({ message: `Successfully synced ${leadsRes.rowCount} leads to Google Sheet.`, count: leadsRes.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve React built frontend in production
app.use(express.static(path.join(__dirname, "dist")));

app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});


// App initialization
setupDatabase().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Syntek Backend Express server running on port ${PORT}`);
  });
  server.timeout = 900000; // 15 minutes
  server.keepAliveTimeout = 900000; // 15 minutes
  server.headersTimeout = 905000; // 15 minutes + padding
  startCronScheduler();
});


