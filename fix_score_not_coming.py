with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update /api/scan-deepsearch insert block (around line 6695)
old_deepsearch_insert = """            await pool.query(
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
            );"""

new_deepsearch_insert = """            const scored = calculateLeadTierAndScore(lead);
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, owner_role, owner_contact, qualification_reason, personalized_icebreaker, sequence_step, tier, qualification_score, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,0,$21,$22,$23)
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
                lead.qualification_reason || scored.statusReason || "AI Verified Lead",
                lead.personalized_icebreaker || null,
                scored.tier || 3,
                scored.score || 70,
                req.userId
              ]
            );"""

if old_deepsearch_insert in content:
    content = content.replace(old_deepsearch_insert, new_deepsearch_insert)
    print("SUCCESS 1: Patched /api/scan-deepsearch insert block with qualification_score and tier!")
else:
    print("WARNING 1: Could not find exact old_deepsearch_insert")

# 2. Update /api/deepsearch bridge insert block (around line 6783)
old_bridge_insert = """            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, owner_role, owner_contact, qualification_reason, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
               ON CONFLICT DO NOTHING`,
              [
                lead.name, lead.type || "Business", lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.0,
                lead.reviews ? parseInt(lead.reviews, 10) : 0,
                lead.email ? "not contacted" : "no_email",
                lead.instagram || null, lead.website || null, lead.website_status || "unknown",
                lead.linkedin || null, lead.facebook || null, lead.whatsapp || null, lead.twitter || null,
                lead.owner_name || null, lead.owner_role || null, lead.owner_contact || null,
                lead.qualification_reason || null,
                req.userId
              ]
            );"""

new_bridge_insert = """            const scored = calculateLeadTierAndScore(lead);
            await pool.query(
              `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, website, website_status, linkedin, facebook, whatsapp, twitter, owner_name, owner_role, owner_contact, qualification_reason, tier, qualification_score, user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
               ON CONFLICT DO NOTHING`,
              [
                lead.name, lead.type || "Business", lead.city || resolvedLocation,
                lead.email || null, lead.phone || null,
                lead.rating ? parseFloat(lead.rating) : 4.0,
                lead.reviews ? parseInt(lead.reviews, 10) : 0,
                lead.email ? "not contacted" : "no_email",
                lead.instagram || null, lead.website || null, lead.website_status || "unknown",
                lead.linkedin || null, lead.facebook || null, lead.whatsapp || null, lead.twitter || null,
                lead.owner_name || null, lead.owner_role || null, lead.owner_contact || null,
                lead.qualification_reason || scored.statusReason || "AI Verified Lead",
                scored.tier || 3,
                scored.score || 70,
                req.userId
              ]
            );"""

if old_bridge_insert in content:
    content = content.replace(old_bridge_insert, new_bridge_insert)
    print("SUCCESS 2: Patched /api/deepsearch bridge insert block with qualification_score and tier!")
else:
    print("WARNING 2: Could not find exact old_bridge_insert")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
