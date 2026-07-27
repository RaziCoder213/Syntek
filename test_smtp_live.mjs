import nodemailer from 'nodemailer';
import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
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

const user = config.gmail_user;
const pass = decryptText(config.gmail_pass);

console.log(`Testing SMTP Send for ${user} via ${config.smtp_host || 'mail.privateemail.com'}:587...`);

const transporter = nodemailer.createTransport({
  host: config.smtp_host || 'mail.privateemail.com',
  port: parseInt(config.smtp_port || '587'),
  secure: false,
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});

try {
  const info = await transporter.sendMail({
    from: `"${config.sender_name || 'Syntek'}" <${user}>`,
    to: 'test-smtp-limit-check@example.com',
    subject: 'Live SMTP Test',
    text: 'Testing if Namecheap SMTP is accepting messages right now.'
  });
  console.log('🎉 SMTP ACCEPTED EMAIL:', info.response);
} catch (err) {
  console.error('❌ NAMECHEAP SMTP REJECTED EMAIL:', err.message);
}

await pool.end();
