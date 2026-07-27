import fs from 'fs';

const replaceMap = [
  { file: 'server.js', search: 'noryvex.com', replace: 'trynoryvex.com' },
  { file: 'missing_functions.js', search: 'noryvex.com', replace: 'trynoryvex.com' },
  { file: 'apply_outreach_upgrades.mjs', search: 'noryvex.com', replace: 'trynoryvex.com' },
  { file: 'patch_email_formatting.mjs', search: 'noryvex.com', replace: 'trynoryvex.com' },
  { file: 'test_email_gen.mjs', search: 'noryvex.com', replace: 'trynoryvex.com' }
];

for (const item of replaceMap) {
  const path = `C:/Users/Coder/Desktop/Syntek/${item.file}`;
  if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf8');
    if (content.includes(item.search)) {
      content = content.replaceAll(item.search, item.replace);
      fs.writeFileSync(path, content, 'utf8');
      console.log(`✓ Replaced all instances of ${item.search} with ${item.replace} in ${item.file}`);
    }
  }
}
