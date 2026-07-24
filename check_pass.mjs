import pg from 'pg';
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

const res = await pool.query('SELECT user_id, gmail_user, gmail_pass FROM campaign_settings WHERE user_id = 19');
const config = res.rows[0];

let p1 = config.gmail_pass;
console.log('Raw DB pass length:', p1.length);
let p2 = decryptText(p1);
console.log('Decrypted 1x length:', p2.length, 'val:', p2.substring(0, 10) + '...');
let p3 = decryptText(p2);
console.log('Decrypted 2x length:', p3.length, 'val:', p3.substring(0, 10) + '...');
let p4 = decryptText(p3);
console.log('Decrypted 3x length:', p4.length, 'val:', p4.substring(0, 10) + '...');

await pool.end();
