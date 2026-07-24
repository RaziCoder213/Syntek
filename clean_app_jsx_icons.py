import re

with open('src/App.jsx', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Replace toastIcon line
content = re.sub(r'const toastIcon = \{[^}]+\};', 'const toastIcon = { success: "✓", danger: "✕", info: "ℹ️", warning: "⚠️" };', content)

# Replace notification icon line
content = re.sub(r"\{n\.type === 'reply' \?[^}]+\}", "{n.type === 'reply' ? '💬' : n.type === 'reminder' ? '⏰' : n.type === 'campaign' ? '🚀' : '⚙️'}", content)

# Replace any garbled close icons
content = content.replace("âœ•", "✕")
content = content.replace("â„¹", "ℹ️")

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("App.jsx icons cleaned successfully!")
