import redis
import time

def check():
    try:
        client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        heartbeats = client.hgetall("worker_heartbeats")
        print(f"Current Heartbeats: {heartbeats}")
        
        now = time.time()
        for worker, ts in heartbeats.items():
            age = now - float(ts)
            print(f"Worker: {worker}, Age: {age:.2f}s")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()
