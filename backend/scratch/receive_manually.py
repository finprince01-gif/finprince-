import dotenv
import boto3
import json

dotenv.load_dotenv()

sqs = boto3.client('sqs', region_name='ap-south-1')
url = 'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue-local'

print("Polling queue manually...")
for i in range(5):
    res = sqs.receive_message(
        QueueUrl=url,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=2,
        VisibilityTimeout=10,
        AttributeNames=['All']
    )
    messages = res.get('Messages', [])
    print(f"Poll {i+1}: received {len(messages)} messages")
    for msg in messages:
        body = json.loads(msg['Body'])
        print(f"  Message ID: {msg['MessageId']}")
        print(f"  Task ID: {body.get('id')}")
        print(f"  Record ID: {body.get('record_id') or body.get('payload', {}).get('record_id')}")
        print(f"  Page Number: {body.get('page_number') or body.get('payload', {}).get('page_number')}")
        print(f"  Receive Count: {msg['Attributes'].get('ApproximateReceiveCount')}")
