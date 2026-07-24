import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

// Add all columns if they don't exist
const cols = [
  `ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255) DEFAULT NULL;`,
  `ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;`,
  `ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255) DEFAULT NULL;`,
  `ALTER TABLE user_outboxes ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;`,
];
for (const sql of cols) {
  try { await pool.query(sql); console.log('OK:', sql.substring(0, 60)); } 
  catch(e) { console.log('Skip:', e.message); }
}

// Show existing outboxes
const all = await pool.query('SELECT id, email FROM user_outboxes');
console.log('Existing outboxes:', JSON.stringify(all.rows));

// Update the outbox for hello@trynoryvex.com
const res = await pool.query(
  `UPDATE user_outboxes 
   SET smtp_host = 'mail.privateemail.com', smtp_port = 587, 
       imap_host = 'mail.privateemail.com', imap_port = 993 
   WHERE email = 'hello@trynoryvex.com' 
   RETURNING id, email, smtp_host, smtp_port, imap_host, imap_port`
);

if (res.rowCount === 0) {
  console.log('No outbox found for hello@trynoryvex.com');
} else {
  console.log('Updated:', JSON.stringify(res.rows[0]));
}

await pool.end();
