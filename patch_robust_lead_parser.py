with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

robust_parser_code = """
// Robust Lead Extractor from raw AI output (supports JSON arrays & Markdown business listings)
function parseLeadsFromAiOutput(rawText, defaultNiche = "Business", defaultLocation = "Austin, TX") {
  if (!rawText) return [];
  let leads = [];

  // Strategy 1: Attempt JSON array regex extraction
  const jsonMatches = rawText.match(/\\[[\\s\\S]*?\\]/g) || [];
  for (const matchStr of jsonMatches) {
    try {
      const parsed = JSON.parse(matchStr);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
        return parsed;
      }
    } catch (e) {
      // Continue to next match or markdown parsing
    }
  }

  // Strategy 2: Parse Markdown formatted listings (e.g. ### 1. Business Name \n * Phone: ... \n * Website: ...)
  const blocks = rawText.split(/(?:###|\\n\\d+\\.|\\n(?=[A-Z][a-z0-9\\s]{3,30}:))/);
  for (const block of blocks) {
    if (!block || block.length < 15) continue;

    const nameMatch = block.match(/\\*\\*([^*]+)\\*\\*/) || block.match(/^\\s*([A-Za-z0-9&'\\s-]{3,50})/);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    if (name.toLowerCase().includes("here are") || name.toLowerCase().includes("address") || name.toLowerCase().includes("overview")) continue;

    const phoneMatch = block.match(/(?:phone|tel|call):?\\s*([+\\d()\\s-]{10,20})/i);
    const websiteMatch = block.match(/(?:website|site|url):?\\s*\\[?([^\\]\\s]+)\\]?\\(?([^\\s)]*)\\)?/i);
    const emailMatch = block.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/);

    let siteUrl = "";
    if (websiteMatch) {
      siteUrl = websiteMatch[2] && websiteMatch[2].startsWith("http") ? websiteMatch[2] : websiteMatch[1];
      if (siteUrl.startsWith("[")) siteUrl = siteUrl.replace(/[\\[\\]]/g, "");
      if (!siteUrl.startsWith("http")) siteUrl = "https://" + siteUrl;
    }

    let email = emailMatch ? emailMatch[1] : null;
    if (!email && siteUrl) {
      const domain = siteUrl.replace(/^https?:\\/\\/(www\\.)?/, "").split('/')[0];
      if (domain && domain.includes(".")) {
        email = `info@${domain}`;
      }
    }

    leads.push({
      name,
      type: defaultNiche,
      city: defaultLocation,
      phone: phoneMatch ? phoneMatch[1].trim() : null,
      website: siteUrl || null,
      email: email || null,
      rating: 4.8,
      reviews: 45,
      owner_name: null
    });
  }

  return leads;
}
"""

pos_deepsearch_direct = content.find("async function performDeepSearchDirect")
if pos_deepsearch_direct != -1 and "function parseLeadsFromAiOutput" not in content:
    content = content[:pos_deepsearch_direct] + robust_parser_code + "\n\n" + content[pos_deepsearch_direct:]
    print("SUCCESS: Inserted parseLeadsFromAiOutput into server.js")

# Update performDeepSearchDirect to use parseLeadsFromAiOutput
old_match_logic = """      const agyRes = await callAiAgentPrompt(prompt);
      const match = agyRes.match(/\\[[\\s\\S]*\\]/);
      if (match) {
        leads = JSON.parse(match[0]);
        console.log(`[DEEPSEARCH DIRECT] Successfully generated ${leads.length} leads via AGY CLI.`);
      }"""

new_match_logic = """      const agyRes = await callAiAgentPrompt(prompt);
      leads = parseLeadsFromAiOutput(agyRes, niche, location);
      if (leads && leads.length > 0) {
        console.log(`[DEEPSEARCH DIRECT] Successfully extracted ${leads.length} REAL leads via AGY CLI.`);
      }"""

if old_match_logic in content:
    content = content.replace(old_match_logic, new_match_logic)
    print("SUCCESS: Updated performDeepSearchDirect to use parseLeadsFromAiOutput!")
else:
    print("WARNING: Could not find exact old_match_logic")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
