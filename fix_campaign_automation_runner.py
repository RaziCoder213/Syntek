with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """            // Mark as contacted BEFORE sending to prevent race conditions
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'not contacted'",
              [lead.id, req.userId]
            );

            // Generate personalized email using the full AI outreach function
            const { subject, body } = await generateDeveloperOutreach(lead, config);

            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
            });

            // Record in emails table so Inbox shows it
            await pool.query(
              `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
               VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'sent', ARRAY['sent'], $6)`,
              [lead.name, normalizedEmail, lead.name, subject, body.substring(0, 300), req.userId]
            );"""

new_block = """            // Generate personalized email using the full AI outreach function
            const { subject, body } = await generateDeveloperOutreach(lead, config);
            const formattedHtml = formatProfessionalEmailHtml(body, config);

            // 1. Send via SMTP with HTML & signature
            await transporter.sendMail({
              from: `"${config.sender_name || "Syntek"}" <${config.gmail_user}>`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml,
            });

            // 2. Mark lead as contacted ONLY AFTER send succeeds
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2",
              [lead.id, req.userId]
            );

            // 3. Record in emails database
            await pool.query(
              `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
               VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, 'sent', ARRAY['sent'], $6)`,
              [lead.name, normalizedEmail, lead.name, subject, body.substring(0, 300), req.userId]
            );

            // 4. Auto-append copy directly into PrivateEmail IMAP Sent folder
            await appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(err => {
              console.error(`[CAMPAIGN IMAP ERROR] Could not save copy to Sent folder for ${lead.email}:`, err.message);
            });

            // 5. 2-second rate-limiting delay between sends
            await new Promise(r => setTimeout(r, 2000));"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print("SUCCESS: Patched campaign automation runner with IMAP Sent append + HTML formatting + post-send status update + 2s delay!")
else:
    print("ERROR: Could not find old_block in server.js")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
