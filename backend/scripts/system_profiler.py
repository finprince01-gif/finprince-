import psutil
import time
import os
import redis
import json
import csv
from django.db import connections
from django.conf import settings
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_redis_info():
    try:
        r = redis.from_url(os.getenv('REDIS_STATE_URL', 'redis://localhost:6379/0'))
        info = r.info()
        return {
            'redis_used_memory': info.get('used_memory_human'),
            'redis_connected_clients': info.get('connected_clients'),
            'redis_instantaneous_ops_per_sec': info.get('instantaneous_ops_per_sec')
        }
    except:
        return {}

def get_db_info():
    try:
        # This is basic, might need a more specific query for connection counts if using ProxySQL
        return {
            'db_connections': len(connections.all())
        }
    except:
        return {}

def profile_system(duration_sec=300, interval=5, output_file="metrics_log.csv"):
    print(f"--- STARTING SYSTEM PROFILER: Duration={duration_sec}s, Interval={interval}s ---")
    
    fieldnames = [
        'timestamp', 'cpu_percent', 'ram_percent', 'ram_used_gb',
        'redis_used_memory', 'redis_connected_clients', 'db_connections',
        'worker_process_count'
    ]
    
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        start_time = time.time()
        while time.time() - start_time < duration_sec:
            cpu = psutil.cpu_percent()
            ram = psutil.virtual_memory()
            
            # Count worker processes (assuming they have 'worker' in the command line)
            worker_count = 0
            for proc in psutil.process_iter(['cmdline']):
                try:
                    if proc.info['cmdline'] and any('worker' in arg for arg in proc.info['cmdline']):
                        worker_count += 1
                except:
                    pass
            
            redis_info = get_redis_info()
            db_info = get_db_info()
            
            row = {
                'timestamp': time.time(),
                'cpu_percent': cpu,
                'ram_percent': ram.percent,
                'ram_used_gb': ram.used / (1024**3),
                'worker_process_count': worker_count,
                **redis_info,
                **db_info
            }
            
            writer.writerow(row)
            csvfile.flush()
            print(f"Snapshot at {time.strftime('%H:%M:%S')}: CPU={cpu}%, RAM={ram.percent}%, Workers={worker_count}")
            time.sleep(interval)

if __name__ == "__main__":
    profile_system()
