import os
import json
path = 'scratch/audit_results.json'
if os.path.exists(path):
    with open(path, 'r') as f:
         data = json.load(f)
    print('Completed runs: {}'.format(len(data)))
    for r in data:
         print("Run {}: session={}, duration={:.1f}s, pages={}, grouped={}".format(
             r["run_number"], r["session_id"], r["duration_seconds"], len(r["pages"]), len(r["grouped_records"])
         ))
else:
    print('File does not exist yet.')
