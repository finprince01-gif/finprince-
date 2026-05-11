import os
import psutil
import random
import time
import signal
import subprocess

def get_worker_pids():
    pids = []
    for proc in psutil.process_iter(['pid', 'cmdline']):
        try:
            if proc.info['cmdline'] and any('worker' in arg for arg in proc.info['cmdline']):
                pids.append(proc.info['pid'])
        except:
            pass
    return pids

def kill_random_worker():
    pids = get_worker_pids()
    if not pids:
        print("No workers found to kill.")
        return
        
    pid = random.choice(pids)
    print(f"[CHAOS] Killing worker PID {pid}...")
    try:
        os.kill(pid, signal.SIGKILL)
        print(f"[CHAOS] Worker {pid} killed.")
    except Exception as e:
        print(f"[CHAOS] Failed to kill {pid}: {e}")

def run_chaos(duration_sec=300, interval_range=(30, 60)):
    print(f"--- CHAOS TEST STARTED: Duration={duration_sec}s ---")
    start_time = time.time()
    
    while time.time() - start_time < duration_sec:
        wait = random.uniform(*interval_range)
        print(f"[CHAOS] Next strike in {wait:.1f}s...")
        time.sleep(wait)
        kill_random_worker()
        
    print("--- CHAOS TEST COMPLETE ---")

if __name__ == "__main__":
    run_chaos()
