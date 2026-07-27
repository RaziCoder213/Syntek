import fs from 'fs';

const filePath = 'C:/Users/Coder/Desktop/Syntek/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the pre-send status update logic in campaign runner
const oldPreSendCode = `            // Mark as contacted BEFORE sending to prevent race conditions
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'not contacted'",
              [lead.id, req.userId]
            );

            // Generate personalized email using the full AI outreach function
            const { subject, body } = await generateDeveloperOutreach(lead, config);

            const formattedHtml = formatProfessionalEmailHtml(body, config);
            await transporter.sendMail({
              from: \`"\${config.sender_name || "Syntek"}" <\${config.gmail_user}>\`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml,
            });
            appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});`;

const newPostSendCode = `            // Generate personalized email using the full AI outreach function
            const { subject, body } = await generateDeveloperOutreach(lead, config);
            const formattedHtml = formatProfessionalEmailHtml(body, config);

            // Send via SMTP
            await transporter.sendMail({
              from: \`"\${config.sender_name || "Syntek"}" <\${config.gmail_user}>\`,
              to: lead.email,
              subject,
              text: body,
              html: formattedHtml,
            });

            // Mark as contacted ONLY AFTER sendMail succeeds
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2",
              [lead.id, req.userId]
            );

            appendSentMessageToImap(config, { to: lead.email, subject, htmlBody: formattedHtml }).catch(() => {});

            // Add 2-second rate-limiting delay between email sends
            await new Promise(r => setTimeout(r, 2000));`;

if (content.includes(oldPreSendCode)) {
  content = content.replace(oldPreSendCode, newPostSendCode);
  console.log('✓ Fixed status update to trigger ONLY AFTER sendMail succeeds & added 2s send throttle');
} else {
  console.warn('⚠ Could not find oldPreSendCode block directly');
}

// Update error handler in campaign runner to catch 554 5.7.1 rate limits
const oldCatchCode = `          } catch (e) {
            console.error(\`[CAMPAIGNS/RUN] Failed for \${lead.email}:\`, e.message);
            // Revert contacted status if send failed
            await pool.query(
              "UPDATE leads SET status = 'not contacted', pipeline_stage = NULL, contacted_at = NULL WHERE id = $1 AND user_id = $2 AND contacted_at > NOW() - INTERVAL '1 minute'",
              [lead.id, req.userId]
            ).catch(() => {});
          }`;

const newCatchCode = `          } catch (e) {
            console.error(\`[CAMPAIGNS/RUN] Failed for \${lead.email}:\`, e.message);
            if (e.message.includes('554 5.7.1') || e.message.includes('too many messages')) {
              console.warn(\`[CAMPAIGNS/RUN] ⚠ Hourly sending limit reached for \${config.gmail_user}. Pausing remaining campaign batch.\`);
              break; // Stop campaign batch cleanly when provider rate limit is hit
            }
          }`;

if (content.includes(oldCatchCode)) {
  content = content.replace(oldCatchCode, newCatchCode);
  console.log('✓ Upgraded catch block for rate-limit safety');
} else {
  console.warn('⚠ Could not find oldCatchCode block directly');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved server.js with rate-limiting & status fixes');
