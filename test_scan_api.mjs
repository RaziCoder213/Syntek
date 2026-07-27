import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Simulate performDeepSearchDirect call
async function performDeepSearchDirect(niche, location, apiKey, limit = 5) {
  console.log(`[TEST DEEPSEARCH] Running search for "${niche}" in "${location}"...`);
  const cleanNiche = niche.split(',')[0].trim();
  const cleanLoc = location.split(',')[0].trim();
  return [
    { name: `Denver Dental Spa`, type: cleanNiche, city: location, email: `info@denverdentalspa.com`, phone: "(303) 555-0199", rating: 4.9, reviews: 180, website: `https://denverdentalspa.com`, owner_name: "Dr. Miller" },
    { name: `Cherry Creek Smiles`, type: cleanNiche, city: location, email: `office@cherrycreeksmiles.com`, phone: "(303) 555-0122", rating: 4.8, reviews: 95, website: `https://cherrycreeksmiles.com`, owner_name: "Dr. Adams" }
  ];
}

const rawLeads = await performDeepSearchDirect("Clinics, dentists", "Denver, CO");
console.log(`Found ${rawLeads.length} leads:`, rawLeads);

let saved = 0;
for (const lead of rawLeads) {
  const res = await pool.query(
    `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, owner_name, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'not contacted', $8, $9, 19)
     ON CONFLICT DO NOTHING RETURNING id`,
    [lead.name, lead.type, lead.city, lead.email, lead.phone, lead.rating, lead.reviews, lead.website, lead.owner_name]
  );
  if (res.rowCount > 0) saved++;
}

console.log(`🎉 SUCCESS! Saved ${saved} leads to database for User 19!`);

const checkLeads = await pool.query('SELECT id, name, email, city, status FROM leads WHERE user_id = 19');
console.log('Current Leads in DB for User 19:', checkLeads.rows);

await pool.end();
