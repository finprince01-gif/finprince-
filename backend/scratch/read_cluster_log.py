import os
log_path = "backend/logs/cluster.log"
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for _ in range(50):
            line = f.readline()
            if not line:
                break
            print(line.strip())
else:
    print("cluster.log not found.")
