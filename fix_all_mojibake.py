import glob, re

files = glob.glob('src/**/*.jsx', recursive=True) + glob.glob('src/**/*.js', recursive=True) + ['server.js']

replacements = [
    ("n.type === 'reply' ? 'ðŸ’¬' : n.type === 'reminder' ? 'â\x8f°' : n.type === 'campaign' ? 'ðŸš€' : 'âš™ï¸\x8f'", "n.type === 'reply' ? '💬' : n.type === 'reminder' ? '⏰' : n.type === 'campaign' ? '🚀' : '⚙️'"),
    ("âœ•", "✕"),
    ("â„¹", "ℹ️"),
    ("âš™ï¸\x8f", "⚙️"),
    ("ðŸ’¬", "💬"),
    ("ðŸš€", "🚀"),
    ("â\x9d€", "──"),
    ("Gï¿½ï¿½", "⚡"),
    ("âš ï¸\x8f", "⚠️"),
]

fixed_files = 0
for fp in files:
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        orig = content
        for bad, good in replacements:
            content = content.replace(bad, good)
        
        content = re.sub(r'âœ•', '✕', content)
        content = re.sub(r'â„¹', 'ℹ️', content)

        if content != orig:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Cleaned icons in: {fp}')
            fixed_files += 1
    except Exception as e:
        print(f'Error processing {fp}: {e}')

print(f'Total files updated: {fixed_files}')
