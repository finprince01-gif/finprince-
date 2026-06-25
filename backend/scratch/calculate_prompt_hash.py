import hashlib
import re

with open('ocr_pipeline/extraction.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Locate base_prompt in extraction.py
match = re.search(r'base_prompt\s*=\s*f"""(.*?)"""', code, re.DOTALL)
if match:
    template = match.group(1)
    
    for vt in ['Purchase', 'PURCHASE']:
        # Format the template
        prompt = f'Extract {vt} invoice data into this exact JSON schema:' + template
        
        # Calculate prefix hash
        prefix_text = prompt.strip()
        h = hashlib.sha256(prefix_text.encode('utf-8')).hexdigest()
        print(f'Voucher Type: {vt} -> Hash: {h}')
else:
    print('base_prompt not found in code')
