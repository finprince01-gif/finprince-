import os, sys, django, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Configure logging to stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger('ocr_pipeline')
logger.setLevel(logging.INFO)
logging.getLogger('pending_purchases').setLevel(logging.INFO)

from unittest.mock import patch

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.pipeline import validate_and_process

print("Checking record 1006912...")
try:
    rec = InvoiceTempOCR.objects.get(id=1006912)
    print(f"Record found! id={rec.id}, status={rec.status}, validation_status={rec.validation_status}")
    
    print("Running validate_and_process(rec, auto_save=False) with mocked redis locks...")
    with patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
         patch('ocr_pipeline.pipeline.release_redis_lock'):
        res = validate_and_process(rec, auto_save=False)
    print(f"Result: {res}")
except Exception as e:
    import traceback
    traceback.print_exc()
