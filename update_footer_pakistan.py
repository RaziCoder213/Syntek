with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_footer_address = "Noryvex Automation · 100 Congress Ave, Austin, TX 78701"
new_footer_address = "Noryvex · Karachi, Pakistan"

if old_footer_address in content:
    content = content.replace(old_footer_address, new_footer_address)
    print("SUCCESS: Updated physical compliance footer address to Pakistan!")
else:
    print("WARNING: Could not find exact old_footer_address, attempting flexible replace")
    pos = content.find("CAN-SPAM Compliance & Unsubscribe Footer")
    if pos != -1:
        pos_end = content.find("</div>\n</div>", pos)
        if pos_end != -1:
            old_chunk = content[pos:pos_end]
            new_chunk = old_chunk.replace("100 Congress Ave, Austin, TX 78701", "Karachi, Pakistan")
            content = content[:pos] + new_chunk + content[pos_end:]
            print("SUCCESS: Flexibly replaced address with Karachi, Pakistan!")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
