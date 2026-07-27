import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

async function testAgy() {
  const prompt = 'Find 3 real dental clinics in Denver, CO with their official email address, website, and phone number. Return ONLY a raw JSON array of objects with keys: name, city, email, phone, website, owner_name, rating, reviews. No markdown, no conversational text.';
  try {
    const { stdout } = await execPromise(`agy -p "${prompt.replace(/"/g, '\\"')}"`, { timeout: 45000 });
    console.log('--- AGY CLI OUTPUT ---');
    console.log(stdout);

    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✓ Successfully parsed JSON array with', parsed.length, 'leads:');
      console.log(parsed);
    }
  } catch (err) {
    console.error('Error executing agy:', err.message);
  }
}
testAgy();
