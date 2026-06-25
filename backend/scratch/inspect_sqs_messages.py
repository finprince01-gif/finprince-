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

url = "https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue-local"

print(f"Polling messages from {url}...")
try:
    # Let's poll with a long wait time to see if anything shows up
    resp = sqs.receive_message(
        QueueUrl=url,
        AttributeNames=['All'],
        MessageAttributeNames=['All'],
        MaxNumberOfMessages=10,
        WaitTimeSeconds=5
    )
    messages = resp.get('Messages', [])
    print(f"Received {len(messages)} messages.")
    for msg in messages:
        print("Message ID:", msg.get('MessageId'))
        print("Receipt Handle:", msg.get('ReceiptHandle')[:50])
        print("Attributes:", msg.get('Attributes'))
        print("Body:", msg.get('Body')[:300])
except Exception as e:
    print(f"Error receiving messages: {e}")
