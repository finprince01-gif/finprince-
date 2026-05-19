import os
import django
import sys
import boto3
from dotenv import load_dotenv

load_dotenv()

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service

def trace_consumption():
    print("[PHASE 11.9] Forensic Consumption Trace")
    roles = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
    
    sqs = boto3.client(
        'sqs',
        region_name=os.getenv('AWS_REGION', 'ap-south-1'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
    )

    for role in roles:
        print(f"\n--- Trace: {role} ---")
        url = queue_service._get_queue_url(role)
        if not url:
            print(f"[QUEUE_URL_MISSING] Role: {role}")
            continue
        
        print(f"URL: {url}")
        
        # 1. Check Attributes
        try:
            attrs = sqs.get_queue_attributes(
                QueueUrl=url,
                AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
            )
            visible = attrs['Attributes']['ApproximateNumberOfMessages']
            invisible = attrs['Attributes']['ApproximateNumberOfMessagesNotVisible']
            print(f"[QUEUE_STATE] visible={visible} invisible={invisible}")
        except Exception as e:
            print(f"[ATTR_FETCH_FAILED] {e}")

        # 2. Check for "Phantom" Consumers
        # (Messages invisible but no worker reporting active tasks)
        if int(invisible) > 0:
            print(f"[PHANTOM_CONSUMER_SUSPECTED] {invisible} messages are invisible.")

if __name__ == "__main__":
    trace_consumption()
