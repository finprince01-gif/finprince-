"""
UnifiedWorker — Orchestration Dispatcher
=========================================
This script acts as the entry point for the specialized OCR workers.
It dispatches execution to role-specific worker classes:
- IngestionWorker
- AIWorker
- AssemblyWorker
- FinalizeWorker

Usage:
  python unified_worker.py --role ingestion
  python unified_worker.py --role ai
  python unified_worker.py --role assembly
  python unified_worker.py --role finalize
"""
import os
import sys
import logging
import asyncio
import argparse

# 1. SETUP LOGGING
if not os.path.exists('logs'):
    os.makedirs('logs')

# 1.1 Parse Role for isolated logging
parser = argparse.ArgumentParser()
parser.add_argument('--role', required=True)
args, unknown = parser.parse_known_args()
role = args.role.lower()

# Use root logger to capture all module logs
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Clear existing handlers if any (to avoid duplicates on restart)
root_logger.handlers = []

sh = logging.StreamHandler(sys.stdout)
# Role-isolated log file
fh = logging.FileHandler(f'logs/{role}.log')
# Also keep a general worker log
fh_general = logging.FileHandler('logs/worker.log')

formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')
sh.setFormatter(formatter)
fh.setFormatter(formatter)
fh_general.setFormatter(formatter)

root_logger.addHandler(sh)
root_logger.addHandler(fh)
root_logger.addHandler(fh_general)

logger = logging.getLogger("UnifiedWorker")

# 2. INITIALIZE DJANGO
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, '..'))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
except Exception as e:
    logger.critical(f"Failed to initialize Django: {e}")
    sys.exit(1)

# 3. DISPATCHER LOGIC
def main():
    parser = argparse.ArgumentParser(description="OCR Pipeline Specialized Worker")
    parser.add_argument('--role', required=True, choices=['ingestion', 'ai', 'assembly', 'finalize', 'export'],
                        help="The specialized role this worker instance will perform.")
    args = parser.parse_args()

    # Dynamic Imports to avoid circular dependencies and heavy boot
    from vouchers.ingestion_worker import IngestionWorker
    from vouchers.ai_worker import AIWorker
    from vouchers.assembly_worker import AssemblyWorker
    from vouchers.finalize_worker import FinalizeWorker
    from vouchers.export_worker import ExportWorker

    role_map = {
        'ingestion': IngestionWorker,
        'ai': AIWorker,
        'assembly': AssemblyWorker,
        'finalize': FinalizeWorker,
        'export': ExportWorker
    }

    worker_class = role_map.get(args.role)
    if not worker_class:
        logger.error(f"[WORKER_INVALID_ROLE] {args.role}")
        return

    logger.info(f"[WORKER_BOOT] role={args.role}")
    logger.info(f"[WORKER_VERSION_ACTIVE] version='1.0.0-distributed' role='{args.role}'")
    logger.info(f"[PIPELINE_MODE] mode='distributed' backend='sqs' coordinator='redis'")
    logger.info(f"[QUEUE_BINDING_ACTIVE] role='{args.role}' queue='{args.role}' status='ACTIVE'")
    worker = worker_class()
    
    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info(f"[WORKER_STOP] role={args.role} - Received SIGINT")
    except Exception as e:
        logger.exception(f"[WORKER_CRASH] role={args.role} error={e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
