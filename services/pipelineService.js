import pg from "pg";
import dotenv from "dotenv";
import { scrapeGoogleMaps } from "./scraperService.js";
import { enrichWebsite } from "./enrichmentService.js";
import { calculateQualityScore } from "./scoringService.js";
import { checkDeduplication } from "./dedupService.js";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function runScraperPipeline({ userId, niche, location, limit = 5, scanId = null, addLog = console.log }) {
  addLog(`[PIPELINE] Starting Noryvex Lead Pipeline for User ${userId} | Niche: "${niche}" | Location: "${location}" | Limit: ${limit}`);

  // 1. Stage 1: Google Maps Scraper -> writes to raw_leads staging table
  let rawLeads = [];
  try {
    rawLeads = await scrapeGoogleMaps({ userId, niche, location, limit, addLog });
    addLog(`[PIPELINE] Stage 1 Completed. Scraped ${rawLeads.length} raw leads and wrote to staging table.`);
  } catch (err) {
    addLog(`[PIPELINE] [ERROR] Stage 1 Scraper aborted: ${err.message}`);
    throw err;
  }

  const processedLeads = [];

  // Process each raw lead through Stages 2, 3, 4
  for (let i = 0; i < rawLeads.length; i++) {
    if (scanId) {
      try {
        const scanStatusCheck = await pool.query("SELECT status FROM scans WHERE id = $1", [scanId]);
        if (scanStatusCheck.rowCount > 0 && scanStatusCheck.rows[0].status === "stopped") {
          addLog("[PIPELINE] Scan stopped/cancelled by the user.");
          break;
        }
      } catch (dbErr) {
        addLog(`[WARN] Failed to check scan status: ${dbErr.message}`);
      }
    }

    const rawLead = rawLeads[i];
    addLog(`[PIPELINE] [Lead ${i + 1}/${rawLeads.length}] Processing: "${rawLead.name}"`);

    // 2. Stage 2: Enrichment Engine
    let enrichment = {
      has_booking_widget: "unknown",
      chat_widget: "unknown",
      cms_platform: "unknown",
      contact_method: "unknown",
      owner_name: null,
      enrichment_source_url: null,
      enrichment_checked_at: new Date()
    };

    if (rawLead.website) {
      try {
        enrichment = await enrichWebsite(rawLead.website, addLog);
      } catch (err) {
        addLog(`[WARN] Enrichment failed for ${rawLead.name}: ${err.message}`);
      }
    }

    // Merge raw lead details with enrichment details
    const mergedLead = {
      ...rawLead,
      ...enrichment,
      email_confirmed: rawLead.email ? true : false
    };

    // 3. Stage 3: Quality Scorer
    const scoringResult = await calculateQualityScore(mergedLead, userId);
    addLog(`[PIPELINE] Calculated Quality Score for "${rawLead.name}": ${scoringResult.score} | Low Quality? ${scoringResult.isLowQuality}`);

    // 4. Stage 4: Deduplication Check
    const dedupResult = await checkDeduplication(mergedLead, userId);
    
    if (dedupResult.isDuplicate) {
      addLog(`[PIPELINE] Duplicate detected (ID: ${dedupResult.existingId}, Last seen ${dedupResult.lastSeenDaysAgo} days ago).`);
      
      if (dedupResult.shouldReScore) {
        addLog(`[PIPELINE] Staleness threshold passed. Re-enriching and updating columns.`);
        // Update existing lead columns
        await pool.query(
          `UPDATE leads 
           SET phone = COALESCE($1, phone), 
               website = COALESCE($2, website),
               rating = COALESCE($3, rating),
               reviews = COALESCE($4, reviews),
               has_booking_widget = $5,
               chat_widget = $6,
               cms_platform = $7,
               contact_method = $8,
               enrichment_source_url = $9,
               enrichment_checked_at = $10,
               owner_name = COALESCE($11, owner_name),
               qualification_score = $12,
               pipeline_stage = CASE WHEN $12 < 40 THEN 'Needs Review' ELSE pipeline_stage END
           WHERE id = $13`,
          [
            mergedLead.phone,
            mergedLead.website,
            mergedLead.rating,
            mergedLead.reviews,
            mergedLead.has_booking_widget,
            mergedLead.chat_widget,
            mergedLead.cms_platform,
            mergedLead.contact_method,
            mergedLead.enrichment_source_url,
            mergedLead.enrichment_checked_at,
            mergedLead.owner_name,
            scoringResult.score,
            dedupResult.existingId
          ]
        );
      }
      
      processedLeads.push({
        ...mergedLead,
        id: dedupResult.existingId,
        score: scoringResult.score,
        isDuplicate: true,
        isLowQuality: scoringResult.isLowQuality
      });

    } else {
      // New Lead insert
      addLog(`[PIPELINE] New unique lead. Inserting into leads table.`);
      
      const targetStage = scoringResult.score < 40 ? "Needs Review" : "New";
      
      const insertRes = await pool.query(
        `INSERT INTO leads (
          user_id, name, type, city, email, phone, rating, reviews, 
          status, website, has_booking_widget, chat_widget, cms_platform, 
          contact_method, enrichment_source_url, enrichment_checked_at, 
          owner_name, qualification_score, pipeline_stage, source_url, last_seen_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
         RETURNING id`,
        [
          userId,
          mergedLead.name,
          mergedLead.category,
          mergedLead.location,
          mergedLead.email,
          mergedLead.phone,
          mergedLead.rating,
          mergedLead.reviews,
          "not contacted",
          mergedLead.website,
          mergedLead.has_booking_widget,
          mergedLead.chat_widget,
          mergedLead.cms_platform,
          mergedLead.contact_method,
          mergedLead.enrichment_source_url,
          mergedLead.enrichment_checked_at,
          mergedLead.owner_name,
          scoringResult.score,
          targetStage,
          mergedLead.source_url
        ]
      );

      const newId = insertRes.rows[0].id;
      processedLeads.push({
        ...mergedLead,
        id: newId,
        score: scoringResult.score,
        isDuplicate: false,
        isLowQuality: scoringResult.isLowQuality
      });
      addLog(`[PIPELINE] Lead "${mergedLead.name}" saved as ID ${newId} (Stage: ${targetStage}).`);
    }
  }

  addLog(`[PIPELINE] Pipeline finished. Successfully processed ${processedLeads.length} leads.`);
  return processedLeads;
}
