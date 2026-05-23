import subprocess
import sys
import time
import os
import logging
import traceback

# [PHASE 11.8: WATCHDOG HARDENING]
# Implements exponential backoff to prevent log-flooding crash loops.

role = sys.argv[1]
cmd = [sys.executable, "vouchers/unified_worker.py", "--role", role]

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [WATCHDOG] %(levelname)s: %(message)s'
)
logger = logging.getLogger(f"Watchdog_{role}")

retry_count = 0
MAX_BACKOFF = 300 # 5 minutes

logger.info(f"Starting Watchdog for {role} role...")

while True:
    try:
        start_time = time.time()
        process = subprocess.Popen(cmd)
        process.wait()
        
        duration = time.time() - start_time
        exit_code = process.returncode
        
        # Workers must NEVER naturally exit! ANY exit is an unexpected worker exit.
        retry_count += 1
        backoff = min(MAX_BACKOFF, 2 ** retry_count)
        
        logger.critical(f"[UNEXPECTED_WORKER_EXIT] role={role} exit_code={exit_code} duration={duration:.2f}s")
        logger.info(f"[WORKER_RESTART_TRIGGERED] role={role} retry={retry_count} next_attempt_in={backoff}s")
        
        time.sleep(backoff)
            
    except KeyboardInterrupt:
        logger.info(f"[WATCHDOG_STOP] role={role} - Received interrupt. Terminating worker.")
        if 'process' in locals() and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        break
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"[WORKER_FATAL_EXCEPTION] role={role} error={e}\ntraceback={tb}")
        time.sleep(5)
