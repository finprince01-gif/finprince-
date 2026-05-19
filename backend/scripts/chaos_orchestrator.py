import os
import django
import random
import time
import subprocess
import signal

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, PipelineStatus

class ChaosOrchestrator:
    """
    PHASE 6H: REAL FAILURE TESTING.
    Simulates outages and crashes to verify terminal state integrity.
    """
    
    def simulate_worker_crash(self):
        """Finds and kills a running worker process."""
        print("[CHAOS] Attempting to kill a worker process...")
        try:
            # On Windows, we look for processes running unified_worker.py
            output = subprocess.check_output('wmic process where "commandline like \'%unified_worker.py%\'" get ProcessId', shell=True).decode()
            pids = [p.strip() for p in output.split('\n') if p.strip() and p.strip().isdigit()]
            if pids:
                pid = random.choice(pids)
                print(f"[CHAOS] Killing worker PID: {pid}")
                os.kill(int(pid), signal.SIGTERM)
                return True
        except Exception as e:
            print(f"[CHAOS] Kill failed: {e}")
        return False

    def corrupt_inflight_status(self):
        """Simulates a DB race condition or partial failure by resetting a processing record."""
        print("[CHAOS] Inducing status corruption...")
        record = InvoiceTempOCR.objects.filter(status__in=['PROCESSING', 'EXTRACTING']).first()
        if record:
            print(f"[CHAOS] Corrupting record {record.id}: status -> QUEUED (Simulating processing loss)")
            record.status = 'QUEUED'
            record.save()
            return True
        return False

    def simulate_s3_timeout(self):
        """Injects a fake timeout by modifying the .env or monkeypatching (requires worker reload)."""
        # For simplicity in this script, we'll just log that we would do this
        print("[CHAOS] Injecting S3 Latency (Conceptual: Requires proxy middleware)")

    def run_chaos_loop(self, duration_sec=60):
        print(f"\n[CHAOS_MODE_START] Duration: {duration_sec}s")
        start = time.time()
        while time.time() - start < duration_sec:
            action = random.choice([
                self.simulate_worker_crash,
                self.corrupt_inflight_status
            ])
            action()
            time.sleep(random.uniform(5, 15))
        print("[CHAOS_MODE_STOP]")

if __name__ == "__main__":
    orchestrator = ChaosOrchestrator()
    orchestrator.run_chaos_loop(60)
