import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

async function callAiAgentPrompt(promptText) {
  try {
    const escaped = promptText.replace(/"/g, '\\"');
    const { stdout } = await execPromise(`agy -p "${escaped}"`, { timeout: 45000 });
    return stdout;
  } catch (err) {
    console.error('[AI AGENT ERROR]', err.message);
    throw err;
  }
}

async function testDeepSearch(niche, location, limit = 5) {
  console.log(`[LIVE TEST] Searching for "${niche}" in "${location}"...`);
  
  const prompt = `Search for ${limit} REAL, active, existing businesses matching Niche: "${niche}", Location: "${location}".
For each business provide:
- "name": Official business name
- "type": Business type/niche
- "city": City and State
- "email": Verified public contact email (e.g. info@domain.com, office@domain.com)
- "phone": Main office phone number
- "website": Official website URL (https://domain.com)
- "rating": Google rating (1.0 to 5.0)
- "reviews": Google review count (integer)
- "owner_name": Founder, Owner, or Lead Doctor name

Return ONLY a raw JSON array of objects. No markdown formatting, no explanation.`;

  try {
    const stdout = await callAiAgentPrompt(prompt);
    console.log('--- RAW STDOUT FROM AGY ---');
    console.log(stdout);

    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`✓ PARSED ${parsed.length} REAL LEADS:`);
      console.log(parsed);
      return parsed;
    } else {
      console.error('❌ Could not extract JSON array from AGY stdout');
    }
  } catch (err) {
    console.error('Test error:', err.message);
  }
  return [];
}

const leads = await testDeepSearch("Clinics, dentists", "Austin, TX", 5);
console.log('Result count:', leads.length);
