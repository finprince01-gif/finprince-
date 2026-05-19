import os
import django
import sys
import uuid
import time

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service

def forensic_upload():
    print("[PHASE 11.9] Forensic Pipeline Upload")
    
    correlation_id = f"forensic_{int(time.time())}"
    session_id = str(uuid.uuid4())
    
    # 1. Create a real staging record so the worker doesn't fail lookup
    from ocr_pipeline.models import InvoiceTempOCR
    record = InvoiceTempOCR.objects.create(
        tenant_id="system",
        upload_session_id=session_id,
        file_path="test/forensic_invoice_3pages.pdf",
        status='PENDING',
        voucher_type="PURCHASE"
    )
    print(f"[RECORD_CREATED] id={record.id}")

    # Canonical Message (Phase 11.5)
    from vouchers.message_factory import message_factory
    ingestion_msg = message_factory.create_message(
        task_type="INGESTION",
        tenant_id="system",
        session_id=session_id,
        correlation_id=correlation_id,
        payload={
            "record_id": record.id,
            "file_path": "test/forensic_invoice_3pages.pdf",
            "voucher_type": "PURCHASE"
        }
    )
    
    print(f"[QUEUE_PUSH_ATTEMPT] queue=ingestion corr={correlation_id}")
    pushed = queue_service.push(ingestion_msg, queue_type='ingestion')
    
    if pushed:
        print(f"[QUEUE_PUSH_SUCCESS] id={ingestion_msg['id']}")
        
        # Monitor for 60s
        print("Monitoring pipeline flow for 60s...")
        time.sleep(60)
    else:
        print("[QUEUE_PUSH_FAILED]")

if __name__ == "__main__":
    forensic_upload()
