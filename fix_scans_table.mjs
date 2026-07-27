import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('Fixing scans table columns...');

await pool.query(`
  ALTER TABLE scans 
  ADD COLUMN IF NOT EXISTS total_found INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_emails INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
`);

console.log('✓ Added missing columns (total_found, total_emails, status) to scans table!');
await pool.end();
