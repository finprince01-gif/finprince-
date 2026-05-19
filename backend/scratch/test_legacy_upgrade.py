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
from vouchers.message_parser import message_parser

def test_legacy_upgrade():
    print("[PHASE 11.9] Testing Legacy Message Upgrade & Recovery")
    
    # 1. Simulate a legacy 'AI' task (missing version, missing corr_id, old type)
    legacy_ai_msg = {
        "session_id": str(uuid.uuid4()),
        "tenant_id": "legacy_tenant",
        "task_type": "AI",
        "payload": {"legacy": True}
    }
    
    print("\n[TEST 1] Parsing Legacy AI Message...")
    is_valid, normalized, error = message_parser.parse(legacy_ai_msg)
    
    if is_valid:
        print(f"[SUCCESS] Normalized Type: {normalized['task_type']}")
        print(f"[SUCCESS] Assigned Version: {normalized['payload_version']}")
        print(f"[SUCCESS] Generated Corr ID: {normalized['correlation_id']}")
    else:
        print(f"[FAILED] Rejection Reason: {error}")

    # 2. Simulate a 'FINALIZATION' task
    legacy_final_msg = {
        "session_id": str(uuid.uuid4()),
        "tenant_id": "legacy_tenant",
        "task_type": "FINALIZATION",
        "payload": {"legacy": True}
    }
    
    print("\n[TEST 2] Parsing Legacy FINALIZATION Message...")
    is_valid, normalized, error = message_parser.parse(legacy_final_msg)
    
    if is_valid:
        print(f"[SUCCESS] Normalized Type: {normalized['task_type']}")
    else:
        print(f"[FAILED] Rejection Reason: {error}")

if __name__ == "__main__":
    test_legacy_upgrade()
