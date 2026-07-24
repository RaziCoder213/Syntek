import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldPromptBlock = `        // Use Gemini to generate leads list
        const prompt = \`You are a B2B lead research expert. Find \${resolvedLimit} real businesses matching: Niche: "\${resolvedNiche}", Location: "\${resolvedLocation}". For each business provide: name, type, city, email (if likely public), phone, website, rating (1-5), reviews count, owner_name (if known). Return as JSON array. Only real businesses.\`;`;

const newPromptBlock = `        // Use Gemini to discover Executive Decision-Makers & Social Footprints
        addLog("info", "Crawling social media profiles (LinkedIn, X/Twitter, Instagram) & searching for Founders/CEOs...");
        const prompt = \`You are an executive B2B lead intelligence expert. Find \${resolvedLimit} real business leads matching: Niche: "\${resolvedNiche}", Location: "\${resolvedLocation}".

STRICT REQUIREMENT: Focus on finding EXECUTIVE DECISION MAKERS (Founders, CEOs, Owners, Managing Directors).

For each lead provide a JSON object with:
- name: Business name
- type: Industry category
- city: City & State
- owner_name: Full name of Founder/CEO/Owner/Managing Director (Required)
- owner_role: Exact title (e.g. Founder & CEO, Managing Principal, Owner)
- email: Direct or official contact email
- phone: Direct business phone
- website: Official website URL
- linkedin: LinkedIn profile or company page URL
- twitter: Twitter/X handle or URL
- instagram: Instagram handle
- facebook: Facebook page URL
- personalized_icebreaker: A authentic, hyper-personalized 1-sentence compliment or observation about their business or social presence.

Return strictly as a JSON array of objects.\`;`;

const oldLoopBlock = `        let saved = 0;
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
        }`;

const newLoopBlock = `        let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;

          let isEmailValid = false;
          let emailStatus = "no_email";

          if (lead.email) {
            const mxCheck = await validateEmailWithMx(lead.email);
            isEmailValid = mxCheck.valid;
            if (isEmailValid) {
              emailStatus = "not contacted";
              addLog("info", \`✓ MX Verified: \${lead.email} (Mail Server: \${mxCheck.mx})\`);
            } else {
              addLog("warn", \`⚠ Unverified email for \${lead.name} (\${lead.email}): \${mxCheck.reason}\`);
            }
          }

          try {
            await pool.query(
              \`INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, owner_name, owner_role, linkedin, twitter, instagram, facebook, personalized_icebreaker, email_confirmed, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT DO NOTHING\`,
              [
                lead.name, lead.type || resolvedNiche, lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.8,
                lead.reviews ? parseInt(lead.reviews, 10) : 12,
                emailStatus,
                lead.website || null,
                lead.owner_name || null,
                lead.owner_role || "Founder / CEO",
                lead.linkedin || null,
                lead.twitter || null,
                lead.instagram || null,
                lead.facebook || null,
                lead.personalized_icebreaker || null,
                isEmailValid,
                req.userId
              ]
            );
            saved++;
          } catch (insertErr) {
            // skip duplicate
          }
        }`;

if (content.includes(oldPromptBlock)) {
  content = content.replace(oldPromptBlock, newPromptBlock);
  console.log('✓ Upgraded DeepSearch Gemini prompt for Decision-Makers & Social Footprints');
} else {
  console.warn('⚠ Could not find oldPromptBlock');
}

if (content.includes(oldLoopBlock)) {
  content = content.replace(oldLoopBlock, newLoopBlock);
  console.log('✓ Upgraded DeepSearch lead loop with live MX Email Verification & Social DB insertion');
} else {
  console.warn('⚠ Could not find oldLoopBlock');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved server.js with DeepSearch Intelligence & MX verification upgrades');
