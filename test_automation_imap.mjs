import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'syntek-super-secure-encryption-key-2026-32-chars-long';
function getEncryptionKey() { return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(); }
function decryptText(encryptedText) {
  if (!encryptedText) return '';
  if (!encryptedText.includes(':')) return encryptedText;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;
  const [ivHex, authTagHex, encrypted] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) { return encryptedText; }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const settingsRes = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = settingsRes.rows[0];

async function appendSentMessageToImap(config, { to, subject, htmlBody }) {
  try {
    const user = config.gmail_user;
    let pass = decryptText(config.gmail_pass || "");
    if (!user || !pass) return;

    const host = config.imap_host || config.smtp_host || "mail.privateemail.com";
    const port = parseInt(config.imap_port || "993");

    if (host.includes("gmail.com") || user.includes("gmail.com")) return;

    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false
    });

    await client.connect();
    const mailboxes = await client.list();
    const sentBox = mailboxes.find(m => (m.specialUse && m.specialUse.toLowerCase() === '\\sent') || m.path.toLowerCase().includes("sent"))?.path || "Sent";

    const senderName = config.sender_name || "Syntek";
    const rawMessage = [
      `From: "${senderName}" <${user}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody || ""
    ].join("\r\n");

    const lock = await client.getMailboxLock(sentBox);
    try {
      await client.append(sentBox, Buffer.from(rawMessage), ["\\Seen"]);
      console.log(`🎉 [IMAP SENT SYNC SUCCESS] Saved sent email to '${sentBox}' folder for ${to}!`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error("[IMAP SENT SYNC ERROR] Failed saving email to Sent folder:", err.message);
  }
}

await appendSentMessageToImap(config, {
  to: 'automation-live-verify@example.com',
  subject: 'Automation Verification Test',
  htmlBody: '<p>Automation test payload</p>'
});

await pool.end();
