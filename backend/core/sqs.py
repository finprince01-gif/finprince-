import boto3
import json
import os
import logging

logger = logging.getLogger(__name__)

class QueueService:
    def __init__(self):
        self.sqs = boto3.client(
            'sqs',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        self.queue_url = os.getenv('SQS_QUEUE_URL')

    def push(self, message):
        """Pushes a message to SQS."""
        try:
            self.sqs.send_message(
                QueueUrl=self.queue_url,
                MessageBody=json.dumps(message)
            )
        except Exception as e:
            logger.error(f"SQS Push Failed: {str(e)}")
            raise

    def receive(self, max_messages=1, wait_time=20):
        """Receives messages from SQS (Long Polling)."""
        try:
            response = self.sqs.receive_message(
                QueueUrl=self.queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=wait_time,
                AttributeNames=['All']
            )
            return response.get('Messages', [])
        except Exception as e:
            logger.error(f"SQS Receive Failed: {str(e)}")
            return []

    def delete(self, receipt_handle):
        """Deletes a message from SQS after successful processing."""
        try:
            self.sqs.delete_message(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle
            )
        except Exception as e:
            logger.error(f"SQS Delete Failed: {str(e)}")

    def change_visibility(self, receipt_handle, timeout=60):
        """Extends the visibility timeout of a message."""
        try:
            self.sqs.change_message_visibility(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=timeout
            )
        except Exception as e:
            logger.error(f"SQS Visibility Extension Failed: {str(e)}")
