import sys

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# -------------------------------------------------------------
# RULE (a): Anti-Fabrication Prompt & Clean Icebreaker Handling
# -------------------------------------------------------------
old_enrichment_prompt = """You are an AI Lead Enrichment Agent. Your task is to research this business online and write a highly personalized, warm 1-sentence compliment/icebreaker that we can use to start a cold outreach email to the owner or manager."""

new_enrichment_prompt = """You are an AI Lead Enrichment Agent for Noryvex. Your task is to research this business online and write a highly personalized, warm 1-sentence icebreaker based ONLY on real, verified facts.

CRITICAL ANTI-FABRICATION RULE:
Only generate an icebreaker if you have a REAL, VERIFIED observation about this specific business (e.g. from Google reviews, site layout, phone-only booking, awards).
If you cannot verify a specific, real detail about this business, output EXACTLY: "NO_VERIFIED_DETAIL".
Do NOT invent, fabricate, or guess plausible-sounding details under any circumstances."""

if old_enrichment_prompt in content:
    content = content.replace(old_enrichment_prompt, new_enrichment_prompt)
    print("✓ Updated AI Enrichment Agent with Anti-Fabrication Rule Prompt")
else:
    print("⚠ Could not match old_enrichment_prompt")

# Remove fake fallback icebreaker on enrichment failure (~L5953)
old_fallback_code = """        // Set a default friendly fallback icebreaker so we don't keep retrying it indefinitely
        const fallbackIcebreaker = `Noticed ${lead.name} has a great local presence in ${lead.city || "your area"}.`;
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = $1 WHERE id = $2",
          [fallbackIcebreaker, lead.id]
        );
        console.log(`[ENRICHMENT FALLBACK] Set fallback icebreaker for lead "${lead.name}" (ID ${lead.id})`);"""

new_fallback_code = """        // On failure or unverified detail, set empty string so Step 1 cleanly skips the icebreaker line
        await pool.query(
          "UPDATE leads SET personalized_icebreaker = '' WHERE id = $2",
          [lead.id]
        );
        console.log(`[ENRICHMENT NO-ICEBREAKER] Marked lead "${lead.name}" (ID ${lead.id}) with no icebreaker.`);"""

if old_fallback_code in content:
    content = content.replace(old_fallback_code, new_fallback_code)
    print("✓ Removed fake fallback icebreakers on enrichment failure")

# Update generateNoryvexSequenceEmail Step 1 icebreaker logic
old_step1_icebreaker = """    let icebreakerLine = "";
    if (lead.personalized_icebreaker && lead.personalized_icebreaker.length > 5) {
      icebreakerLine = lead.personalized_icebreaker.trim();
    }"""

new_step1_icebreaker = """    let icebreakerLine = "";
    if (lead.personalized_icebreaker && 
        lead.personalized_icebreaker.trim().length > 5 && 
        !lead.personalized_icebreaker.includes("NO_VERIFIED_DETAIL")) {
      icebreakerLine = lead.personalized_icebreaker.trim();
    }"""

if old_step1_icebreaker in content:
    content = content.replace(old_step1_icebreaker, new_step1_icebreaker)
    print("✓ Updated Step 1 icebreaker handling to skip unverified lines cleanly")

# -------------------------------------------------------------
# RULE (b): Unsubscribe & Opt-Out Halts Sequence
# -------------------------------------------------------------
old_sequence_halt = """            // Hard DB re-check: confirm lead is still not-contacted AND no email sent to this address in last 24h
            const freshCheck = await pool.query(
              `SELECT l.id, l.status FROM leads l WHERE l.id = $1 AND l.user_id = $2 AND l.status = 'not contacted'`,
              [lead.id, req.userId]
            );"""

new_sequence_halt = """            // Hard DB re-check: halt sequence immediately if lead is replied, bounced, unsubscribed, or archived
            const freshCheck = await pool.query(
              `SELECT l.id, l.status, l.pipeline_stage FROM leads l 
               WHERE l.id = $1 AND l.user_id = $2 
                 AND l.status NOT IN ('replied', 'bounced', 'unsubscribed', 'opt_out', 'not interested', 'trashed', 'archived')
                 AND (l.pipeline_stage IS NULL OR l.pipeline_stage NOT IN ('Replied', 'Archived', 'Unsubscribed', 'Opt Out'))`,
              [lead.id, req.userId]
            );"""

if old_sequence_halt in content:
    content = content.replace(old_sequence_halt, new_sequence_halt)
    print("✓ Updated Campaign Runner to halt sequence on Unsubscribe / Opt-out / Replied / Bounced")

# -------------------------------------------------------------
# RULE (c): Compliance Unsubscribe Footer Auto-Injected
# -------------------------------------------------------------
old_html_footer = """    <div style="margin-top: 6px; font-size: 12.5px; color: #64748b;">
      <a href="https://linkedin.com/in/mrazi-dev" target="_blank" style="color: #475569; text-decoration: none;">LinkedIn: linkedin.com/in/mrazi-dev</a>
    </div>
  </div>
</div>"""

new_html_footer = """    <div style="margin-top: 6px; font-size: 12.5px; color: #64748b;">
      <a href="https://linkedin.com/in/mrazi-dev" target="_blank" style="color: #475569; text-decoration: none;">LinkedIn: linkedin.com/in/mrazi-dev</a>
    </div>
  </div>

  <!-- CAN-SPAM Compliance & Unsubscribe Footer -->
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
    Noryvex Automation · 100 Congress Ave, Austin, TX 78701<br/>
    <a href="mailto:optout@trynoryvex.com?subject=Unsubscribe" style="color: #94a3b8; text-decoration: underline;">Unsubscribe / Opt-out</a>
  </div>
</div>"""

if old_html_footer in content:
    content = content.replace(old_html_footer, new_html_footer)
    print("✓ Auto-injected CAN-SPAM Compliance & Unsubscribe Footer")

# -------------------------------------------------------------
# RULE (d): Warmup Cap (10 emails/day initial limit)
# -------------------------------------------------------------
old_limit_query = "ORDER BY id ASC LIMIT 20"
new_limit_query = "ORDER BY id ASC LIMIT 10"

if old_limit_query in content:
    content = content.replace(old_limit_query, new_limit_query)
    print("✓ Set daily campaign batch limit to 10 emails/day for warmup safety")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js with 4 Safety Rules!")
