import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get settings for user 19
const settingsRes = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = settingsRes.rows[0];

console.log('--- TESTING CAMPAIGN AUTOMATION IMAP SENT APPEND ---');
console.log('User:', config.gmail_user);
console.log('SMTP Host:', config.smtp_host || 'mail.privateemail.com');
console.log('IMAP Host:', config.imap_host || 'mail.privateemail.com');

const testLead = {
  id: 999999,
  name: 'Test Business',
  email: 'test-campaign-automation@example.com',
  city: 'Austin, TX'
};

const subject = `Campaign Test: ${testLead.name}`;
const htmlBody = `<p>Hi there,</p><p>This is a live test of campaign automation IMAP Sent auto-save.</p>`;

// Test helper directly
const user = config.gmail_user;
let pass = config.gmail_pass;
if (pass.startsWith("enc:")) {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "syntek-super-secure-encryption-key-2026-32-chars-long";
  const getEncryptionKey = () => crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const parts = pass.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  pass = decipher.update(parts[2], "hex", "utf8") + decipher.final("utf8");
}

const client = new ImapFlow({
  host: config.imap_host || 'mail.privateemail.com',
  port: 993,
  secure: true,
  auth: { user, pass },
  logger: false
});

await client.connect();
const mailboxes = await client.list();
const sentBox = mailboxes.find(m => (m.specialUse && m.specialUse.toLowerCase() === '\\sent') || m.path.toLowerCase().includes("sent"))?.path || "Sent";

const rawMessage = [
  `From: "${config.sender_name || 'Syntek'}" <${user}>`,
  `To: ${testLead.email}`,
  `Subject: ${subject}`,
  `Date: ${new Date().toUTCString()}`,
  `MIME-Version: 1.0`,
  `Content-Type: text/html; charset=utf-8`,
  ``,
  htmlBody
].join('\r\n');

const lock = await client.getMailboxLock(sentBox);
try {
  await client.append(sentBox, Buffer.from(rawMessage), ['\\Seen']);
  console.log(`✅ AUTOMATION TEST PASSED! Email appended to PrivateEmail Sent folder "${sentBox}"!`);
} finally {
  lock.release();
}

await client.logout();
await pool.end();
