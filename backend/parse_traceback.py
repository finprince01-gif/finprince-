
import re

try:
    with open('traceback.log', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Regex to find Exception Type and Value in Django 500 page
    match_type = re.search(r'<th>Exception Type:</th>\s*<td>\s*(.*?)\s*</td>', content, re.DOTALL)
    match_value = re.search(r'<th>Exception Value:</th>\s*<td>\s*<pre[^>]*>(.*?)</pre>\s*</td>', content, re.DOTALL)
    
    if match_type:
        print(f"Exception Type: {match_type.group(1)}")
    if match_value:
        print(f"Exception Value: {match_value.group(1)}")
        
    if not match_type and not match_value:
        print("Could not parse exception from HTML. Dumping first 500 chars:")
        # print(content[:500])
        # Try raw search for "Exception"
        idx = content.find("Exception Value")
        if idx != -1:
            print(f"Around 'Exception Value': {content[idx:idx+200]}")

except Exception as e:
    print(f"Error parsing log: {e}")
