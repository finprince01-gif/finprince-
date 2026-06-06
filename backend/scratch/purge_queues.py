import os
import sys
import django
import boto3

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service

def main():
    print("Purging all local SQS queues...")
    sqs = queue_service._get_sqs_client()
    if not sqs:
        print("Error: SQS client is not initialized.")
        return

    roles = ['ingestion', 'ai', 'assembly', 'finalize', 'export', 'materialization']
    for role in roles:
        url = queue_service._get_queue_url(role)
        if url:
            try:
                print(f"Purging queue {role} (url: {url})...")
                sqs.purge_queue(QueueUrl=url)
                print(f"Purged {role} successfully.")
            except Exception as e:
                print(f"Could not purge {role}: {e}")
                
    # Also purge DLQ and poison queues if we can resolve them
    # SQS_DLQ_QUEUE_URL and SQS_POISON_QUEUE_URL
    for env_var in ['SQS_DLQ_QUEUE_URL', 'SQS_POISON_QUEUE_URL']:
        base_url = os.getenv(env_var)
        if base_url:
            current_env = os.getenv('CLUSTER_ENV', 'UNSET')
            url = base_url
            if current_env == 'local' and not base_url.endswith('-local'):
                url = base_url + '-local'
            try:
                print(f"Purging {env_var} (url: {url})...")
                sqs.purge_queue(QueueUrl=url)
                print(f"Purged {env_var} successfully.")
            except Exception as e:
                print(f"Could not purge {env_var}: {e}")

if __name__ == "__main__":
    main()
