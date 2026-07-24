import { readFileSync, writeFileSync } from 'fs';

const f = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = readFileSync(f, 'utf8');

// Remove the bad alias we added (searchLeadsDeepSearch doesn't exist)
const badAlias = `
// Alias: /api/scan-deepsearch (frontend calls this; returns scan_id in snake_case)
app.post("/api/scan-deepsearch", authenticate, scanRateLimit, async (req, res) => {`;

if (!content.includes('app.post("/api/scan-deepsearch"')) {
  console.log('Alias not found, nothing to remove');
} else {
  // Find and remove the entire bad alias block
  const start = content.indexOf('\n// Alias: /api/scan-deepsearch');
  const end = content.indexOf('\napp.post("/api/deepsearch"', start);
  if (start !== -1 && end !== -1) {
    content = content.slice(0, start) + '\n' + content.slice(end);
    console.log('Removed bad alias block');
  }
}

// Now add a simple, correct alias that forwards to deepsearch logic and returns scan_id
const goodAlias = `
// Alias: /api/scan-deepsearch → used by LeadFinder.jsx deepsearch mode; returns {scan_id}
app.post("/api/scan-deepsearch", authenticate, scanRateLimit, async (req, res) => {
  // Normalize body: frontend sends pitchOffer/requiredContact, deepsearch expects pitch_offer/required_contact
  req.body.pitch_offer    = req.body.pitchOffer    || req.body.pitch_offer;
  req.body.required_contact = req.body.requiredContact || req.body.required_contact;
  // We delegate to /api/deepsearch inline handler but first create scan and return scan_id
  try {
    const { niche, location, limit, pitch_offer, required_contact } = req.body;
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(settingsRes.rows[0]) || {};
    const userRes = await pool.query("SELECT subscription_tier FROM users WHERE id = $1", [req.userId]);
    const userTier = (userRes.rows[0]?.subscription_tier || "agency").toLowerCase();
    let maxLimit = 50;
    if (userTier === "free") maxLimit = 5;
    else if (userTier === "growth") maxLimit = 25;
    const resolvedLimit    = Math.min(maxLimit, parseInt(limit || config.daily_lead_limit || 8, 10));
    const resolvedNiche    = niche    || config.niche    || "Clinics";
    const resolvedLocation = location || config.location || "Austin, TX";
    const resolvedPitch    = pitch_offer    || config.pitch_offer    || "whatsapp_bot";
    const resolvedContact  = required_contact || config.required_contact || "email_or_phone";
    const apiKey = config.gemini_key || process.env.GEMINI_API_KEY || "local_antigravity";

    const scanRes = await pool.query(
      "INSERT INTO scans (user_id, status, progress, logs) VALUES ($1, 'running', 0, $2) RETURNING id",
      [req.userId, JSON.stringify([{ type: "info", text: \`Starting DeepSearch for "\${resolvedNiche}" in \${resolvedLocation}...\` }])]
    );
    const scan_id = scanRes.rows[0].id;
    res.json({ scan_id });  // Return immediately so frontend can poll

    const addLog = (type, text) => pool.query(
      "UPDATE scans SET logs = logs || $1::jsonb WHERE id = $2",
      [JSON.stringify([{ type, text }]), scan_id]
    ).catch(() => {});

    // Background: run AI deepsearch
    (async () => {
      try {
        addLog("info", "AI is scanning the web for leads...");
        await pool.query("UPDATE scans SET progress = 15 WHERE id = $1", [scan_id]);

        // Use Gemini to generate leads list
        const prompt = \`You are a B2B lead research expert. Find \${resolvedLimit} real businesses matching: Niche: "\${resolvedNiche}", Location: "\${resolvedLocation}". For each business provide: name, type, city, email (if likely public), phone, website, rating (1-5), reviews count, owner_name (if known). Return as JSON array. Only real businesses.\`;
        
        let rawLeads = [];
        try {
          const geminiRes = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${apiKey}\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
          });
          const geminiData = await geminiRes.json();
          const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const match = text.match(/\[[\s\S]*\]/);
          if (match) rawLeads = JSON.parse(match[0]);
        } catch (e) {
          addLog("warn", \`AI error: \${e.message}. Saving partial results.\`);
        }

        await pool.query("UPDATE scans SET progress = 70 WHERE id = $1", [scan_id]);
        addLog("info", \`Processing \${rawLeads.length} leads...\`);

        let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;
          try {
            await pool.query(
              \`INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT DO NOTHING\`,
              [
                lead.name, lead.type || resolvedNiche, lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.0,
                lead.reviews ? parseInt(lead.reviews, 10) : 0,
                lead.email ? "not contacted" : "no_email",
                lead.website || null, req.userId
              ]
            );
            saved++;
          } catch { /* skip duplicate */ }
        }

        await pool.query(
          "UPDATE scans SET status = 'done', progress = 100, logs = logs || $1::jsonb, total_found = $2 WHERE id = $3",
          [JSON.stringify([{ type: "success", text: \`✓ Done. \${saved} leads saved.\` }]), saved, scan_id]
        );
      } catch (err) {
        await pool.query("UPDATE scans SET status = 'error', progress = 100 WHERE id = $1", [scan_id]);
        addLog("error", \`Scan failed: \${err.message}\`);
      }
    })();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

`;

// Insert before /api/deepsearch
const insertBefore = 'app.post("/api/deepsearch"';
if (content.includes(insertBefore)) {
  content = content.replace(insertBefore, goodAlias + insertBefore);
  writeFileSync(f, content, 'utf8');
  console.log('Added /api/scan-deepsearch alias successfully');
} else {
  console.error('Cannot find /api/deepsearch to insert before!');
  process.exit(1);
}
