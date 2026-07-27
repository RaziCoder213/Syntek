import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function updateAddress() {
  await pool.query("UPDATE campaign_settings SET company_address = 'Karachi, Pakistan'");
  const res = await pool.query("SELECT company_name, sender_name, company_address FROM campaign_settings LIMIT 1");
  console.log('Updated campaign_settings in Supabase:', res.rows[0]);
  await pool.end();
}

updateAddress().catch(err => { console.error(err); process.exit(1); });
