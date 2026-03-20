import os
import re

def fix_models(root_dir):
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Replace 'managed = False' with 'managed = True' or just remove it
                # Removing is better as it defaults to True
                new_content = re.sub(r'^\s*managed\s*=\s*False\s*$', '', content, flags=re.MULTILINE)
                
                if content != new_content:
                    print(f"Updating {path}")
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)

if __name__ == "__main__":
    fix_models('backend')
