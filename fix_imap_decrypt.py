with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_decrypt_line = """    let pass = config.gmail_pass;
    if (!user || !pass) return;
    if (typeof pass === 'string' && pass.startsWith("enc:")) {
      pass = decryptText(pass);
    }"""

new_decrypt_line = """    let pass = config.gmail_pass;
    if (!user || !pass) return;
    pass = decryptText(pass);"""

if old_decrypt_line in content:
    content = content.replace(old_decrypt_line, new_decrypt_line)
    print("SUCCESS: Fixed appendSentMessageToImap password decryption!")
else:
    print("WARNING: Could not find exact old_decrypt_line, attempting flexible replace")
    pos = content.find("async function appendSentMessageToImap")
    if pos != -1:
        pos_user = content.find("const user =", pos)
        if pos_user != -1:
            pos_host = content.find("const host =", pos_user)
            sub = content[pos_user:pos_host]
            new_sub = "const user = config.gmail_user;\n    let pass = decryptText(config.gmail_pass || \"\");\n    if (!user || !pass) return;\n    "
            content = content[:pos_user] + new_sub + content[pos_host:]
            print("SUCCESS: Flexibly replaced password decryption in appendSentMessageToImap!")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
