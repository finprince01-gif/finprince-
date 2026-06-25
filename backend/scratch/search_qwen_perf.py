import os

log_path = r"logs/debug.log"

print("=== SCANNING FOR QWEN INFERENCE PERFORMANCE LOGS ===")
matches = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "QWEN_INFERENCE_PERF" in line or "QWEN_GPU_STATUS" in line or "GPU_GUARD_ABORT" in line:
            matches.append(line.strip())
            
print(f"Found {len(matches)} matches.")
print("\nMatches:")
for m in matches[-30:]:
    print(m)
