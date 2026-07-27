import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Handle new trial request submission (Section 6)
 */
export async function createTrialRequest({ userId, businessName, contactName, email, phone, niche, agentScope }) {
  const targetUserId = userId || 19;
  const cleanEmail = (email || "").trim().toLowerCase();

  const res = await pool.query(
    `INSERT INTO trial_requests (user_id, business_name, contact_name, email, phone, niche, agent_scope, trial_status, requested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', NOW())
     RETURNING id, business_name, trial_status, requested_at`,
    [targetUserId, businessName, contactName, cleanEmail, phone || null, niche || "General", agentScope || "both"]
  );

  // Check if lead already exists in leads table
  const existingLead = await pool.query("SELECT id FROM leads WHERE user_id = $1 AND LOWER(TRIM(email)) = $2 LIMIT 1", [targetUserId, cleanEmail]);
  if (existingLead.rowCount > 0) {
    await pool.query("UPDATE leads SET source_tier = 5, source_type = 'inbound' WHERE id = $1", [existingLead.rows[0].id]);
  } else {
    await pool.query(
      `INSERT INTO leads (name, owner_name, email, phone, type, city, source_type, source_tier, status, pipeline_stage, user_id)
       VALUES ($1, $2, $3, $4, $5, 'Inbound Trial Request', 'inbound', 5, 'not contacted', 'New Inbound Lead', $6)`,
      [businessName, contactName, cleanEmail, phone || null, niche || "General", targetUserId]
    );
  }

  return res.rows[0];
}

/**
 * Update Trial Status (requested -> active -> expired -> converted)
 */
export async function updateTrialStatus(trialId, newStatus, extraData = {}) {
  const { twilioNumber, vapiCallMinutes } = extraData;
  
  let updateSql = `UPDATE trial_requests SET trial_status = $1`;
  const params = [newStatus];

  if (newStatus === "active") {
    params.push(new Date()); // activated_at
    params.push(new Date(Date.now() + 7 * 24 * 3600 * 1000)); // 7 days expires_at
    updateSql += `, activated_at = $${params.length - 1}, expires_at = $${params.length}`;
  }

  if (twilioNumber) {
    params.push(twilioNumber);
    updateSql += `, twilio_number = $${params.length}`;
  }

  if (vapiCallMinutes !== undefined) {
    params.push(vapiCallMinutes);
    updateSql += `, vapi_call_minutes = $${params.length}`;
  }

  params.push(trialId);
  updateSql += ` WHERE id = $${params.length} RETURNING *`;

  const res = await pool.query(updateSql, params);
  return res.rows[0];
}

/**
 * Check Vapi 30-minute usage cutoff enforcement (Section 6)
 */
export async function checkTrialCallCutoff(trialId) {
  const res = await pool.query(`SELECT trial_status, vapi_call_minutes, expires_at FROM trial_requests WHERE id = $1`, [trialId]);
  if (res.rowCount === 0) return { expired: true, reason: "Trial not found" };

  const trial = res.rows[0];
  const minutes = trial.vapi_call_minutes || 0;
  const isTimeExpired = trial.expires_at ? new Date() > new Date(trial.expires_at) : false;

  if (minutes >= 30 || isTimeExpired) {
    await updateTrialStatus(trialId, "expired");
    return { expired: true, reason: minutes >= 30 ? "30-minute call time limit reached" : "7-day trial duration expired" };
  }

  return { expired: false, minutesRemaining: 30 - minutes };
}
