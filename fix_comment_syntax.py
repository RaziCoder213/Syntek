with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix comment line in parseLeadsFromAiOutput
content = content.replace(" * Phone: ... \n * Website: ...", " Phone: ... \n Website: ...")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
