import psutil
import subprocess
import time
import sys
import os

def find_processes():
    targets = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info['cmdline']
            if not cmdline:
                continue
            cmdline_str = " ".join(cmdline).lower()
            if "start_cluster.py" in cmdline_str or "worker_watchdog.py" in cmdline_str or "unified_worker.py" in cmdline_str:
                # Make sure we don't kill ourselves
                if str(os.getpid()) not in cmdline_str:
                    targets.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return targets

def stop_cluster():
    print("Finding cluster processes...")
    procs = find_processes()
    if not procs:
        print("No running cluster processes found.")
        return []

    stopped_info = []
    print(f"Found {len(procs)} process(es) to stop.")
    for proc in procs:
        try:
            cmd = " ".join(proc.info['cmdline'])
            pid = proc.pid
            print(f"Terminating PID {pid}: {cmd}")
            proc.terminate()
            stopped_info.append({"pid": pid, "cmd": cmd})
        except Exception as e:
            print(f"Failed to terminate PID {proc.pid}: {e}")

    # Wait for them to exit
    gone, alive = psutil.wait_procs(procs, timeout=10)
    for proc in alive:
        try:
            print(f"Force-killing PID {proc.pid}")
            proc.kill()
        except Exception as e:
            print(f"Failed to kill PID {proc.pid}: {e}")

    print("Stale worker verification: checking for remaining processes...")
    remaining = find_processes()
    if remaining:
        print(f"WARNING: {len(remaining)} processes still exist!")
    else:
        print("Verification SUCCESS: No stale processes remain.")

    return stopped_info

def start_cluster():
    print("Starting cluster...")
    log_file = open("logs/cluster_restart.log", "w")
    # Launch in a new subprocess group or simply in the background
    proc = subprocess.Popen(
        [sys.executable, "start_cluster.py"],
        stdout=log_file,
        stderr=log_file,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
    )
    print(f"Cluster started with parent PID: {proc.pid}")
    # Give it a few seconds to start up and log dependencies validation
    time.sleep(10)
    log_file.close()

    # Read logs
    with open("logs/cluster_restart.log", "r") as f:
        logs = f.read()

    return proc.pid, logs

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "stop":
        stop_cluster()
    elif len(sys.argv) > 1 and sys.argv[1] == "start":
        start_cluster()
    else:
        stopped = stop_cluster()
        pid, logs = start_cluster()
        print("\n=== CLUSTER RESTART LOGS ===")
        print(logs)
        print("============================\n")
