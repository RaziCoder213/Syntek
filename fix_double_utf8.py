import glob, re

files = glob.glob('src/**/*.jsx', recursive=True) + glob.glob('src/**/*.js', recursive=True) + ['server.js']

fixed_count = 0
for fp in files:
    try:
        with open(fp, 'rb') as f:
            raw = f.read()
        
        orig_len = len(raw)
        # Attempt decoding double UTF-8 / latin1 re-encode: raw -> string -> latin1 bytes -> utf-8 string
        try:
            s = raw.decode('utf-8')
            # If string contains latin-1 re-encoded UTF-8 sequences like '\xc3\x83' or '\xc3\xa2'
            if 'Ã' in s or 'â' in s or 'ð' in s:
                fixed_str = s.encode('latin-1', errors='ignore').decode('utf-8', errors='ignore')
                new_raw = fixed_str.encode('utf-8')
                with open(fp, 'wb') as f:
                    f.write(new_raw)
                print(f'Fixed double UTF-8 encoding in: {fp}')
                fixed_count += 1
        except Exception:
            pass
    except Exception as e:
        print(f'Error reading {fp}: {e}')

print(f'Total files repaired from double UTF-8: {fixed_count}')
