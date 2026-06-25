import os

log_path = r"logs/debug.log"
record_id = "1007709"

print(f"=== SEARCHING INFERENCE PERFORMANCE FOR RECORD {record_id} ===")
matches = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if record_id in line and ("QWEN_INFERENCE_PERF" in line or "QWEN_GPU_STATUS" in line or "GPU_GUARD_ABORT" in line):
            matches.append(line.strip())
            
print(f"Found {len(matches)} matches.")
print("\nMatches:")
for m in matches:
    print(m)
