import subprocess
import os
import sys

def main():
    print("Listing python processes...")
    try:
        out = subprocess.check_output('wmic process where "name=\'python.exe\'" get commandline,processid', shell=True)
        lines = out.decode('utf-8', errors='ignore').splitlines()
    except Exception as e:
        print(f"Error querying processes: {e}")
        return

    my_pid = os.getpid()
    print(f"Current python script PID: {my_pid}")

    for line in lines:
        line = line.strip()
        if not line or "ProcessId" in line:
            continue
        
        parts = line.split()
        if not parts:
            continue
            
        pid_str = parts[-1]
        if not pid_str.isdigit():
            continue
            
        pid = int(pid_str)
        if pid == my_pid:
            continue
            
        cmdline = " ".join(parts[:-1])
        if any(kw in cmdline for kw in ['start_cluster.py', 'worker_watchdog.py', 'unified_worker.py']):
            print(f"Killing PID {pid}: {cmdline}")
            try:
                subprocess.call(f"taskkill /F /PID {pid}", shell=True)
            except Exception as e:
                print(f"Failed to kill {pid}: {e}")

if __name__ == "__main__":
    main()
