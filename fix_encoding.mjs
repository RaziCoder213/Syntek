import { readFileSync, writeFileSync } from 'fs';

const files = [
  'C:/Users/Coder/Desktop/Syntek/src/App.jsx',
  'C:/Users/Coder/Desktop/Syntek/server.js',
  'C:/Users/Coder/Desktop/Syntek/src/components/Settings.jsx',
  'C:/Users/Coder/Desktop/Syntek/src/components/LeadFinder.jsx',
  'C:/Users/Coder/Desktop/Syntek/src/components/Inbox.jsx',
  'C:/Users/Coder/Desktop/Syntek/src/components/Dashboard.jsx',
];

let fixed = 0;
for (const fp of files) {
  try {
    const raw = readFileSync(fp);
    const hex4 = raw.slice(0, 4).toString('hex');
    const nulls = [...raw].filter(b => b === 0).length;
    const name = fp.split('/').pop();
    console.log(`${name}: ${raw.length} bytes, nulls=${nulls}, header=${hex4}`);
    
    // If UTF-16 LE (starts with FF FE or has many nulls), convert to UTF-8
    if (hex4.startsWith('fffe') || hex4.startsWith('feff') || nulls > 100) {
      const encoding = hex4.startsWith('feff') ? 'utf16be' : 'utf16le';
      const content = raw.toString(hex4.startsWith('feff') ? 'utf16be' : 'utf16le').replace(/^\uFEFF/, '');
      writeFileSync(fp, content, 'utf8');
      console.log(`  → Converted from UTF-16 to UTF-8`);
      fixed++;
    }
    // If UTF-8 with BOM (EF BB BF), strip BOM
    else if (hex4.startsWith('efbbbf')) {
      const content = raw.slice(3).toString('utf8');
      writeFileSync(fp, content, 'utf8');
      console.log(`  → Stripped UTF-8 BOM`);
      fixed++;
    }
  } catch (e) {
    console.log(`Skip ${fp}: ${e.message}`);
  }
}
console.log(`\nFixed ${fixed} files.`);
