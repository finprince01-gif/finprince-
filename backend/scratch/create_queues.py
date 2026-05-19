import boto3
import os
from dotenv import load_dotenv

load_dotenv()

def ensure_queues():
    print("[PHASE 11.8] Infrastructure Synchronization - Queue Creation")
    sqs = boto3.client(
        'sqs',
        region_name=os.getenv('AWS_REGION', 'ap-south-1'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
    )

    queues = [
        'invoice-ingestion-queue',
        'invoice-ai-queue',
        'invoice-assembly-queue',
        'invoice-finalize-queue',
        'invoice-export-queue',
        'invoice-dlq',
        'invoice-poison-queue'
    ]

    for q_name in queues:
        try:
            print(f"Checking queue: {q_name}...")
            # Try to get URL
            resp = sqs.get_queue_url(QueueName=q_name)
            print(f"[QUEUE_URL_VERIFIED] {q_name}: {resp['QueueUrl']}")
        except sqs.exceptions.QueueDoesNotExist:
            print(f"Queue {q_name} does not exist. Creating...")
            # Create it
            resp = sqs.create_queue(
                QueueName=q_name,
                Attributes={
                    'VisibilityTimeout': '300', # 5 minutes
                    'MessageRetentionPeriod': '86400' # 1 day
                }
            )
            print(f"[PHYSICAL_QUEUE_CREATED] {q_name}: {resp['QueueUrl']}")
        except Exception as e:
            print(f"[QUEUE_URL_INVALID] {q_name}: {e}")

if __name__ == "__main__":
    ensure_queues()
