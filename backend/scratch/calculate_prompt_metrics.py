import os
import hashlib

system_path = 'REAL_SYSTEM_PROMPT.txt'
user_path = 'REAL_USER_PROMPT.txt'

if not os.path.exists(system_path) or not os.path.exists(user_path):
    print("Files not found at default path, trying backend directory...")
    system_path = os.path.join('backend', system_path)
    user_path = os.path.join('backend', user_path)

with open(system_path, 'r', encoding='utf-8') as sf:
    system_prompt = sf.read().strip()

with open(user_path, 'r', encoding='utf-8') as uf:
    user_prompt = uf.read()

print(f"System Prompt Length: {len(system_prompt)} chars")
print(f"User Prompt Length: {len(user_prompt)} chars")

# Prefix text is split on "### ["
prefix_text = user_prompt.split("### [")[0].strip()
page_specific_text = "### [" + user_prompt.split("### [")[1]

prefix_hash = hashlib.sha256(prefix_text.encode('utf-8')).hexdigest()
prompt_hash = hashlib.sha256(user_prompt.encode('utf-8')).hexdigest()

print(f"Prefix Text Length: {len(prefix_text)} chars")
print(f"Prefix Hash: {prefix_hash}")
print(f"Page Specific Text Length: {len(page_specific_text)} chars")
print(f"User Prompt Hash: {prompt_hash}")

# Let's save REAL_COMBINED_PROMPT.txt
combined_prompt = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
combined_path = os.path.join(os.path.dirname(system_path), "REAL_COMBINED_PROMPT.txt")
with open(combined_path, 'w', encoding='utf-8') as cf:
    cf.write(combined_prompt)
print(f"Saved combined prompt to {combined_path} ({len(combined_prompt)} chars)")
