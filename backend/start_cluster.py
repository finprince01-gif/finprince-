import subprocess
import sys
import time
import os
import logging
from typing import Dict

# 1. SETUP CLUSTER LOGGING
if not os.path.exists('logs'):
    os.makedirs('logs')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [CLUSTER] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('logs/cluster.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("ClusterBootstrap")

# 2. DEPENDENCY VALIDATION
def validate_dependencies():
    logger.info("[CLUSTER_PRECHECK_START] Validating infrastructure...")
    
    # Set up Django environment first
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)

    # A. Redis
    try:
        import redis
        redis_url = f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/0"
        r = redis.Redis.from_url(redis_url)
        r.ping()
        logger.info("[DEPENDENCY_VALID] Redis is UP.")
    except Exception as e:
        logger.error(f"[DEPENDENCY_FAILED] Redis connectivity check failed: {e}")
        return False

    # B. MySQL (Django DB)
    try:
        import django
        from django.db import connections
        django.setup()
        connections['default'].ensure_connection()
        logger.info("[DEPENDENCY_VALID] Database is UP.")
    except Exception as e:
        logger.error(f"[DEPENDENCY_FAILED] Database connectivity check failed: {e}")
        return False

    # C. SQS (Role-Specific Queues)
    try:
        from core.sqs import queue_service
        roles = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
        for role in roles:
            # [PHASE 11.8] Ensure every role has a unique URL and is reachable
            url = queue_service._get_queue_url(role)
            if not url:
                logger.error(f"[QUEUE_URL_MISSING] Role '{role}' has no physical URL mapping.")
                return False
            
            # Health check: Get depth (proves reachability and permissions)
            depth = queue_service.get_queue_depth(role)
            logger.info(f"[QUEUE_URL_VERIFIED] role={role} depth={depth} url={url}")
        
        logger.info("[DEPENDENCY_VALID] SQS Role-Topology is verified.")
    except Exception as e:
        logger.error(f"[DEPENDENCY_FAILED] SQS topology verification failed: {e}")
        return False

    logger.info("[CLUSTER_PRECHECK_SUCCESS] All dependencies satisfied.")
    return True

# 3. WORKER ORCHESTRATION
WORKER_ROLES = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
processes: Dict[str, subprocess.Popen] = {}

def start_worker(role: str):
    # We use worker_watchdog.py to manage the individual worker lifecycle
    cmd = [sys.executable, "worker_watchdog.py", role]
    logger.info(f"[WORKER_PROCESS_STARTED] role={role} pid=PENDING")
    # We use separate log files via UnifiedWorker, but cluster log tracks the watchdog
    proc = subprocess.Popen(cmd)
    processes[role] = proc
    logger.info(f"[WORKER_PROCESS_READY] role={role} pid={proc.pid}")
    return proc

def monitor_cluster():
    logger.info("[CLUSTER_READY] All workers spawned. Monitoring...")
    while True:
        for role, proc in list(processes.items()):
            if proc.poll() is not None:
                logger.warning(f"[WORKER_CRASH_DETECTED] Watchdog for {role} exited (code {proc.returncode}). Restarting...")
                start_worker(role)
        time.sleep(5)

if __name__ == "__main__":
    logger.info("=========================================================")
    logger.info("PHASE 11.7 — TRANSITIONAL TOPOLOGY HARDENING")
    logger.info("=========================================================")
    
    is_autoreload = (
        os.environ.get('RUN_MAIN') == 'true' or
        os.environ.get('AUTORELOAD_ACTIVE') == 'true' or
        (any('runserver' in str(arg).lower() for arg in sys.argv) and not any('--noreload' in str(arg).lower() for arg in sys.argv))
    )
    if is_autoreload:
        logger.warning("[AUTORELOAD_BLOCKED] Cluster cannot be started under Django dev autoreload / StatReloader. Please start the cluster independently or runserver with --noreload.")
        print("[AUTORELOAD_BLOCKED] Cluster cannot be started under Django dev autoreload / StatReloader. Please start the cluster independently or runserver with --noreload.")
        sys.exit(1)
    
    if not validate_dependencies():
        logger.critical("[CLUSTER_ABORTED] Infrastructure synchronization failed. Aborting cluster startup.")
        sys.exit(1)

    # [PHASE 11.8] Atomic Cluster Startup
    logger.info("[CLUSTER_ATOMIC_START] Spawning worker fleet...")
    # Ordered Startup (Step 11)
    # ingestion -> ai -> assembly -> finalize -> export
    try:
        for role in WORKER_ROLES:
            start_worker(role)
            time.sleep(1) # Stagger to prevent DB/SQS connection bursts
            
        monitor_cluster()
    except KeyboardInterrupt:
        logger.info("[CLUSTER_SHUTDOWN] Received interrupt. Stopping all workers...")
        for role, proc in processes.items():
            logger.info(f"[WORKER_TERMINATED] role={role} pid={proc.pid}")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        logger.info("[CLUSTER_SHUTDOWN] Cluster stopped safely.")
