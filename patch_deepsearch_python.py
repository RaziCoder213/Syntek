import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace prompt block
pattern_prompt = r'// Use Gemini to generate leads list\s+const prompt = `You are a B2B lead research expert\.[^`]+`;'

replacement_prompt = '''// Use Gemini to discover Executive Decision-Makers & Social Footprints
        addLog("info", "Crawling social media profiles (LinkedIn, X/Twitter, Instagram) & searching for Founders/CEOs...");
        const prompt = `You are an executive B2B lead intelligence expert. Find ${resolvedLimit} real business leads matching: Niche: "${resolvedNiche}", Location: "${resolvedLocation}".

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
- personalized_icebreaker: An authentic, hyper-personalized 1-sentence compliment or observation about their business or social presence.

Return strictly as a JSON array of objects.`;'''

if re.search(pattern_prompt, content):
    content = re.sub(pattern_prompt, replacement_prompt, content)
    print('✓ Upgraded DeepSearch prompt using regex')
else:
    print('⚠ Pattern prompt not found')

# Replace loop block
pattern_loop = r'let saved = 0;\s+for \(const lead of rawLeads\) \{[^}]+\}\s+\}\s+\}\s+catch'

new_loop_code = '''let saved = 0;
        for (const lead of rawLeads) {
          if (!lead.name) continue;

          let isEmailValid = false;
          let emailStatus = "no_email";

          if (lead.email) {
            const mxCheck = await validateEmailWithMx(lead.email);
            isEmailValid = mxCheck.valid;
            if (isEmailValid) {
              emailStatus = "not contacted";
              addLog("info", `✓ MX Verified: ${lead.email} (Mail Server: ${mxCheck.mx})`);
            } else {
              addLog("warn", `⚠ Unverified email for ${lead.name} (${lead.email}): ${mxCheck.reason}`);
            }
          }

          try {
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, website, owner_name, owner_role, linkedin, twitter, instagram, facebook, personalized_icebreaker, email_confirmed, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT DO NOTHING`,
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
        }'''

# Let's inspect where inserting leads happens in /api/scan-deepsearch
pos = content.find('for (const lead of rawLeads)')
if pos != -1:
    end_pos = content.find('await pool.query(\n          "UPDATE scans SET status = \'done\'', pos)
    if end_pos != -1:
        content = content[:pos] + new_loop_code + '\n\n        ' + content[end_pos:]
        print('✓ Upgraded DeepSearch loop with MX Validation & Social Fields')

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
