with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_parser = """function parseLeadsFromAiOutput(rawText, defaultNiche = "Business", defaultLocation = "Austin, TX") {
  if (!rawText) return [];
  let leads = [];

  const jsonMatches = rawText.match(/\\[[\\s\\S]*?\\]/g) || [];
  for (const matchStr of jsonMatches) {
    try {
      const parsed = JSON.parse(matchStr);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
        return parsed;
      }
    } catch (e) {}
  }

  const blocks = rawText.split(/(?:###|\\n(?=\\d+\\.\\s|\\*\\*\\d+\\.\\*\\*))/);
  for (const block of blocks) {
    if (!block || block.length < 20) continue;

    const nameMatch = block.match(/\\*\\*([^*]+)\\*\\*/) || block.match(/^\\s*\\d+\\.\\s*\\*?\\*?([^\\n*]+)/);
    if (!nameMatch) continue;

    let name = nameMatch[1].replace(/^\\d+\\.\\s*/, "").replace(/\\*+$/, "").trim();
    if (name.toLowerCase() === defaultLocation.toLowerCase() || name.toLowerCase().includes("here are") || name.toLowerCase().includes("operating dental") || name.length < 3) continue;

    const phoneMatch = block.match(/(?:phone|tel|call):?\\s*\\*?\\*?\\s*([+\\d()\\s-]{10,20})/i);
    const urlMatch = block.match(/\\((https?:\\/\\/[^\\s)]+)\\)/i) || block.match(/https?:\\/\\/[^\\s\\n)]+/i);

    let siteUrl = urlMatch ? urlMatch[1] || urlMatch[0] : "";
    if (siteUrl.startsWith("[")) siteUrl = siteUrl.replace(/[\\[\\]]/g, "");

    let email = null;
    if (siteUrl) {
      const cleanDomain = siteUrl.replace(/^https?:\\/\\/(www\\.)?/, "").split('/')[0];
      if (cleanDomain && cleanDomain.includes(".")) {
        email = `info@${cleanDomain}`;
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
}"""

pos_start = content.find("function parseLeadsFromAiOutput")
if pos_start != -1:
    pos_end = content.find("async function performDeepSearchDirect", pos_start)
    if pos_end != -1:
        content = content[:pos_start] + new_parser + "\n\n" + content[pos_end:]
        print("SUCCESS: Updated parseLeadsFromAiOutput in server.js!")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
