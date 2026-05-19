import boto3
import os
from dotenv import load_dotenv

load_dotenv()

def purge_queues():
    sqs = boto3.client('sqs', region_name='ap-south-1')
    
    queues = [
        'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ingestion-queue'
        # Add others if necessary
    ]
    
    for q_url in queues:
        print(f"Purging {q_url}...")
        try:
            sqs.purge_queue(QueueUrl=q_url)
            print("Done.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    purge_queues()
