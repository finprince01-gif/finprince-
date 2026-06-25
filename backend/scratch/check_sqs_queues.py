import os
import boto3
from dotenv import load_dotenv

load_dotenv()

sqs = boto3.client(
    'sqs',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION', 'ap-south-1')
)

print("Listing all SQS queues...")
try:
    resp = sqs.list_queues()
    queue_urls = resp.get('QueueUrls', [])
    print(f"Total queues found: {len(queue_urls)}")
    for url in queue_urls:
        # Get queue attributes
        attrs = sqs.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=[
                'ApproximateNumberOfMessages',
                'ApproximateNumberOfMessagesNotVisible',
                'ApproximateNumberOfMessagesDelayed',
                'RedrivePolicy',
                'QueueArn'
            ]
        )
        attribs = attrs.get('Attributes', {})
        print(f"\nQueue: {url.split('/')[-1]}")
        print(f"  URL: {url}")
        print(f"  ARN: {attribs.get('QueueArn')}")
        print(f"  Visible messages: {attribs.get('ApproximateNumberOfMessages')}")
        print(f"  Invisible messages: {attribs.get('ApproximateNumberOfMessagesNotVisible')}")
        print(f"  Delayed messages: {attribs.get('ApproximateNumberOfMessagesDelayed')}")
        print(f"  Redrive Policy: {attribs.get('RedrivePolicy', 'None')}")
except Exception as e:
    print(f"Error querying SQS: {e}")
