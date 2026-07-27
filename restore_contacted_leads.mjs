import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// List of contacted emails provided by user from PrivateEmail Sent folder
const contactedEmails = [
  'info@trudentistryaustin.com',
  'info@lonestarpediatricdental.com',
  'uniquesmiledentistry@yahoo.com',
  'appointment@austinlaserdentist.com',
  'info@bartonoaksdental.com',
  'info@greathillsdentalstudio.net',
  'office@buckinghamdental.com',
  'info@lifetimedental.com',
  'hello@thetoothbar.com',
  'info@theuniversaldenver.com',
  'smile@waterloodentalatx.com',
  'info@smile360atx.com',
  'hello@shoalcreekdental.com',
  'smiles@whdentalarts.com',
  'dentist@themeadowsdentalcare.com',
  'hello@enameldentistry.com',
  'info@thompsondentistry.com',
  'dentist@forestfamily.com',
  'lucent@austxdentalgroup.com',
  'dentist@austinforestfamily.com',
  'office@austinelitesmiles.com',
  'info@lucentdentistryaustin.com',
  'austinartisticdental@gmail.com',
  'downtown@austincosmetic.com',
  'info@austindentalworks.com',
  'admin@leadgendirect.com',
  'info@smileaustin.com',
  'info@moontowerdental.com',
  'info@techridgedental.com',
  'info@austindds.com',
  'sales@victorymedical.com',
  'dentalcare@dentistinaustintx.com',
  'webreporting@gargle.com',
  'ismile@lilacdentaltx.com',
  'barotzdental@barotzdental.com',
  'monkeynestcoffee@gmail.com',
  'smile@dentalelements.com',
  'centralfamilydentistry@outlook.com',
  'info@metrodentalcare.com',
  'info@pearldentistrydenver.com',
  'smile@kidsmilehigh.com',
  'info@denverdental.com',
  '38modern@denverhighlandsdentist.com',
  'eshop@firstlightaustin.com',
  'downtowninfo@swedishhillbakery.com',
  'catering@ciscosaustin.com',
  'syrup@syruprestaurant.com',
  'admin@cherry-creekdentist.com',
  'info@picnikaustin.com',
  'info@icondentaldenver.com',
  'dewi5055@gmail.com',
  'info@ascentdental.com',
  'galaxycafeoffice@gmail.com',
  'info@cc-familydentistry.com',
  'denveroffice@gentlesmilesofcolorado.com',
  'admin@thephysiorevolution.com',
  'info@cherrycreekdentalspa.com',
  'coloradorsvpclinic@gmail.com',
  'jamie@kinetikchaindenver.com',
  'info@enabledental.com',
  'support@rinodental.com',
  'hello@parkhilldental.com',
  'info@highlandspediatricdentistry.com',
  'juaninamil@gmail.com',
  'office@denverwynkoopdentist.com',
  'info@sourduckaustin.com',
  'karlbeb@atlasptco.com',
  'avahenry2424@gmail.com',
  'info@denversportsrecovery.com',
  'info@essemedspa.com',
  'marketing@forumhealth.com',
  'sydney@trustrengthrehab.com'
];

console.log(`Updating status to 'contacted' & pipeline to 'Contacted' for ${contactedEmails.length} leads...`);

// 1. Update status in leads table for user 19
const res1 = await pool.query(
  `UPDATE leads 
   SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() 
   WHERE user_id = 19 AND LOWER(email) = ANY($1::text[])
   RETURNING id, name, email`,
  [contactedEmails.map(e => e.toLowerCase())]
);

console.log(`✅ Successfully restored ${res1.rowCount} leads back to 'contacted' status & 'Contacted' pipeline stage!`);

// 2. Also check emails table sent items for user 19 and restore any others
const res2 = await pool.query(`
  UPDATE leads 
  SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() 
  WHERE user_id = 19 
    AND status != 'contacted' 
    AND LOWER(email) IN (SELECT DISTINCT LOWER(from_email) FROM emails WHERE user_id = 19 AND (category = 'sent' OR labels @> ARRAY['sent']))
  RETURNING id, name, email
`);

console.log(`✅ Restored additional ${res2.rowCount} leads found in sent emails database.`);

await pool.end();
