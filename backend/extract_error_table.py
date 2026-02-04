
import re

try:
    with open('traceback.log', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Pattern: Table 'db.table' doesn't exist (possibly HTML encoded)
    # 1146, 'Table &#x27;Ai_accounting.customer_master_customer_gstdetails&#x27; doesn&#x27;t exist'
    
    match = re.search(r"Table (?:&#x27;|')([^']+?)(?:&#x27;|') doesn(?:&#x27;|')t exist", content, re.IGNORECASE)
    if match:
        print(f"MISSING TABLE: {match.group(1)}")
    else:
        print("Could not find table name in log.")
        # Fallback: find 1146
        idx = content.find("1146")
        if idx != -1:
            print(f"Snippet: {content[idx:idx+200]}")

except Exception as e:
    print(f"Error: {e}")
