"""
Pipeline Launcher
==================
Single script to start all Kafka pipeline services concurrently.
Each service runs in its own asyncio task (can also be split into separate processes).

Usage:
  python start_pipeline.py                  # all services
  python start_pipeline.py --service ocr    # just OCR
  python start_pipeline.py --service ai     # just AI workers
  python start_pipeline.py --service merge  # just merge
  python start_pipeline.py --service retry  # just retry/DLQ
"""
import os
import sys
import asyncio
import logging
import argparse
import django

# Bootstrap Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s - %(message)s',
)
logger = logging.getLogger('pipeline')


SERVICE_MAP = {
    'ocr':   'vouchers.pipeline.ocr_service',
    'ai':    'vouchers.pipeline.ai_worker',
    'merge': 'vouchers.pipeline.merge_service',
    'retry': 'vouchers.pipeline.retry_service',
}


async def run_all():
    """Run all pipeline stages concurrently in one process."""
    from vouchers.pipeline import ocr_service, ai_worker, merge_service, retry_service

    logger.info("=" * 60)
    logger.info("🚀 FINPIXE INVOICE PIPELINE – STARTING ALL SERVICES")
    logger.info("=" * 60)

    await asyncio.gather(
        ocr_service.run(),
        ai_worker.run(),
        merge_service.run(),
        retry_service.run(),
    )


async def run_single(service: str):
    import importlib
    module_path = SERVICE_MAP.get(service)
    if not module_path:
        raise ValueError(f"Unknown service: {service}. Choices: {list(SERVICE_MAP.keys())}")
    module = importlib.import_module(module_path)
    logger.info(f"🚀 Starting {service} service")
    await module.run()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Finpixe Invoice Kafka Pipeline')
    parser.add_argument('--service', choices=list(SERVICE_MAP.keys()), default=None,
                        help='Specific service to start (default: all)')
    args = parser.parse_args()

    if args.service:
        asyncio.run(run_single(args.service))
    else:
        asyncio.run(run_all())
