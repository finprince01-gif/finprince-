import hashlib
import re

with open('ocr_pipeline/extraction.py', 'rb') as f:
    code_bytes = f.read()

code = code_bytes.decode('utf-8')

# Locate base_prompt in extraction.py
match = re.search(r'base_prompt\s*=\s*f"""(.*?)"""', code, re.DOTALL)
if match:
    template = match.group(1)
    
    for vt in ['Purchase', 'PURCHASE']:
        prompt = f'Extract {vt} invoice data into this exact JSON schema:' + template
        prefix_text = prompt.strip()
        
        # Test with LF (\n) only
        lf_text = prefix_text.replace('\r\n', '\n')
        h_lf = hashlib.sha256(lf_text.encode('utf-8')).hexdigest()
        
        # Test with CRLF (\r\n) only
        crlf_text = prefix_text.replace('\r\n', '\n').replace('\n', '\r\n')
        h_crlf = hashlib.sha256(crlf_text.encode('utf-8')).hexdigest()
        
        print(f'Voucher Type: {vt}')
        print(f'  LF  Hash: {h_lf}')
        print(f'  CRLF Hash: {h_crlf}')
else:
    print('base_prompt not found in code')
