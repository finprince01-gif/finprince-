import boto3
import json
import os
import logging

logger = logging.getLogger(__name__)

class QueueService:
    def __init__(self):
        self.backend = os.getenv('QUEUE_BACKEND', 'local')
        self.redis = None
        self.sqs = None
        self.queue_url = None

        if self.backend == 'redis':
            from core.redis_client import redis_client
            self.redis = redis_client
        else:
            try:
                self.sqs = boto3.client(
                    'sqs',
                    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                    region_name=os.getenv('AWS_REGION', 'us-east-1')
                )
                self.queue_url = os.getenv('SQS_QUEUE_URL')
            except Exception as e:
                logger.error(f"Failed to initialize SQS client: {e}")
                self.sqs = None

    def push(self, message):
        """Pushes a message to the queue (SQS or Redis)."""
        if self.backend == 'redis' and self.redis:
            # For Redis, we use the 'ocr_queue' as the default
            # We add a unique ID if not present
            if 'id' not in message:
                import uuid
                message['id'] = str(uuid.uuid4())
            return self.redis.enqueue("ocr_queue", message)
        
        if self.sqs and self.queue_url:
            try:
                self.sqs.send_message(
                    QueueUrl=self.queue_url,
                    MessageBody=json.dumps(message)
                )
            except Exception as e:
                logger.error(f"SQS Push Failed: {str(e)}")
                raise
        else:
            logger.error("No queue backend available for push")

    def receive(self, max_messages=1, wait_time=20):
        """Receives messages from the queue (SQS only for now)."""
        if self.backend == 'redis':
            # Redis workers usually use pop_reliable directly
            return []
            
        if self.sqs and self.queue_url:
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
        return []

    def delete(self, receipt_handle):
        """Deletes a message from SQS."""
        if self.sqs and self.queue_url:
            try:
                self.sqs.delete_message(
                    QueueUrl=self.queue_url,
                    ReceiptHandle=receipt_handle
                )
            except Exception as e:
                logger.error(f"SQS Delete Failed: {str(e)}")

    def change_visibility(self, receipt_handle, timeout=60):
        """Extends the visibility timeout of a message."""
        if not self.sqs:
            return
        try:
            self.sqs.change_message_visibility(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=timeout
            )
        except Exception as e:
            logger.error(f"SQS Visibility Extension Failed: {str(e)}")
