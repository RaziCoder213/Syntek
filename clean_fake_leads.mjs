import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('=== CLEANING MOCK / FAKE FALLBACK LEADS FOR USER 19 ===');

const deleteRes = await pool.query(`
  DELETE FROM leads 
  WHERE user_id = 19 
    AND (
      email LIKE '%@austincafesbrunch%' OR 
      email LIKE '%@apexcafesbrunch%' OR 
      email LIKE '%@highlandcafesbrunch%' OR 
      email LIKE '%@apexclinicsco%' OR 
      email LIKE '%@highlandclinics%' OR 
      email LIKE '%@denverdentalcenter%' OR 
      email LIKE '%@highlandsmilesdenver%' OR 
      email LIKE '%@denverdentalspa%' OR 
      email LIKE '%@cherrycreeksmiles%' OR 
      email LIKE '%@apex%' OR 
      email LIKE '%@highland%'
    );
`);

console.log(`✓ Deleted ${deleteRes.rowCount} fake/mock fallback leads!`);

const remainingRes = await pool.query('SELECT COUNT(*) FROM leads WHERE user_id = 19');
console.log(`Total REAL leads remaining for User 19: ${remainingRes.rows[0].count}`);

await pool.end();
