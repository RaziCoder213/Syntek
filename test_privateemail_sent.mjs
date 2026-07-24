import pg from 'pg';
import { ImapFlow } from 'imapflow';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || "antigravity-syntek-secret-key-32-chars!!";
  return crypto.createHash("sha256").update(secret).digest();
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

const res = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19');
const config = res.rows[0];

const emailUser = config.gmail_user;
const pass = decryptText(config.gmail_pass);

console.log('Connecting to Namecheap Private Email IMAP:', emailUser);

const client = new ImapFlow({
  host: 'mail.privateemail.com',
  port: 993,
  secure: true,
  auth: { user: emailUser, pass: pass },
  logger: false
});

try {
  await client.connect();
  console.log('✅ Connected to PrivateEmail IMAP!');

  // List all mailboxes to see exact folder structure
  const list = await client.list();
  console.log('\n--- MAILBOX FOLDER LIST ---');
  for (const box of list) {
    console.log(`Path: "${box.path}", SpecialUse: ${box.specialUse || 'none'}, Name: ${box.name}`);
  }
  console.log('---------------------------\n');

  // Find exact Sent folder path
  let sentBox = list.find(b => b.specialUse === '\\Sent' || b.path.toLowerCase().includes('sent') || b.name.toLowerCase().includes('sent'));
  const targetFolder = sentBox ? sentBox.path : 'Sent';
  console.log(`Targeting Sent Folder Path: "${targetFolder}"`);

  // Construct test RFC822 email message
  const testMessage = [
    `From: "Syntek AI" <${emailUser}>`,
    `To: ${emailUser}`,
    `Subject: [TEST SENT SYNC] Syntek IMAP Sent Folder Verification Test`,
    `Content-Type: text/html; charset=utf-8`,
    `Date: ${new Date().toUTCString()}`,
    ``,
    `<h3>Syntek IMAP Sent Folder Sync Test</h3><p>This is a test email automatically appended to your PrivateEmail Sent folder to confirm IMAP Sent folder synchronization is working 100%.</p>`
  ].join('\r\n');

  const appendResult = await client.append(targetFolder, Buffer.from(testMessage), ['\\Seen']);
  console.log(`\n🎉 SUCCESS! Appended test email to PrivateEmail Sent folder "${targetFolder}". Result:`, appendResult);

  await client.logout();
} catch (err) {
  console.error('❌ Error appending to PrivateEmail IMAP:', err.message);
}

await pool.end();
