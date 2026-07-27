import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== DEDUPLICATING LEADS FOR USER 19 ===');

// Delete duplicates based on (user_id, LOWER(name))
const dedupNameRes = await pool.query(`
  DELETE FROM leads a USING leads b
  WHERE a.id > b.id
    AND a.user_id = b.user_id
    AND a.user_id = 19
    AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name));
`);

console.log(`✓ Deleted ${dedupNameRes.rowCount} duplicate lead rows by Name.`);

// Delete duplicates based on (user_id, LOWER(email))
const dedupEmailRes = await pool.query(`
  DELETE FROM leads a USING leads b
  WHERE a.id > b.id
    AND a.user_id = b.user_id
    AND a.user_id = 19
    AND a.email IS NOT NULL AND a.email != ''
    AND LOWER(TRIM(a.email)) = LOWER(TRIM(b.email));
`);

console.log(`✓ Deleted ${dedupEmailRes.rowCount} duplicate lead rows by Email.`);

console.log('=== CREATING STRICT UNIQUE DATABASE INDEXES ===');

await pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_lead_name 
  ON leads(user_id, LOWER(TRIM(name)));

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_lead_email 
  ON leads(user_id, LOWER(TRIM(email))) 
  WHERE email IS NOT NULL AND email != '';
`);

console.log('✓ Strict Unique Database Constraints Created! PostgreSQL will now physically block any duplicate lead inserts.');

const finalCount = await pool.query('SELECT COUNT(*) FROM leads WHERE user_id = 19');
console.log(`🎉 Total UNIQUE REAL leads in database for User 19: ${finalCount.rows[0].count}`);

const leadList = await pool.query('SELECT id, name, email, city, status FROM leads WHERE user_id = 19 ORDER BY id ASC');
console.table(leadList.rows);

await pool.end();
