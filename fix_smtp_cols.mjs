import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

console.log('Checking campaign_settings columns...');

// Check existing columns
const colCheck = await pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'campaign_settings'
  ORDER BY column_name
`);
const existing = colCheck.rows.map(r => r.column_name);
console.log('Existing columns:', existing.filter(c => c.includes('smtp') || c.includes('imap') || c.includes('gmail')));

// Add missing columns
const toAdd = [
  ['smtp_host', 'VARCHAR(255)'],
  ['smtp_port', 'INTEGER'],
  ['imap_host', 'VARCHAR(255)'],
  ['imap_port', 'INTEGER'],
];

for (const [col, type] of toAdd) {
  if (!existing.includes(col)) {
    await pool.query(`ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS ${col} ${type} DEFAULT NULL`);
    console.log(`✓ Added column: ${col}`);
  } else {
    console.log(`✓ Already exists: ${col}`);
  }
}

// Check current values
const current = await pool.query(`
  SELECT user_id, gmail_user, smtp_host, smtp_port, imap_host, imap_port 
  FROM campaign_settings 
  LIMIT 5
`);
console.log('\nCurrent settings rows:');
for (const row of current.rows) {
  console.log(` User ${row.user_id} (${row.gmail_user}): smtp=${row.smtp_host}:${row.smtp_port} imap=${row.imap_host}:${row.imap_port}`);
}

// If hello@trynoryvex.com has no smtp_host, set it now
const updated = await pool.query(`
  UPDATE campaign_settings 
  SET smtp_host = 'mail.privateemail.com',
      smtp_port = 587,
      imap_host = 'mail.privateemail.com',
      imap_port = 993
  WHERE gmail_user = 'hello@trynoryvex.com' AND (smtp_host IS NULL OR smtp_host = '')
  RETURNING user_id, gmail_user, smtp_host, imap_host
`);
if (updated.rowCount > 0) {
  console.log('\n✓ Set SMTP/IMAP for hello@trynoryvex.com:', updated.rows[0]);
} else {
  console.log('\n(smtp_host already set or email not found)');
}

await pool.end();
console.log('\nDone.');
