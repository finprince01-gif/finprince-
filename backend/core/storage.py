import boto3
import os
import logging
import uuid
from django.conf import settings

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        self.bucket = os.getenv('AWS_STORAGE_BUCKET_NAME')
        self.region = os.getenv('AWS_REGION', 'us-east-1')
        
        if not self.bucket:
            logger.warning("AWS_STORAGE_BUCKET_NAME not set. Using local storage.")
            self.s3 = None
            self.local_root = getattr(settings, 'OCR_STORAGE_ROOT', os.path.join(settings.MEDIA_ROOT, 'ocr_storage'))
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
            # Local fallback - Use settings for consistency
            local_path = os.path.normpath(os.path.join(self.local_root, key.replace('/', os.sep)))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, 'wb') as f:
                f.write(file_bytes)
            
            # Return a path that can be reconstructed or used as a URL
            return f"LOCAL://{key}"

    def get_file(self, key):
        """Fetches bytes from storage."""
        if self.s3 and self.bucket:
            try:
                response = self.s3.get_object(Bucket=self.bucket, Key=key)
                return response['Body'].read()
            except Exception as e:
                logger.error(f"S3 Get Object Failed: {str(e)}")
                raise
        else:
            # Local fallback
            temp_path = os.path.join(settings.BASE_DIR, 'scratch', f'temp_{uuid.uuid4()}')
            self.download_to_file(key, temp_path)
            with open(temp_path, 'rb') as f:
                content = f.read()
            if os.path.exists(temp_path): os.remove(temp_path)
            return content

    def download_to_file(self, key, local_path):
        """Streams a file from storage to a local path."""
        if self.s3 and self.bucket:
            try:
                self.s3.download_file(self.bucket, key, local_path)
                return True
            except Exception as e:
                logger.error(f"S3 Streaming Download Failed: {str(e)}")
                raise
        else:
            # Local "download" (copy)
            # Handle internal storage protocol
            clean_key = key
            if "://" in key:
                clean_key = key.split("://", 1)[1]
            
            # Handle legacy media prefixes
            prefixes = ["/media/ocr_storage/", "/media/bulk_pipeline/", "media/ocr_storage/", "media/bulk_pipeline/"]
            for p in prefixes:
                if clean_key.startswith(p):
                    clean_key = clean_key[len(p):]
                    break

            source_path = os.path.normpath(os.path.join(self.local_root, clean_key.replace('/', os.sep)))
            
            if not os.path.exists(source_path):
                logger.error(f"[STORAGE_CRITICAL] Source file missing at {source_path} (Original key: {key})")
                # Fallback check: maybe it's already an absolute path?
                if os.path.exists(key):
                    source_path = key
                else:
                    raise FileNotFoundError(f"Local storage file not found: {source_path}")

            import shutil
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            shutil.copy2(source_path, local_path)
            return True

    def generate_presigned_post(self, key, content_type='application/pdf', expires_in=3600):
        """Generates a pre-signed POST for direct client upload (Phase 2 Hardening)."""
        if self.s3 and self.bucket:
            try:
                response = self.s3.generate_presigned_post(
                    Bucket=self.bucket,
                    Key=key,
                    Fields={"Content-Type": content_type},
                    Conditions=[
                        {"Content-Type": content_type},
                        ["content-length-range", 0, 52428800] # Max 50MB
                    ],
                    ExpiresIn=expires_in
                )
                return response
            except Exception as e:
                logger.error(f"Failed to generate pre-signed POST: {e}")
                return None
        
        # Local fallback simulation (returns a dummy URL for local dev)
        return {
            "url": f"/api/local-upload-simulator/",
            "fields": {"key": key, "Content-Type": content_type}
        }
