
import os
import sys
import django
import logging
import time

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, InvoiceTempOCR, SessionFinalizationState
from vouchers.models import GeminiQuota

def audit_ai_amplification():
    print("=== AI AMPLIFICATION AUDIT ===")
    
    # 1. Check Gemini Quota stats
    quotas = GeminiQuota.objects.all()
    print("\nGemini Quotas:")
    for q in quotas:
        print(f"Tenant: {q.tenant_id} | Max Concurrent: {q.max_concurrent} | Active: {q.active_calls} | Tokens: {q.tokens:.2f}")

    # 2. Check Session Stats
    sessions = SessionFinalizationState.objects.all().order_by('-updated_at')[:10]
    print("\nRecent Sessions (last 10):")
    for s in sessions:
        print(f"Record: {s.id} | Expected: {s.expected_pages} | AI Completed: {s.ai_completed_pages} | Failed: {s.failed_pages}")

    # 3. Calculate Average Amplification
    completed_sessions = SessionFinalizationState.objects.filter(ai_completed_pages__gt=0)
    if completed_sessions.exists():
        total_expected = sum(s.expected_pages for s in completed_sessions)
        total_ai_done = sum(s.ai_completed_pages for s in completed_sessions)
        avg_amp = total_ai_done / completed_sessions.count() if completed_sessions.count() > 0 else 0
        print(f"\nAverage Pages per Session: {total_expected / completed_sessions.count():.2f}")
        print(f"Average AI Calls per Session: {total_ai_done / completed_sessions.count():.2f}")
        print(f"Ratio (AI Calls / Session): {avg_amp:.2f}")
    else:
        print("\nNo completed sessions found to calculate amplification.")

if __name__ == "__main__":
    audit_ai_amplification()
