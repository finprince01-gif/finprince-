
with open('traceback.log', 'r', encoding='utf-8') as f:
    content = f.read()
    
idx = content.find("1146")
if idx != -1:
    print(f"Context around 1146: {content[idx:idx+200]}")
else:
    print("1146 not found")
