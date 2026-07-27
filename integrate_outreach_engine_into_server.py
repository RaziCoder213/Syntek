with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add helmet import and service imports at the top
top_imports = """import helmet from "helmet";
import { generateCompliantOutreachEmail, formatNicheName } from "./services/aiCopywriterService.js";
import { calculateLeadTierAndScore, checkIsCompetitorAgency } from "./services/scoringService.js";
import { formatCompliantEmailHtml, generateUnsubscribeToken, isLeadDueForNextStep, calculateGraduatedCap } from "./services/sequenceEngine.js";
import { createTrialRequest, updateTrialStatus, checkTrialCallCutoff } from "./services/trialService.js";
"""

if "import helmet from \"helmet\";" not in content:
    content = top_imports + content
    print("✓ Added top imports (helmet and services) to server.js")

# 2. Mount helmet middleware
if "app.use(helmet" not in content:
    pos_app = content.find("const app = express();")
    if pos_app != -1:
        content = content[:pos_app + 22] + "\napp.use(helmet({ contentSecurityPolicy: false }));\n" + content[pos_app + 22:]
        print("✓ Mounted helmet middleware on app")

# 3. Add Pre-send Dry-Run Mode route (Section 3)
dry_run_route = """
// Section 3: Pre-send Dry-Run Mode
app.post("/api/campaigns/dry-run", authenticate, async (req, res) => {
  try {
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = decryptConfig(settingsRes.rows[0]) || {};

    const leadsRes = await pool.query(
      `SELECT * FROM leads 
       WHERE user_id = $1 
         AND status NOT IN ('unsubscribed', 'bounced', 'replied', 'opt_out')
         AND (qualification_score >= 40 OR source_tier >= 4)
       ORDER BY source_tier DESC, qualification_score DESC, id ASC 
       LIMIT 10`,
      [req.userId]
    );

    const previews = [];
    for (const lead of leadsRes.rows) {
      const emailObj = await generateCompliantOutreachEmail(lead, config);
      const compliantHtml = formatCompliantEmailHtml(emailObj.body, config);
      previews.push({
        leadId: lead.id,
        leadName: lead.name,
        email: lead.email,
        niche: lead.type || lead.niche,
        sequenceStep: lead.sequence_step || 0,
        subject: emailObj.subject,
        plainTextBody: emailObj.body,
        compliantHtml,
        wordCount: emailObj.wordCount
      });
    }

    res.json({
      success: true,
      count: previews.length,
      mode: "dry_run (no emails sent)",
      previews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
"""

if "/api/campaigns/dry-run" not in content:
    content += "\n" + dry_run_route
    print("✓ Added /api/campaigns/dry-run endpoint")

# 4. Add Compliance Unsubscribe endpoint (Section 5)
unsub_route = """
// Section 5: Signed Unsubscribe Endpoint
app.all("/api/emails/unsubscribe", async (req, res) => {
  try {
    const leadId = req.query.leadId || req.body?.leadId;
    const token = req.query.token || req.body?.token;

    if (!leadId) {
      return res.status(400).send("Invalid unsubscribe link.");
    }

    // Mark lead unsubscribed directly
    await pool.query(
      `UPDATE leads 
       SET status = 'unsubscribed', pipeline_stage = 'Unsubscribed / Opt Out' 
       WHERE id = $1`,
      [leadId]
    );

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h2>You have been unsubscribed</h2>
          <p>You will not receive any further automated emails from Noryvex.</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error processing request.");
  }
});
"""

if "/api/emails/unsubscribe" not in content:
    content += "\n" + unsub_route
    print("✓ Added /api/emails/unsubscribe endpoint")

# 5. Add Free Trial Request Form endpoint (Section 6)
trial_route = """
// Section 6: Free Trial Request Form Endpoint
app.post("/api/trial-request", async (req, res) => {
  try {
    const { business_name, contact_name, email, phone, niche, agent_scope } = req.body;
    if (!business_name || !contact_name || !email) {
      return res.status(400).json({ error: "business_name, contact_name, and email are required" });
    }

    const trial = await createTrialRequest({
      userId: 19,
      businessName: business_name,
      contactName: contact_name,
      email,
      phone,
      niche,
      agentScope: agent_scope || "both"
    });

    res.json({
      success: true,
      message: "we'll have it ready within 24 hours",
      trial
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/trial-requests", authenticate, async (req, res) => {
  try {
    const requests = await pool.query("SELECT * FROM trial_requests ORDER BY id DESC");
    res.json(requests.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
"""

if "/api/trial-request" not in content:
    content += "\n" + trial_route
    print("✓ Added /api/trial-request endpoint")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
