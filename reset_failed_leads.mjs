import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('Checking leads marked as contacted without sent email record for User 19...');

// Find leads for user 19 marked as contacted where no email exists in the emails table
const res = await pool.query(`
  UPDATE leads 
  SET status = 'not contacted', pipeline_stage = 'New', contacted_at = NULL 
  WHERE user_id = 19 
    AND status = 'contacted' 
    AND email NOT IN (SELECT DISTINCT from_email FROM emails WHERE user_id = 19 AND category = 'sent')
  RETURNING id, name, email
`);

console.log(`✅ Reset ${res.rowCount} failed leads back to 'not contacted':`);
for (const row of res.rows) {
  console.log(`- ${row.name} (${row.email})`);
}

await pool.end();
