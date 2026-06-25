import os
import boto3
import redis
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

# Redis cleanup
def clear_redis():
    print("Flushing Redis...")
    r = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=int(os.getenv('REDIS_PORT', 6379)), db=0)
    try:
        r.flushall()
        print("Redis flushed successfully.")
    except Exception as e:
        print(f"Error flushing Redis: {e}")

# SQS cleanup
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
            # SQS purge has a limit of once every 60 seconds per queue.
            # To be safe and bypass this limit, we receive and delete messages in a loop.
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
            # Fallback to standard purge if loop fails
            try:
                sqs.purge_queue(QueueUrl=queue_url)
                print(f"Purged {queue_name} via SQS PurgeQueue.")
            except Exception as ex:
                print(f"Error clearing {queue_name}: {ex} (orig: {e})")

if __name__ == "__main__":
    clear_redis()
    clear_sqs()
