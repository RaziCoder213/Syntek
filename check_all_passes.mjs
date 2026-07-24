import pg from 'pg';
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
    return `[Decryption Failed: ${err.message}]`;
  }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const cs = await pool.query('SELECT user_id, gmail_user, gmail_pass FROM campaign_settings WHERE user_id = 19');
const ob = await pool.query('SELECT user_id, email, password FROM user_outboxes WHERE user_id = 19');

console.log('campaign_settings decrypted pass:', decryptText(cs.rows[0]?.gmail_pass));
console.log('user_outboxes decrypted pass:', decryptText(ob.rows[0]?.password));

await pool.end();
