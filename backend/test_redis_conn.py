import redis
import sys

try:
    r = redis.from_url('redis://127.0.0.1:6379/0')
    r.ping()
    print("SUCCESS: Connected to Redis emulator")
except Exception as e:
    print(f"FAILED: {e}")
    sys.exit(1)
