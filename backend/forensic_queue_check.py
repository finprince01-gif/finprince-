"""
[FORENSIC] Phase 6 — Direct AWS Queue Validation Script
Run on EC2 AFTER an upload to inspect whether the message actually landed in SQS.

Usage:
  python forensic_queue_check.py
"""
import os
import sys
import json
import django

# Django setup
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import boto3

# ── Load env ─────────────────────────────────────────────────────────────────
ingestion_url = os.getenv('SQS_INGESTION_QUEUE_URL')
region        = os.getenv('AWS_REGION', 'ap-south-1')
key_id        = os.getenv('AWS_ACCESS_KEY_ID')
secret        = os.getenv('AWS_SECRET_ACCESS_KEY')

print("=" * 60)
print("FORENSIC QUEUE CHECK — Phase 6")
print("=" * 60)
print(f"  Ingestion URL : {ingestion_url}")
print(f"  AWS Region    : {region}")
print(f"  Key ID        : {key_id[:8] if key_id else 'MISSING'}...")
print()

if not ingestion_url or not key_id:
    print("CRITICAL: Missing env vars. Run: source .env before this script.")
    sys.exit(1)

sqs = boto3.client(
    'sqs',
    aws_access_key_id=key_id,
    aws_secret_access_key=secret,
    region_name=region,
)

# ── Queue depth ───────────────────────────────────────────────────────────────
attrs = sqs.get_queue_attributes(
    QueueUrl=ingestion_url,
    AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'VisibilityTimeout']
)['Attributes']

visible   = attrs['ApproximateNumberOfMessages']
invisible = attrs['ApproximateNumberOfMessagesNotVisible']
vis_to    = attrs['VisibilityTimeout']

print(f"[QUEUE_DEPTH] visible={visible} invisible={invisible} visibility_timeout={vis_to}s")
print()

# ── Try to peek at messages (non-destructive) ─────────────────────────────────
resp = sqs.receive_message(
    QueueUrl=ingestion_url,
    MaxNumberOfMessages=1,
    WaitTimeSeconds=3,
    VisibilityTimeout=1,     # 1 second — message returns to queue almost immediately
    AttributeNames=['All'],
    MessageAttributeNames=['All'],
)

messages = resp.get('Messages', [])
if not messages:
    print("[QUEUE_EMPTY] No messages visible — message was either consumed, rejected, or never sent.")
    print()
    print("Diagnosis checklist:")
    print("  1. Was the upload view using the singleton queue_service? (Fixed in this deploy)")
    print("  2. Did message_parser reject due to missing session_id? (Fixed in this deploy)")
    print("  3. Did the worker consume and process the message already?")
    print("     → Check EC2 logs: journalctl -u gunicorn | grep INGESTION_TASK")
else:
    for msg in messages:
        print(f"[MESSAGE_FOUND] MessageId={msg['MessageId']}")
        try:
            body = json.loads(msg['Body'])
            print(f"  task_type    : {body.get('task_type')}")
            print(f"  session_id   : {body.get('session_id')}")
            print(f"  tenant_id    : {body.get('tenant_id')}")
            print(f"  payload.record_id: {body.get('payload', {}).get('record_id')}")
            print(f"  payload_version: {body.get('payload_version')}")
            print(f"  Full body    : {json.dumps(body, indent=2)}")
        except Exception as e:
            print(f"  [PARSE_ERROR] {e} raw={msg['Body'][:200]}")
        
        # Return message to queue (visibility=1s — it will return in 1 second)
        print(f"\n  [NOTE] Message will return to queue in ~1 second (visibility_timeout=1s was set).")

print()
print("=" * 60)
print("Verify workers are polling this exact URL:")
for role in ['ingestion', 'ai', 'assembly', 'finalize', 'export', 'materialization']:
    url = os.getenv(f'SQS_{role.upper()}_QUEUE_URL')
    print(f"  {role:18} → {url}")
print("=" * 60)
