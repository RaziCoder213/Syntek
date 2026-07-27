import { ImapFlow } from 'imapflow';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get settings for user 19
const s = await pool.query('SELECT * FROM campaign_settings WHERE user_id = 19 LIMIT 1');
const config = s.rows[0] || {};

const user = config.gmail_user || 'hello@trynoryvex.com';
const pass = 'Razee121501!';
const host = config.imap_host || 'mail.privateemail.com';
const port = parseInt(config.imap_port || '993');

console.log(`Connecting to IMAP ${host}:${port} for ${user}...`);

const client = new ImapFlow({
  host,
  port,
  secure: true,
  auth: { user, pass },
  logger: false
});

try {
  await client.connect();
  console.log('✅ Connected to IMAP successfully!');

  const mailboxes = await client.list();
  console.log('Available Mailboxes:');
  for (const m of mailboxes) {
    console.log(`- ${m.path} (specialUse: ${m.specialUse || 'none'})`);
  }

  // Find Sent folder
  const sentBox = mailboxes.find(m => m.specialUse === '\\Sent' || m.path.toLowerCase().includes('sent'))?.path || 'Sent';
  console.log(`Target Sent folder: '${sentBox}'`);

  const rawMessage = `From: "Muhammad Razi" <${user}>
To: info@test.com
Subject: Test IMAP Append
Date: ${new Date().toUTCString()}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<p>This is a test sent email copy.</p>`;

  const lock = await client.getMailboxLock(sentBox);
  try {
    await client.append(sentBox, rawMessage, ['\\Seen']);
    console.log(`✅ Successfully appended message to '${sentBox}' folder!`);
  } finally {
    lock.release();
  }

  await client.logout();
} catch (err) {
  console.error('❌ IMAP Append Error:', err.message);
}

await pool.end();
