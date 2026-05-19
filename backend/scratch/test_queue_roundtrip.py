import os
import django
import sys
import time
import uuid

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service

def test_roundtrip():
    print("[PHASE 11.9] Manual Round-Trip Validation")
    roles = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
    
    for role in roles:
        print(f"\n[ROUNDTRIP_START] role={role}")
        correlation_id = str(uuid.uuid4())
        
        from vouchers.message_factory import message_factory
        
        # [PHASE 11.9] Correct Task Type Mapping
        actual_task_type = role.upper()
        if actual_task_type == "AI":
            actual_task_type = "AI_EXTRACTION"
            
        test_msg = message_factory.create_message(
            task_type=actual_task_type,
            tenant_id="system",
            session_id="test_session",
            correlation_id=correlation_id,
            payload={"test": True}
        )
        
        # 1. PUSH
        print(f"[ROUNDTRIP_PUSH] role={role}")
        pushed = queue_service.push(test_msg, queue_type=role)
        if not pushed:
            print(f"[ROUNDTRIP_PUSH_FAILED] role={role}")
            continue
            
        # 2. INSPECT DEPTH
        time.sleep(1) # SQS Consistency
        depth = queue_service.get_queue_depth(role)
        print(f"[POST_ENQUEUE_DEPTH] role={role} depth={depth}")
        
        # 3. RECEIVE
        print(f"[ROUNDTRIP_RECEIVE] role={role}")
        messages = queue_service.receive(queue_type=role, max_messages=1, wait_time=2)
        if messages:
            print(f"[RECEIVE_SUCCESS] role={role} count={len(messages)}")
            msg = messages[0]
            print(f"Message ID: {msg.get('_sqs_message_id')}")
            
            # 4. DELETE
            handle = msg.get('_sqs_handle')
            if handle:
                print(f"[ROUNDTRIP_DELETE] role={role}")
                deleted = queue_service.delete(handle, queue_type=role)
                if deleted:
                    print(f"[ROUNDTRIP_COMPLETE] role={role}")
                else:
                    print(f"[DELETE_FAILED] role={role}")
        else:
            print(f"[ROUNDTRIP_RECEIVE_FAILED] role={role} - Message not found!")

if __name__ == "__main__":
    test_roundtrip()
