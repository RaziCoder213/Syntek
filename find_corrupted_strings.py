import os, glob

files = glob.glob('src/**/*.jsx', recursive=True) + glob.glob('src/**/*.js', recursive=True) + ['server.js']

found = 0
for fp in files:
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check for common UTF-8 mojibake patterns from PowerShell / ISO-8859 conversions
        corrupt_patterns = ['Gï¿½ï¿½', 'âš', 'ï¿½', 'Ã—', 'â€', 'âœ', 'ðŸ', 'âš ï¸']
        matches = [p for p in corrupt_patterns if p in content]
        if matches:
            print(f'File {fp} has corrupted patterns: {matches}')
            found += 1
    except Exception as e:
        print(f'Error reading {fp}: {e}')

print(f'\nTotal files with corrupted patterns: {found}')
