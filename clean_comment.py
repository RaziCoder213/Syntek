with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_comment = """  // Strategy 2: Parse Markdown formatted listings (e.g. ### 1. Business Name 
 Phone: ... 
 Website: ...)"""

good_comment = """  // Strategy 2: Parse Markdown formatted listings"""

content = content.replace(bad_comment, good_comment)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Saved server.js")
