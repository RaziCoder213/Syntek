
              // Insert real-time database notification for the reply
              try {
                let notifTitle = `≡ƒÆ¼ New Reply: ${matchedLead.name}`;
                let notifMsg = `Subject: ${subject}`;
                let notifType = 'reply';

                if (detectedCategory === 'interested') {
                  notifTitle = `≡ƒöÑ Hot Reply: ${matchedLead.name}`;
                  notifMsg = `They are interested! Stage moved to Replied.`;
                  notifType = 'reply';
                } else if (detectedCategory === 'not_interested') {
                  notifTitle = `≡ƒÆñ Declined: ${matchedLead.name}`;
                  notifMsg = `Declined offer. Lead auto-archived.`;
                  notifType = 'system';
                }

                await pool.query(
                  `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, 'Inbox')`,
                  [userId, notifTitle, notifMsg, notifType]
                );
              } catch (notifErr) {
                console.error("Failed to insert reply notification:", notifErr.message);
              }

              newRepliesCount++;

              // ΓöÇΓöÇ AI Draft Reply / Meeting detection & Escalations ΓöÇΓöÇ
              if (matchedLead.ai_enabled && config.ai_draft_replies_enabled !== false) {
                console.log(`[EMAIL AGENT] [SYNC] User ${userId}: Generating draft reply or handling booking for ${matchedLead.name}...`);
                try {
                  let replyText = "";
                  let draftSubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
                  let draftLabels = ['draft', 'pending_reply'];

                  // 1. Check for Cost / Mockup / NDA Escalation keywords
                  const bodyLower = bodyPreview.toLowerCase();
                  let escalationReason = null;
                  if (config.escalate_cost !== false && /price|cost|quote|how much|rate|pricing/i.test(bodyLower)) {
                    escalationReason = "Cost/Pricing Request";
                  } else if (config.escalate_mockups !== false && /mockup|wireframe|design sample|custom sample|prototype/i.test(bodyLower)) {
                    escalationReason = "Design Mockup Request";
                  } else if (config.escalate_terms !== false && /nda|agreement|contract|terms|sign/i.test(bodyLower)) {
                    escalationReason = "NDA/Terms Request";
                  }

                  if (escalationReason) {
                    console.log(`[EMAIL AGENT] Human action required escalation detected: ${escalationReason} for Lead ${matchedLead.name}`);
                    await pool.query(
                      "UPDATE leads SET pipeline_stage = 'Follow Up', human_escalation_reason = $1 WHERE id = $2 AND user_id = $3",
                      [escalationReason, matchedLead.id, userId]
                    );
                    draftLabels.push('needs_review');
                  }

                  // 2. Detect meeting booking intent
                  const bookingCheck = await detectMeetingBookingIntent(insertedEmail.rows[0], config, userId);
                  
                  if (bookingCheck.isMeetingAgreed) {
                    console.log(`[EMAIL AGENT] Meeting booking intent agreed for ${matchedLead.name}`);
                    
                    // Insert suggestion
                    const sugRes = await pool.query(
                      `INSERT INTO calendar_event_suggestions (user_id, lead_id, lead_name, lead_email, title, description, status)
                       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
                      [
                        userId, 
                        matchedLead.id, 
                        matchedLead.name, 
                        fromEmail, 
                        `Meeting with ${matchedLead.name}`, 
                        `Introductory call scheduled via Syntek Lead AI Copilot. Thread subject: ${subject}`,
                      ]
                    );
                    
                    // Check auto book meetings setting and Google OAuth connected status
                    const calendarToken = await getGoogleCalendarToken(userId);
                    const shouldAutoBook = config.auto_book_meetings === true && calendarToken;
                    
                    if (shouldAutoBook) {
                      console.log(`[EMAIL AGENT] Auto booking calendar event for User ${userId}...`);
                      const eventTime = bookingCheck.meetingTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                      const success = await createGoogleCalendarEvent(userId, {
                        title: `Meeting with ${matchedLead.name}`,
                        description: `Introductory call scheduled via Syntek Lead AI Copilot. Thread subject: ${subject}`,
                        attendeeEmail: fromEmail,
                        startTime: eventTime
                      });
                      if (success) {
                        await pool.query(
                          "UPDATE calendar_event_suggestions SET status = 'confirmed' WHERE id = $1",
                          [sugRes.rows[0].id]
                        );
                        replyText = `Hi ${matchedLead.name},\n\nGreat to hear from you! I have scheduled our meeting on the calendar and sent you an invitation with a Google Meet link.\n\nLooking forward to speaking with you!\n\nBest regards,\n${config.sender_name || "Your Name"}`;
                      }
                    }
                    
                    if (!replyText) {
                      const senderName = config.sender_name || "Your Name";
                      const senderRole = config.sender_role || "Developer";
                      replyText = `Hi ${matchedLead.name},\n\nGreat to hear from you! I'd love to schedule a call to discuss further.\n\nWhen works best for you? Feel free to suggest a time and I'll confirm.\n\nBest,\n${senderName}\n${senderRole}`;
                    }
                  } else {
                    replyText = await generateEmailReplyText(insertedEmail.rows[0], config, userId);
                  }

                  if (replyText) {
                    if (escalationReason) {
                      replyText = `[ΓÜá∩╕Å NEEDS HUMAN REVIEW: Prospect requested pricing/mockup/NDA info]\n\n${replyText}`;
                    }

                    // Save as DRAFT for user review
                    await pool.query(
                      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id, lead_id)
                       VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'draft', $6, $7, $8)`,
                      [matchedLead.name, fromEmail, matchedLead.name, draftSubject, replyText, draftLabels, userId, matchedLead.id]
                    );
                    console.log(`[EMAIL AGENT] [DRAFT SAVED] Draft reply for ${matchedLead.name} saved ΓÇö awaiting user approval.`);
                    try {
                      await pool.query(
                        `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'system', 'Inbox')`,
                        [userId, `≡ƒ¬ä AI Draft Reply: ${matchedLead.name}`, `Draft response generated. Review and send from Inbox.`]
                      );
                    } catch (_) {}
                  }
                } catch (draftErr) {
                  console.error(`[EMAIL AGENT] [DRAFT ERROR] Failed to generate draft for ${matchedLead.name}:`, draftErr.message);
                }
              }
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, count: newRepliesCount };
  } catch (err) {
    console.error(`[EMAIL AGENT] [SYNC IMAP CONNECTION ERROR] User ${userId} failed:`, err.message);
    try {
      await client.logout();
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getAiPreferredTime(niche) {
  const n = (niche || "").toLowerCase();
  if (n.includes("cafe") || n.includes("coffee")) {
    return "10:00";
  } else if (n.includes("restaurant") || n.includes("food") || n.includes("brunch") || n.includes("bakery")) {
    return "14:30";
  } else if (n.includes("gym") || n.includes("spa") || n.includes("salon") || n.includes("fitness")) {
    return "11:00";
  }
  return "11:15";
}

async function processJobQueueBatch() {
  try {
    // 1. Recover stuck jobs: locked_at < NOW() - 30 minutes AND status = 'running' -> pending
    await pool.query(`
      UPDATE job_queue
      SET status = 'pending', locked_at = NULL, error_log = 'Recovered from stuck state (timeout)'
      WHERE status = 'running' AND locked_at < NOW() - INTERVAL '30 minutes'
    `);

    // 2. Fetch and lock ready jobs: run_at <= NOW() AND status = 'pending'
    const res = await pool.query(`
      UPDATE job_queue
      SET status = 'running', locked_at = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM job_queue
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    if (res.rowCount === 0) return;

    console.log(`[JOB QUEUE] Processing ${res.rowCount} jobs...`);

    for (const job of res.rows) {
      runJob(job).catch(err => {
        console.error(`[JOB QUEUE] Unhandled job execution failure for Job ID ${job.id}:`, err);
      });
    }
  } catch (err) {
    console.error("[JOB QUEUE] Error processing job batch:", err.message);
  }
}

async function runReResearchAgent(userId, config) {
  if (config && config.re_research_enabled === false) {
    console.log(`[RE-RESEARCH AGENT] Skipped: Re-research is disabled for User ${userId}`);
    return;
  }
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
  
  // Fetch up to 5 leads in 'Re-research' stage that have had < 3 attempts
  const leadsRes = await pool.query(
    `SELECT * FROM leads 
     WHERE user_id = $1 AND pipeline_stage = 'Re-research' AND status = 'no_email' AND COALESCE(re_research_attempts, 0) < 3
     LIMIT 5`,
    [userId]
  );
  
  if (leadsRes.rowCount === 0) {
    console.log(`[RE-RESEARCH AGENT] No leads in Re-research stage for User ${userId}.`);
    return;
  }

  console.log(`[RE-RESEARCH AGENT] Starting email search for ${leadsRes.rowCount} leads...`);

  for (const lead of leadsRes.rows) {
    // Increment attempts count
    await pool.query(
      "UPDATE leads SET re_research_attempts = COALESCE(re_research_attempts, 0) + 1 WHERE id = $1",
      [lead.id]
    );

    const promptText = `
You are an AI Email Finder Agent. Your task is to find the official, public email address of this business:
- Name: ${lead.name}
- Type/Niche: ${lead.type}
- City/Location: ${lead.city}
- Website: ${lead.website || "Not provided"}

Grounding search strategy:
Use your search capabilities to search for the business name and location, visit their website or contact/social pages (like Facebook or LinkedIn), and locate a public contact email address (e.g. info@..., hello@..., contact@..., or a personal contact email of the owner/manager).

Response format:
If you find a valid email address, respond ONLY with the email address in plain text (e.g., info@company.com).
If you absolutely cannot find any valid email address, respond with "NOT_FOUND".
Do not output any other explanations, formatting, markdown, or conversational text.
`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }] }]
      };
      
      const resObj = await fetchGeminiWithRetry(url, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resJson = await resObj.json();
      const resText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = (resText || "").trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (emailRegex.test(cleaned)) {
        // Successfully found email!
        await pool.query(
          `UPDATE leads 
           SET email = $1, 
               status = 'not contacted', 
               pipeline_stage = 'New',
               re_research_attempts = 0
           WHERE id = $2`,
          [cleaned, lead.id]
        );
        console.log(`[RE-RESEARCH SUCCESS] Found email "${cleaned}" for lead "${lead.name}" (ID ${lead.id}). Moved to New.`);
        
        // Notify user
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES ($1, $2, $3, 'system', 'Pipeline')`,
          [userId, `≡ƒôº Email Found: ${lead.name}`, `Re-research found email ${cleaned}. Lead moved back to New.`]
        );
      } else {
        console.log(`[RE-RESEARCH FAILED] Could not find email for lead "${lead.name}" (ID ${lead.id}). Model replied: ${resText}`);
        await pool.query(
          `UPDATE leads 
           SET pipeline_stage = 'Manual Research by Boss', 
               status = 'no_email'
           WHERE id = $1`,
          [lead.id]
        );
        console.log(`[RE-RESEARCH MOVED] Lead "${lead.name}" (ID ${lead.id}) moved to Manual Research by Boss because email could not be found.`);
        
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link)
           VALUES ($1, $2, $3, 'system', 'Pipeline')`,
          [userId, `≡ƒöì Manual Research Required: ${lead.name}`, `AI research agent could not find an email. Lead moved to Manual Research by Boss.`]
        );
      }
    } catch (err) {
      console.error(`[RE-RESEARCH ERROR] Failed for lead "${lead.name}" (ID ${lead.id}):`, err.message);
    }
  }
}

async function runLeadEnrichmentAgent(userId, config) {
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";
  
  // Find up to 5 leads that have email but no personalized icebreaker, and are not archived
  const leadsRes = await pool.query(
    `SELECT * FROM leads 
     WHERE user_id = $1 
       AND email IS NOT NULL AND email != '' 
       AND status != 'archived' 
       AND personalized_icebreaker IS NULL
     LIMIT 5`,
    [userId]
  );
  
  if (leadsRes.rowCount === 0) {
    return;
  }
  
  console.log(`[ENRICHMENT AGENT] Starting enrichment search for ${leadsRes.rowCount} leads...`);
  
  for (const lead of leadsRes.rows) {
    const promptText = `
You are an AI Lead Enrichment Agent. Your task is to research this business online and write a highly personalized, warm 1-sentence compliment/icebreaker that we can use to start a cold outreach email to the owner or manager.
- Name: ${lead.name}
- Type/Niche: ${lead.type}
- City/Location: ${lead.city}
- Website: ${lead.website || "Not provided"}

Grounding research strategy:
Use your search capabilities to search for the business name, city, website, or social pages (like Facebook or Yelp reviews).
Find a real, recent fact, milestone, positive review snippet, or launch.
Examples of good 1-sentence icebreakers:
- "I saw your amazing customer reviews praising the friendly staff and great espresso blend at Houndstooth Cafe last week, congrats!"
- "I noticed your team recently celebrated 10 years of serving the Austin community, what a milestone!"
- "I saw your recent project portfolio showcase of the boutique apartment designs in Boston, they look stunning!"

Response format:
Respond ONLY with the 1-sentence icebreaker in plain text. Do not include quotes, subject lines, explanations, or any other conversational text.
If you absolutely cannot find any specific recent details or achievements, respond with a general friendly compliment tailored to their high rating/reviews or niche in their city (e.g. "I was looking at the great reviews for your coffee shop in Austin and wanted to reach out...").
`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ googleSearch: {} }]
      };
      
      const resObj = await fetchGeminiWithRetry(url, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const resJson = await resObj.json();
      const resText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = (resText || "").trim().replace(/^["']|["']$/g, ''); // strip outer quotes if any

      if (cleaned && cleaned.length > 5 && !cleaned.includes("NOT_FOUND")) {
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = $1 WHERE id = $2",
          [cleaned, lead.id]
        );
        console.log(`[ENRICHMENT SUCCESS] Generated icebreaker for lead "${lead.name}" (ID ${lead.id}): ${cleaned}`);
      } else {
        // Set a default friendly fallback icebreaker so we don't keep retrying it indefinitely
        const fallback = `I was looking at the great local reviews for your ${lead.type || 'business'} in ${lead.city} and wanted to reach out.`;
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = $1 WHERE id = $2",
          [fallback, lead.id]
        );
        console.log(`[ENRICHMENT FALLBACK] Set fallback icebreaker for lead "${lead.name}" (ID ${lead.id})`);
      }
    } catch (err) {
      console.error(`[ENRICHMENT ERROR] Failed for lead "${lead.name}" (ID ${lead.id}):`, err.message);
    }
  }
}

async function runJob(job) {
  const { id, user_id, job_type } = job;
  console.log(`[JOB QUEUE] Starting job ${id} (type: ${job_type}) for user ${user_id}`);
  try {
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1", [user_id]);
    if (configRes.rowCount === 0) {
      throw new Error(`Campaign settings not found for user ${user_id}`);
    }
    const config = decryptConfig(configRes.rows[0]);

    if (job_type === "campaign_run") {
      await triggerCronCampaign(config);
    } else if (job_type === "inbox_sync") {
      await syncUserInbox(user_id, config);
    } else if (job_type === "re_research") {
      await runReResearchAgent(user_id, config);
    } else if (job_type === "lead_enrichment") {
      await runLeadEnrichmentAgent(user_id, config);
    } else {
      throw new Error(`Unknown job type: ${job_type}`);
    }

    // Mark as completed
    await pool.query(`
      UPDATE job_queue
      SET status = 'completed', locked_at = NULL, error_log = NULL
      WHERE id = $1
    `, [id]);
    console.log(`[JOB QUEUE] Job ${id} completed successfully.`);
  } catch (err) {
    console.error(`[JOB QUEUE] Job ${id} failed:`, err.message);
    const hasMoreAttempts = job.attempts < job.max_attempts;
    await pool.query(`
      UPDATE job_queue
      SET status = $1, locked_at = NULL, error_log = $2
      WHERE id = $3
    `, [hasMoreAttempts ? 'pending' : 'failed', err.message, id]);
  }
}

