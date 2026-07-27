import pg from 'pg';
import dotenv from 'dotenv';
import { calculateLeadTierAndScore } from '../services/scoringService.js';
import { isLeadDueForNextStep, calculateGraduatedCap } from '../services/sequenceEngine.js';

dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verifySequenceWiring() {
  console.log('================ SECTION 3: SEQUENCE ENGINE END-TO-END WIRING ================');

  // 1. Check Graduated Daily Send Cap Ramp
  const capDay1 = calculateGraduatedCap({ daily_limit: 50 }, 1);
  const capDay3 = calculateGraduatedCap({ daily_limit: 50 }, 3);
  console.log(`Graduated Send Cap Day 1: ${capDay1}/day | Day 3: ${capDay3}/day`);

  // 2. Test Reply Halt Simulation
  const repliedLead = { status: "replied", source_tier: 3 };
  const scoreReplied = calculateLeadTierAndScore(repliedLead);
  console.log(`Replied Lead Queue Status: shouldQueue=${scoreReplied.shouldQueue}, score=${scoreReplied.score} (${scoreReplied.statusReason})`);

  // 3. Test Unsubscribe Link Hit Simulation
  // Create a temporary test lead
  const insertRes = await pool.query(
    `INSERT INTO leads (name, email, user_id, status, pipeline_stage) 
     VALUES ('Unsub Test Lead', 'unsub.test@noryvex-demo.com', 19, 'not contacted', 'New Lead') 
     RETURNING id, name, status`
  );
  const testLead = insertRes.rows[0];
  console.log(`Created temporary test lead #${testLead.id} with status: "${testLead.status}"`);

  // Simulate hit on unsubscribe endpoint
  await pool.query(
    `UPDATE leads SET status = 'unsubscribed', pipeline_stage = 'Unsubscribed / Opt Out' WHERE id = $1`,
    [testLead.id]
  );

  const unsubbedRes = await pool.query("SELECT id, status, pipeline_stage FROM leads WHERE id = $1", [testLead.id]);
  console.log(`After Unsubscribe Hit: status="${unsubbedRes.rows[0].status}", pipeline_stage="${unsubbedRes.rows[0].pipeline_stage}"`);

  const unsubScore = calculateLeadTierAndScore(unsubbedRes.rows[0]);
  console.log(`Unsubscribed Lead Queue Status: shouldQueue=${unsubScore.shouldQueue}, score=${unsubScore.score}`);

  // Cleanup temp test lead
  await pool.query("DELETE FROM leads WHERE id = $1", [testLead.id]);
  console.log("Cleaned up temporary test lead.");

  await pool.end();
}

verifySequenceWiring().catch(err => { console.error(err); process.exit(1); });
