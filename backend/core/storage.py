import boto3
import os
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        self.bucket = os.getenv('AWS_STORAGE_BUCKET_NAME')

    def upload_file(self, file_bytes, key, content_type='application/pdf'):
        """Uploads bytes to S3 and returns the URL."""
        try:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_bytes,
                ContentType=content_type
            )
            return f"https://{self.bucket}.s3.amazonaws.com/{key}"
        except Exception as e:
            logger.error(f"S3 Upload Failed: {str(e)}")
            raise

    def get_file(self, key):
        """Fetches bytes from S3."""
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=key)
            return response['Body'].read()
        except Exception as e:
            logger.error(f"S3 Download Failed: {str(e)}")
            raise
