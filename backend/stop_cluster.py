import os
import signal
import psutil
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [SHUTDOWN] %(levelname)s: %(message)s'
)
logger = logging.getLogger("ClusterShutdown")

def stop_cluster():
    logger.info("Scanning for active OCR Cluster processes...")
    
    current_pid = os.getpid()
    
    # We look for processes running 'worker_watchdog.py' or 'unified_worker.py' or 'start_cluster.py'
    patterns = ['worker_watchdog.py', 'unified_worker.py', 'start_cluster.py']
    
    terminated_count = 0
    
    for proc in psutil.process_iter(['pid', 'cmdline']):
        try:
            cmdline = proc.info.get('cmdline')
            if not cmdline:
                continue
                
            cmd_str = ' '.join(cmdline)
            if any(p in cmd_str for p in patterns) and proc.info['pid'] != current_pid:
                logger.info(f"[WORKER_TERMINATED] Terminating PID={proc.info['pid']} cmd={cmd_str[:50]}...")
                proc.terminate()
                terminated_count += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if terminated_count > 0:
        logger.info(f"Successfully sent termination signals to {terminated_count} processes.")
        logger.info("[CLUSTER_SHUTDOWN] Cleanup complete.")
    else:
        logger.warning("No active cluster processes found.")

if __name__ == "__main__":
    stop_cluster()
