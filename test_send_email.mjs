import pg from 'pg';
import nodemailer from 'nodemailer';
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

const pass = decryptText(config.gmail_pass);

console.log('Testing SMTP connection for:', config.gmail_user);
console.log('Host:', config.smtp_host || 'mail.privateemail.com', 'Port:', config.smtp_port || 587);

const transporter = nodemailer.createTransport({
  host: config.smtp_host || 'mail.privateemail.com',
  port: parseInt(config.smtp_port) || 587,
  secure: false,
  auth: { user: config.gmail_user, pass: pass },
  tls: { rejectUnauthorized: false }
});

try {
  await transporter.verify();
  console.log('SUCCESS: SMTP connection verified for', config.gmail_user, 'using mail.privateemail.com!');
} catch (err) {
  console.error('ERROR: SMTP verification failed:', err.message);
}

await pool.end();
