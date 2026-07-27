with open('services/scoringService.js', 'r', encoding='utf-8') as f:
    content = f.read()

alias_code = """
// Alias export for backward compatibility with pipelineService.js
export function calculateQualityScore(lead) {
  const res = calculateLeadTierAndScore(lead);
  return {
    score: res.score,
    tier: res.tier,
    passed: res.shouldQueue,
    isCompetitor: res.isCompetitor,
    reason: res.statusReason
  };
}
"""

if "export function calculateQualityScore" not in content:
    content += "\n" + alias_code
    print("SUCCESS: Added calculateQualityScore alias export to services/scoringService.js")

with open('services/scoringService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved services/scoringService.js")
