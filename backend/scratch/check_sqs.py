import dotenv
import boto3
import os

dotenv.load_dotenv()

sqs = boto3.client('sqs', region_name='ap-south-1')
urls = [
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-assembly-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-assembly-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-dlq', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-export-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-export-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-extraction-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-finalize-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-finalize-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ingestion-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ingestion-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-materialize-queue', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-materialize-queue-local', 
    'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-poison-queue'
]
for url in urls:
    try:
        a = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'])['Attributes']
        print(f"{url.split('/')[-1]}: visible={a['ApproximateNumberOfMessages']}, invisible={a['ApproximateNumberOfMessagesNotVisible']}")
    except Exception as e:
        print(f"{url.split('/')[-1]}: error={e}")
