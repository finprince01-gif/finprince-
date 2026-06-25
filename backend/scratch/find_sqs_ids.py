import re

log_path = r"C:\108\AI-accounting-0.03\backend\scratch\1007697_raw_logs.txt"

with open(log_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Let's search for lines containing SQS_PUSH, QUEUE_MESSAGE_RECEIVED, WORKER_MESSAGE_RECEIVED, ZOMBIE, Poison
events = []
for idx, line in enumerate(lines):
    if any(k in line for k in ["SQS_PUSH", "QUEUE_MESSAGE_RECEIVED", "WORKER_MESSAGE_RECEIVED", "ZOMBIE", "DLQ", "WINDOW_LEAK"]):
        events.append((idx, line.strip()))

print(f"Found {len(events)} SQS/DLQ events.")
for idx, line in events[:50]:
    print(f"[{idx}]: {line}")
