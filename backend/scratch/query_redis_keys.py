import redis
import os
import sys

redis_db = int(os.getenv('REDIS_DB', '0'))
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

rec_id = "1007711"
print("=== REDIS STATE ===")
print("All keys matching assembly:*:")
for key in r.scan_iter("assembly:*"):
    print(f"Key: {key}")
    ktype = r.type(key)
    if ktype == "zset":
        print(f"  Zset: {r.zrange(key, 0, -1, withscores=True)}")
    elif ktype == "hash":
        print(f"  Hash: {r.hgetall(key)}")
    elif ktype == "set":
        print(f"  Set: {r.smembers(key)}")
    elif ktype == "string":
        print(f"  String: {r.get(key)}")

print("\nAll keys matching lock:*:")
for key in r.scan_iter("lock:*"):
    print(f"Key: {key} -> {r.get(key)} (TTL={r.ttl(key)}s)")

print("\nGlobal Concurrency Global:")
print(f"  Global Key Zset: {r.zrange('ai_concurrency:global', 0, -1, withscores=True)}")
