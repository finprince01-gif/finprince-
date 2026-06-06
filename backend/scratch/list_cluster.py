import psutil
patterns = ['worker_watchdog.py', 'unified_worker.py', 'start_cluster.py']
found = False
for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
    try:
        cmdline = proc.info.get('cmdline')
        if not cmdline:
            continue
        cmd_str = ' '.join(cmdline)
        if any(p in cmd_str for p in patterns):
            print("PID={}, Name={}, Cmd={}".format(proc.info['pid'], proc.info['name'], cmd_str[:100]))
            found = True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        continue
if not found:
    print('No cluster processes found.')
