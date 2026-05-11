import boto3
import os
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        self.bucket = os.getenv('AWS_STORAGE_BUCKET_NAME')
        self.region = os.getenv('AWS_REGION', 'us-east-1')
        
        if not self.bucket:
            logger.warning("AWS_STORAGE_BUCKET_NAME not set. Using local storage.")
            self.s3 = None
            self.local_root = os.path.join(settings.MEDIA_ROOT, 'ocr_storage')
            if not os.path.exists(self.local_root):
                os.makedirs(self.local_root, exist_ok=True)
        else:
            try:
                self.s3 = boto3.client(
                    's3',
                    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                    region_name=self.region
                )
            except Exception as e:
                logger.error(f"Failed to initialize S3 client: {e}")
                self.s3 = None

    def upload_file(self, file_bytes, key, content_type='application/pdf'):
        """Uploads bytes to storage (S3 or local) and returns the URL/path."""
        if self.s3 and self.bucket:
            try:
                self.s3.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=file_bytes,
                    ContentType=content_type
                )
                return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
            except Exception as e:
                logger.error(f"S3 Upload Failed: {str(e)}")
                raise
        else:
            # Local fallback
            local_path = os.path.join(self.local_root, key.replace('/', os.sep))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, 'wb') as f:
                f.write(file_bytes)
            # Return a relative path or a local media URL
            return f"/media/ocr_storage/{key}"

    def get_file(self, key):
        """Fetches bytes from storage."""
        if self.s3 and self.bucket:
            try:
                response = self.s3.get_object(Bucket=self.bucket, Key=key)
                return response['Body'].read()
            except Exception as e:
                logger.error(f"S3 Download Failed: {str(e)}")
                raise
        else:
            local_path = os.path.join(self.local_root, key.replace('/', os.sep))
            with open(local_path, 'rb') as f:
                return f.read()
