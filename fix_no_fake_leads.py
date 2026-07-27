with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_fallback_code = """  // Fallback seed generator matching region area code & auto-calculating score
  if (!leads || leads.length === 0) {
    console.log("[DEEPSEARCH DIRECT] Generating verified local niche leads fallback...");
    const cleanNiche = niche.split(',')[0].trim();
    const cleanLoc = location.split(',')[0].trim();
    const isUK = location.toLowerCase().includes("london") || location.toLowerCase().includes("uk") || location.toLowerCase().includes("england");
    const isAustin = location.toLowerCase().includes("austin");
    
    const phonePrefix = isUK ? "+44 20 7946 " : isAustin ? "(512) 555-" : "(303) 555-";
    
    leads = [
      { name: `${cleanLoc} ${cleanNiche} Center`, type: cleanNiche, city: location, email: `info@${cleanLoc.toLowerCase().replace(/[^a-z]/g, '')}${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}.com`, phone: `${phonePrefix}0192`, rating: 4.8, reviews: 124, website: `https://${cleanLoc.toLowerCase().replace(/[^a-z]/g, '')}${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}.com`, owner_name: "Dr. James Wilson" },
      { name: `Apex ${cleanNiche} Care ${cleanLoc}`, type: cleanNiche, city: location, email: `contact@apex${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}co.com`, phone: `${phonePrefix}0144`, rating: 4.9, reviews: 88, website: `https://apex${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}co.com`, owner_name: "Dr. Sarah Jenkins" },
      { name: `Highland ${cleanNiche} Group`, type: cleanNiche, city: location, email: `office@highland${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}.com`, phone: `${phonePrefix}0188`, rating: 4.7, reviews: 210, website: `https://highland${cleanNiche.toLowerCase().replace(/[^a-z]/g, '')}.com`, owner_name: "Dr. Robert Taylor" }
    ];
  }"""

new_fallback_code = """  // ZERO FAKE LEADS GUARANTEE — Never invent dummy/fake leads
  if (!leads || leads.length === 0) {
    console.warn(`[DEEPSEARCH DIRECT] Search returned 0 verified leads for "${niche}" in "${location}". Zero fake leads rule enforced.`);
    return [];
  }"""

if old_fallback_code in content:
    content = content.replace(old_fallback_code, new_fallback_code)
    print("SUCCESS: Replaced mock seed generator with Zero Fake Leads Guarantee!")
else:
    print("WARNING: Could not find exact old_fallback_code")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
