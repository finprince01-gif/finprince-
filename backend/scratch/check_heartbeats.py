import os
import sys
import time
import json

# Setup Django environment
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from core.redis_client import redis_client

def check():
    if not redis_client.available:
        print("Redis not available")
        return

    heartbeats = redis_client.get_client().hgetall("worker_heartbeats")
    print(f"Current Heartbeats: {heartbeats}")
    
    now = time.time()
    for worker, ts in heartbeats.items():
        age = now - float(ts)
        print(f"Worker: {worker}, Age: {age:.2f}s")

if __name__ == "__main__":
    check()
