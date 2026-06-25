import os
import sys
import django
import redis
import boto3

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
from ocr_pipeline.models import AICache, InvoicePageResult

def clear_redis():
    print("Flushing Redis...")
    try:
        r = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=int(os.getenv('REDIS_PORT', 6379)), db=0)
        r.flushall()
        print("Redis flushed successfully.")
    except Exception as e:
        print(f"Error flushing Redis: {e}")

def clear_db_caches():
    print("Clearing Django database caches...")
    try:
        # AICache
        count_ai = AICache.objects.all().delete()
        print(f"Deleted AICache records: {count_ai}")

        # InvoicePageResult
        count_page = InvoicePageResult.objects.all().delete()
        print(f"Deleted InvoicePageResult records: {count_page}")
        
        # Raw tables like ocr_response_cache if they exist
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            tables = [row[0] for row in cursor.fetchall()]
            for table in ['ocr_response_cache', 'ocr_response', 'ocr_page_cache']:
                if table in tables:
                    cursor.execute(f"TRUNCATE TABLE {table}")
                    print(f"Truncated raw database table: {table}")
    except Exception as e:
        print(f"Error clearing database caches: {e}")

def clear_sqs():
    print("Purging SQS local queues...")
    sqs = boto3.client(
        'sqs',
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION', 'ap-south-1')
    )
    
    queues = [
        "invoice-ingestion-queue-local",
        "invoice-ai-queue-local",
        "invoice-assembly-queue-local",
        "invoice-finalize-queue-local",
        "invoice-export-queue-local",
        "invoice-materialize-queue-local",
        "invoice-dlq-local",
        "invoice-poison-queue-local"
    ]
    
    for queue_name in queues:
        queue_url = f"https://sqs.{os.getenv('AWS_REGION', 'ap-south-1')}.amazonaws.com/620468690151/{queue_name}"
        print(f"Clearing queue {queue_name} ({queue_url})...")
        try:
            deleted_count = 0
            while True:
                resp = sqs.receive_message(
                    QueueUrl=queue_url,
                    MaxNumberOfMessages=10,
                    WaitTimeSeconds=1,
                    VisibilityTimeout=10
                )
                messages = resp.get('Messages', [])
                if not messages:
                    break
                    
                entries = []
                for idx, msg in enumerate(messages):
                    entries.append({
                        'Id': str(idx),
                        'ReceiptHandle': msg['ReceiptHandle']
                    })
                
                sqs.delete_message_batch(QueueUrl=queue_url, Entries=entries)
                deleted_count += len(messages)
            
            print(f"Cleared {deleted_count} messages from {queue_name}.")
        except Exception as e:
            try:
                sqs.purge_queue(QueueUrl=queue_url)
                print(f"Purged {queue_name} via SQS PurgeQueue.")
            except Exception as ex:
                print(f"Error clearing {queue_name}: {ex} (orig: {e})")

if __name__ == "__main__":
    clear_redis()
    clear_db_caches()
    clear_sqs()
    print("Environment cleanup complete.")
