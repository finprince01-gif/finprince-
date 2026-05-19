import os
import django
import sys

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service

def validate_all_queues():
    print("[PHASE 11.8] Infrastructure Synchronization - Connectivity Validation")
    roles = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
    
    for role in roles:
        print(f"\n[QUEUE_HEALTHCHECK] role={role}")
        try:
            # 1. Enqueue Test
            test_msg = {"test": "Phase 11.8 Healthcheck", "role": role}
            pushed = queue_service.push(test_msg, queue_type=role)
            if pushed:
                print(f"[PUSH_SUCCESS] role={role}")
            else:
                print(f"[PUSH_FAILED] role={role}")
                continue

            # 2. Receive & Delete Test
            # Wait a bit for SQS consistency (usually immediate for single messages)
            import time
            time.sleep(1)
            
            messages = queue_service.receive(queue_type=role, max_messages=1, wait_time=1)
            if messages:
                print(f"[RECEIVE_SUCCESS] role={role} count={len(messages)}")
                handle = messages[0].get('_sqs_handle')
                if handle:
                    deleted = queue_service.delete(handle, queue_type=role)
                    if deleted:
                        print(f"[DELETE_SUCCESS] role={role}")
                        print(f"[QUEUE_ROUNDTRIP_SUCCESS] role={role}")
                    else:
                        print(f"[DELETE_FAILED] role={role}")
            else:
                print(f"[RECEIVE_FAILED] role={role} (Empty or timeout)")
                
        except Exception as e:
            print(f"[QUEUE_HEALTHCHECK_ERROR] role={role}: {e}")

if __name__ == "__main__":
    validate_all_queues()
