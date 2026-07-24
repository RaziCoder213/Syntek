import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get real encrypted pass from campaign_settings
const cs = await pool.query('SELECT user_id, gmail_user, gmail_pass FROM campaign_settings WHERE user_id = 19');
const realEncryptedPass = cs.rows[0].gmail_pass;

console.log('Syncing real password from campaign_settings to user_outboxes for User 19...');
await pool.query(
  'UPDATE user_outboxes SET password = $1, smtp_host = $2, smtp_port = $3, imap_host = $4, imap_port = $5, is_active = TRUE WHERE user_id = 19',
  [realEncryptedPass, 'mail.privateemail.com', 587, 'mail.privateemail.com', 993]
);
console.log('✅ user_outboxes password synced!');

await pool.end();
