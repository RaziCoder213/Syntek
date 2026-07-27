with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update post-send status logic
pos1 = content.find("generateDeveloperOutreach(lead, config);")
if pos1 != -1:
    pos_mail = content.find("await transporter.sendMail(", pos1)
    if pos_mail != -1:
        pos_end_mail = content.find("});", pos_mail)
        if pos_end_mail != -1:
            code_insert = """

            // Mark as contacted ONLY AFTER sendMail succeeds
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2",
              [lead.id, req.userId]
            );

            // Add 2-second rate-limiting delay between email sends
            await new Promise(r => setTimeout(r, 2000));"""
            
            # Remove any earlier pre-send status update before generateDeveloperOutreach
            pre_update_str = """            // Mark as contacted BEFORE sending to prevent race conditions
            await pool.query(
              "UPDATE leads SET status = 'contacted', pipeline_stage = 'Contacted', contacted_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'not contacted'",
              [lead.id, req.userId]
            );"""
            if pre_update_str in content:
                content = content.replace(pre_update_str, "")
                print("✓ Removed pre-send status update")
            
            # Insert post-send update right after transporter.sendMail block
            content = content[:pos_end_mail + 3] + code_insert + content[pos_end_mail + 3:]
            print("✓ Added post-send status update & 2s delay")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
