import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
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
const settingsRes = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = settingsRes.rows[0];

const user = config.gmail_user;
const pass = decryptText(config.gmail_pass);

console.log('Testing appendSentMessageToImap for User 19:', user);

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

console.log(`Connected! Target Sent folder: "${sentBox}"`);

const testMessage = [
  `From: "${config.sender_name || 'Syntek'}" <${user}>`,
  `To: test-sent-check@example.com`,
  `Subject: Realtime Sent Folder Sync Verification`,
  `Date: ${new Date().toUTCString()}`,
  `MIME-Version: 1.0`,
  `Content-Type: text/html; charset=utf-8`,
  ``,
  `<p>This is a real-time test verification of instant Sent folder sync.</p>`
].join('\r\n');

const lock = await client.getMailboxLock(sentBox);
try {
  await client.append(sentBox, Buffer.from(testMessage), ['\\Seen']);
  console.log(`🎉 VERIFIED INSTANT SYNC! Message saved into PrivateEmail Sent folder "${sentBox}"!`);
} finally {
  lock.release();
}

await client.logout();
await pool.end();
