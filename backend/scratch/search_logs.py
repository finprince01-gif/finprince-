import os
debug_log_path = 'c:/108/AI-accounting-0.03/backend/logs/debug.log'
error_log_path = 'c:/108/AI-accounting-0.03/backend/logs/error.log'

def search_log(path, target):
    if not os.path.exists(path):
        print(f"Log not found: {path}")
        return
    print(f"\n=== Searching {path} for '{target}' ===")
    matches = []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if target in line:
                matches.append(line.strip())
    print(f"Found {len(matches)} matches. Showing last 30:")
    for m in matches[-30:]:
        print(m)

search_log(debug_log_path, '1005143')
search_log(error_log_path, '1005143')
