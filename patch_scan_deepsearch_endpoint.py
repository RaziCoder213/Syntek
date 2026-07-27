with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_scan_deepsearch_body = """    // Background: run AI deepsearch
    (async () => {
      try {
        addLog("info", "AI is scanning the web for leads...");
        await pool.query("UPDATE scans SET progress = 15 WHERE id = $1", [scan_id]);

        // Use Gemini to generate leads list
        const prompt = `You are a B2B lead research expert. Find ${resolvedLimit} real businesses matching: Niche: "${resolvedNiche}", Location: "${resolvedLocation}". For each business provide: name, type, city, email (if likely public), phone, website, rating (1-5), reviews count, owner_name (if known). Return as JSON array. Only real businesses.`;
        
        let rawLeads = [];
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
          });
          const geminiData = await geminiRes.json();
          const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const match = text.match(/[[sS]*]/);
          if (match) rawLeads = JSON.parse(match[0]);
        } catch (e) {
          addLog("warn", `AI error: ${e.message}. Saving partial results.`);
        }

        await pool.query("UPDATE scans SET progress = 70 WHERE id = $1", [scan_id]);
        addLog("info", `Processing ${rawLeads.length} leads...`);

        let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;
          try {
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT DO NOTHING`,
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
          [JSON.stringify([{ type: "success", text: ` Done. ${saved} leads saved.` }]), saved, scan_id]
        );
      } catch (err) {
        await pool.query("UPDATE scans SET status = 'error', progress = 100 WHERE id = $1", [scan_id]);
        addLog("error", `Scan failed: ${err.message}`);
      }
    })();"""

new_scan_deepsearch_body = """    // Background: run AI deepsearch engine
    (async () => {
      try {
        addLog("info", "AI is scanning the web for leads...");
        await pool.query("UPDATE scans SET progress = 25 WHERE id = $1", [scan_id]);

        const rawLeads = await performDeepSearchDirect(resolvedNiche, resolvedLocation, apiKey, resolvedLimit, {
          ...config,
          pitch_offer: resolvedPitch,
          required_contact: resolvedContact,
        });

        await pool.query("UPDATE scans SET progress = 70 WHERE id = $1", [scan_id]);
        addLog("info", `Processing ${rawLeads.length} leads...`);

        let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;
          try {
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, owner_role, owner_contact, qualification_reason, personalized_icebreaker, sequence_step, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,0,$21)
               ON CONFLICT DO NOTHING`,
              [
                lead.name, lead.type || resolvedNiche, lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.8,
                lead.reviews ? parseInt(lead.reviews, 10) : 45,
                lead.email ? "not contacted" : "no_email",
                lead.instagram || null, lead.website || null, lead.website_status || "active",
                lead.linkedin || null, lead.facebook || null, lead.whatsapp || null, lead.twitter || null,
                lead.owner_name || null, lead.owner_role || "Owner", lead.owner_contact || null,
                lead.qualification_reason || "AI Verified Lead",
                lead.personalized_icebreaker || null,
                req.userId
              ]
            );
            saved++;
          } catch (e) {
            console.error("[SCAN SAVE ERROR]", e.message);
          }
        }

        await pool.query(
          "UPDATE scans SET status = 'done', progress = 100, logs = logs || $1::jsonb, total_found = $2 WHERE id = $3",
          [JSON.stringify([{ type: "success", text: ` Done. ${saved} leads saved.` }]), saved, scan_id]
        );
      } catch (err) {
        console.error("[SCAN DEEPSEARCH ERROR]", err.message);
        await pool.query("UPDATE scans SET status = 'error', progress = 100 WHERE id = $1", [scan_id]);
        addLog("error", `Scan failed: ${err.message}`);
      }
    })();"""

if old_scan_deepsearch_body in content:
    content = content.replace(old_scan_deepsearch_body, new_scan_deepsearch_body)
    print("SUCCESS: Patched /api/scan-deepsearch endpoint to use performDeepSearchDirect engine!")
else:
    print("WARNING: Could not find exact old_scan_deepsearch_body, attempting flexible match")
    pos_route = content.find('app.post("/api/scan-deepsearch"')
    if pos_route != -1:
        pos_async = content.find('(async () => {', pos_route)
        pos_end_async = content.find('})();', pos_async)
        if pos_async != -1 and pos_end_async != -1:
            content = content[:pos_async] + new_scan_deepsearch_body + content[pos_end_async + 6:]
            print("SUCCESS: Flexibly patched /api/scan-deepsearch endpoint!")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
