import pg from 'pg';
import dotenv from 'dotenv';
import { createTrialRequest } from '../services/trialService.js';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verifyIdentity() {
  console.log('================ SECTION 1: NORYVEX CONFIG & IDENTITY CHECK ================');

  // 1. Fetch Campaign Settings for User 19 (or first user)
  const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = 19 OR user_id = 1 LIMIT 1");
  const settings = settingsRes.rows[0] || {};

  console.log('\n--- LIVE CAMPAIGN SETTINGS ---');
  console.log('User ID:', settings.user_id);
  console.log('Sender Name:', settings.sender_name);
  console.log('Sender Role:', settings.sender_role);
  console.log('Company Name:', settings.company_name);
  console.log('Company Address:', settings.company_address);
  console.log('Outbound Sending Email (gmail_user):', settings.gmail_user);
  console.log('SMTP Host:', settings.smtp_host || "mail.privateemail.com");
  console.log('IMAP Host:', settings.imap_host || "mail.privateemail.com");
  console.log('Daily Send Limit (Configured):', settings.daily_lead_limit);

  // 2. Perform Trial Request end-to-end test submission
  console.log('\n--- TESTING END-TO-END TRIAL REQUEST FORM SUBMISSION ---');
  const testTrial = await createTrialRequest({
    userId: settings.user_id || 19,
    businessName: "Noryvex Demo Practice",
    contactName: "Dr. Alex Vance",
    email: "alex.vance@noryvex-demo-test.com",
    phone: "(512) 555-0199",
    niche: "Medical Clinic",
    agentScope: "both"
  });

  console.log('Trial Creation Output:', testTrial);

  // Verify in trial_requests table
  const checkTrialRes = await pool.query("SELECT * FROM trial_requests WHERE id = $1", [testTrial.id]);
  console.log('DB Row in trial_requests table:');
  console.table(checkTrialRes.rows);

  await pool.end();
}

verifyIdentity().catch(err => { console.error(err); process.exit(1); });
