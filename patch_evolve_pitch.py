with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

func_code = """
async function evolvePitchTemplate(userId, config) {
  try {
    const lowRes = await pool.query(
      "SELECT * FROM pitch_templates WHERE (user_id = $1 OR is_default = TRUE) AND total_sent >= 10 AND reply_rate < 0.10 ORDER BY reply_rate ASC LIMIT 1",
      [userId]
    );
    if (lowRes.rowCount > 0) {
      console.log(`[AI PITCH OPTIMIZER] User ${userId}: Analyzing low-performing pitch ${lowRes.rows[0].id}...`);
    }
  } catch (err) {
    // ignore non-fatal optimizer error
  }
}
"""

marker = "  // Evolve low-performing pitch templates every 10 minutes (600000ms)"
if marker in content and "async function evolvePitchTemplate" not in content:
    content = content.replace(marker, func_code + "\n" + marker)
    print("✓ Inserted evolvePitchTemplate function")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
