import os
import sys

# Ensure backend is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.sqs import queue_service
from dotenv import load_dotenv

def test_lazy_load():
    print("[PHASE 11.9] Testing Lazy Load Resilience")
    
    # 1. Initial State (should be empty if .env not in shell)
    mapping_initial = queue_service._get_queue_mapping()
    print(f"Initial Mapping (should be empty): {mapping_initial}")
    
    # 2. Load Environment
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    print(f"Loading .env from: {dotenv_path}")
    load_dotenv(dotenv_path, override=True)
    
    # 3. Access again (should be populated because it's lazy)
    # We need to clear the internal cache for this test to prove it works in a fresh process
    # But in a real app, it would be None initially.
    # To simulate the race, I'll manually reset it for the test.
    queue_service._queue_mapping = None 
    
    mapping_final = queue_service._get_queue_mapping()
    print(f"Final Mapping (should be populated): {mapping_final}")
    
    if mapping_final.get('ingestion'):
        print("[SUCCESS] Lazy loading resolved the environment variables.")
    else:
        print("[FAILED] Lazy loading did not resolve variables.")

if __name__ == "__main__":
    test_lazy_load()
