import pg from 'pg';
import { ImapFlow } from 'imapflow';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "syntek-super-secure-encryption-key-2026-32-chars-long";

function getEncryptionKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function decryptText(encryptedText) {
  if (!encryptedText) return "";
  if (!encryptedText.includes(":")) return encryptedText;
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
    return encryptedText;
  }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get outbox or settings for user 19
const settingsRes = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = settingsRes.rows[0];
if (!config) {
  console.log('User 19 settings not found.');
  process.exit(0);
}

const pass = decryptText(config.gmail_pass);
const emailUser = config.gmail_user;

console.log('Fetching sent emails from database for User 19...');
const sentEmailsRes = await pool.query("SELECT * FROM emails WHERE user_id = 19 AND (category = 'sent' OR labels @> ARRAY['sent'])");
console.log(`Found ${sentEmailsRes.rowCount} sent emails in database.`);

if (sentEmailsRes.rowCount === 0) {
  await pool.end();
  process.exit(0);
}

const imapHost = config.imap_host || config.smtp_host || 'mail.privateemail.com';
const imapPort = config.imap_port || 993;

console.log(`Connecting to IMAP ${imapHost}:${imapPort} for ${emailUser}...`);
const client = new ImapFlow({
  host: imapHost,
  port: imapPort,
  secure: imapPort === 993,
  auth: { user: emailUser, pass: pass },
  logger: false
});

try {
  await client.connect();
  console.log('✅ Connected to IMAP!');

  let sentPath = 'Sent';
  try {
    const list = await client.list();
    const sentBox = list.find(b => (b.specialUse && b.specialUse.toLowerCase() === '\\sent') || b.name.toLowerCase().includes('sent'));
    if (sentBox) sentPath = sentBox.path;
  } catch (e) {}

  console.log(`Targeting IMAP Sent folder: "${sentPath}"`);

  let count = 0;
  for (const e of sentEmailsRes.rows) {
    const mimeMessage = [
      `From: "${config.sender_name || 'Syntek'}" <${emailUser}>`,
      `To: ${e.from_email}`,
      `Subject: ${e.subject || 'Outreach'}`,
      `Content-Type: text/html; charset=utf-8`,
      `Date: ${new Date(e.time_received || Date.now()).toUTCString()}`,
      ``,
      e.preview || e.body || ''
    ].join('\r\n');

    try {
      await client.append(sentPath, Buffer.from(mimeMessage), ['\\Seen']);
      count++;
    } catch (appErr) {
      console.warn(`Could not append email ID ${e.id}:`, appErr.message);
    }
  }

  console.log(`🎉 SUCCESS! Uploaded ${count}/${sentEmailsRes.rowCount} sent emails into PrivateEmail Sent folder "${sentPath}"!`);
  await client.logout();
} catch (err) {
  console.error('IMAP Backfill error:', err.message);
}

await pool.end();
