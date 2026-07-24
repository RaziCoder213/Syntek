function startCronScheduler() {
  console.log("[LEAD MANAGER AGENT] Background Campaign Cron Scheduler & Job Queue Worker initialized.");
  
  // Start the job queue processing loop every 15 seconds
  setInterval(async () => {
    await processJobQueueBatch();
  }, 15000);

  // Immediately run batch process once on boot
  processJobQueueBatch().catch(err => {
    console.error("[JOB QUEUE] Initial boot batch run failed:", err.message);
  });

  // Checking scheduling queue every 60 seconds to queue daily campaigns
  setInterval(async () => {
    try {
      const todayStr = new Date().toDateString();
      const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE is_active = TRUE");
      
      for (const config of settingsRes.rows) {
        const userId = config.user_id;
        if (config.last_cron_run_date === todayStr) {
          continue; 
        }

        let timeToUse = config.preferred_time || "09:00";
        if (config.schedule_type === "ai") {
          timeToUse = getAiPreferredTime(config.niche);
        }

        const [prefHour, prefMin] = timeToUse.split(":");
        const now = new Date();
        
        let tzHour = now.getHours();
        let tzMin = now.getMinutes();
        
        if (config.timezone === "est") {
          const estStr = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
          const [h, m] = estStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        } else if (config.timezone === "pst") {
          const pstStr = now.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
          const [h, m] = pstStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        }

        const curHour = tzHour.toString().padStart(2, "0");
        const curMin = tzMin.toString().padStart(2, "0");

        if (curHour === prefHour && curMin === prefMin) {
          // Check if already queued for today
          const checkQueue = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'campaign_run' AND run_at::date = CURRENT_DATE",
            [userId]
          );
          if (checkQueue.rowCount === 0) {
            await pool.query("UPDATE campaign_settings SET last_cron_run_date = $1 WHERE user_id = $2", [todayStr, userId]);
            console.log(`[LEAD MANAGER AGENT] [CRON] Queuing daily campaign for User ${userId} (${timeToUse} ${config.timezone})`);
            await pool.query(`
              INSERT INTO job_queue (user_id, job_type, payload, run_at)
              VALUES ($1, 'campaign_run', $2, NOW())
            `, [userId, JSON.stringify({ config_id: config.id })]);
          }
        }
      }
    } catch (err) {
      console.error("[LEAD MANAGER AGENT] [CRON ERROR] Scheduler check failed:", err.message);
    }
  }, 60000);

  // Sync Inbox Replies for all users with Gmail connected every 5 minutes (300000ms) by queueing sync jobs
  setInterval(async () => {
    try {
      const allConfigs = await pool.query("SELECT * FROM campaign_settings");
      for (const rawConfig of allConfigs.rows) {
        const config = decryptConfig(rawConfig);
        if (config && config.gmail_user && config.gmail_pass) {
          // Avoid queueing if a pending sync job is already in queue
          const pendingSync = await pool.query(
            "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'inbox_sync' AND status = 'pending'",
            [config.user_id]
          );
          if (pendingSync.rowCount === 0) {
            console.log(`[EMAIL AGENT] [CRON SYNC] Queueing inbox sync for User ${config.user_id}...`);
            await pool.query(`
              INSERT INTO job_queue (user_id, job_type, payload, run_at)
              VALUES ($1, 'inbox_sync', $2, NOW())
            `, [config.user_id, JSON.stringify({ config_id: config.id })]);
          }
        }
      }
    } catch (e) {
      console.error("[EMAIL AGENT] [CRON SYNC ERROR] Inbox sync queueing failed:", e.message);
    }
  }, 300000);

  // Check for leads needing re-research every 2 minutes (120000ms)
  setInterval(async () => {
    try {
      const activeUsers = await pool.query(
        "SELECT DISTINCT user_id FROM leads WHERE pipeline_stage = 'Re-research' AND status = 'no_email' AND COALESCE(re_research_attempts, 0) < 3"
      );
      for (const row of activeUsers.rows) {
        const userId = row.user_id;

        // Skip if re-research agent is disabled for this user
        const settingsRes = await pool.query(
          "SELECT re_research_enabled FROM campaign_settings WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        if (settingsRes.rowCount > 0 && settingsRes.rows[0].re_research_enabled === false) {
          continue;
        }

        const pendingJob = await pool.query(
          "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 're_research' AND status = 'pending'",
          [userId]
        );
        if (pendingJob.rowCount === 0) {
          console.log(`[RE-RESEARCH AGENT] Queueing email search job for User ${userId}...`);
          await pool.query(`
            INSERT INTO job_queue (user_id, job_type, run_at)
            VALUES ($1, 're_research', NOW())
          `, [userId]);
        }
      }
    } catch (err) {
      console.error("[RE-RESEARCH CRON ERROR] Failed:", err.message);
    }
  }, 120000);

  // Check for leads needing enrichment every 2 minutes (120000ms)
  setInterval(async () => {
    try {
      const activeUsers = await pool.query(
        "SELECT DISTINCT user_id FROM leads WHERE personalized_icebreaker IS NULL AND email IS NOT NULL AND email != '' AND status != 'archived'"
      );
      for (const row of activeUsers.rows) {
        const userId = row.user_id;
        const pendingJob = await pool.query(
          "SELECT id FROM job_queue WHERE user_id = $1 AND job_type = 'lead_enrichment' AND status = 'pending'",
          [userId]
        );
        if (pendingJob.rowCount === 0) {
          console.log(`[ENRICHMENT AGENT] Queueing enrichment job for User ${userId}...`);
          await pool.query(`
            INSERT INTO job_queue (user_id, job_type, run_at)
            VALUES ($1, 'lead_enrichment', NOW())
          `, [userId]);
        }
      }
    } catch (err) {
      console.error("[ENRICHMENT CRON ERROR] Failed:", err.message);
    }
  }, 120000);

  // Evolve low-performing pitch templates every 10 minutes (600000ms)
  setInterval(async () => {
    try {
      console.log("[AI PITCH OPTIMIZER] Checking for low-performing pitch templates to evolve...");
      const allConfigs = await pool.query("SELECT * FROM campaign_settings");
      for (const rawConfig of allConfigs.rows) {
        const config = decryptConfig(rawConfig);
        if (config) {
          await evolvePitchTemplate(config.user_id, config);
        }
      }
    } catch (err) {
      console.error("[AI PITCH OPTIMIZER ERROR] Failed running evolution agent:", err.message);
    }
  }, 600000);
}

