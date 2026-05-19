"""
Storage Abstraction Layer
==========================
Provides a unified API for file storage.
- Local filesystem (default, for development)
- AWS S3 (production, set USE_S3=true in env)

All other pipeline stages ONLY deal with storage_keys (not local paths),
ensuring horizontal scalability.
"""
import os
import io
import hashlib
import logging
import uuid

logger = logging.getLogger("ForensicStorage")

USE_S3 = os.environ.get('USE_S3', 'false').lower() == 'true'
S3_BUCKET = os.environ.get('S3_BUCKET', 'finpixe-invoices')
from django.conf import settings
LOCAL_STORAGE_ROOT = getattr(settings, 'OCR_STORAGE_ROOT', os.path.join(settings.MEDIA_ROOT, 'bulk_pipeline'))


def _ensure_local(path: str):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def upload_bytes(file_bytes: bytes, key: str) -> str:
    """
    Store raw bytes under the given storage key.
    Includes forensic validation for empty stream protection.
    """
    size = len(file_bytes)
    if size == 0:
        logger.error(f"[UPLOAD_CRITICAL_FAILURE] Attempted to upload 0 bytes to key: {key}")
        # We allow it to proceed for consistency, but log it as a critical failure
    
    logger.info(f"[UPLOAD_TRACE] size={size} bytes | key={key} | backend={'S3' if USE_S3 else 'LOCAL'}")
    
    if USE_S3:
        return _s3_upload_bytes(file_bytes, key)
    return _local_upload_bytes(file_bytes, key)


def download_bytes(key: str) -> bytes:
    """
    Retrieve raw bytes for a storage key.
    Includes forensic validation for retrieval integrity.
    """
    if USE_S3:
        content = _s3_download_bytes(key)
    else:
        content = _local_download_bytes(key)
        
    size = len(content)
    logger.info(f"[DOWNLOAD_TRACE] size={size} bytes | key={key} | backend={'S3' if USE_S3 else 'LOCAL'}")
    
    if size == 0:
        logger.error(f"[DOWNLOAD_CRITICAL_FAILURE] Storage returned 0 bytes for key: {key}")
        
    return content


def download_to_file(key: str, local_path: str):
    """
    Download a file from storage directly to a local filesystem path.
    """
    if USE_S3:
        client = _get_s3_client()
        client.download_file(S3_BUCKET, key, local_path)
    else:
        content = _local_download_bytes(key)
        _ensure_local(local_path)
        with open(local_path, 'wb') as f:
            f.write(content)
    logger.info(f"[DOWNLOAD_TO_FILE_TRACE] key={key} -> {local_path}")


def make_key(job_id: int, filename: str) -> str:
    """Generate a unique storage key for a file."""
    safe_name = "".join([c if c.isalnum() or c in ".-_" else "_" for c in filename])
    return f"jobs/{job_id}/{uuid.uuid4().hex[:8]}---{safe_name}"


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ─────────────────────────────────────────────
# LOCAL FILESYSTEM BACKEND
# ─────────────────────────────────────────────
def _local_path(key: str) -> str:
    # Ensure consistent path resolution between Windows/Linux
    return os.path.normpath(os.path.join(LOCAL_STORAGE_ROOT, key.replace('/', os.sep)))


def _local_upload_bytes(file_bytes: bytes, key: str) -> str:
    path = _local_path(key)
    _ensure_local(path)
    with open(path, 'wb') as f:
        f.write(file_bytes)
    return key


def _local_download_bytes(key: str) -> bytes:
    path = _local_path(key)
    if not os.path.exists(path):
        logger.error(f"[LOCAL_STORAGE_ERR] File not found: {path}")
        raise FileNotFoundError(f"Storage key not found locally: {key}")
    with open(path, 'rb') as f:
        return f.read()


# ─────────────────────────────────────────────
# AWS S3 BACKEND
# ─────────────────────────────────────────────
def _get_s3_client():
    import boto3
    return boto3.client(
        's3',
        region_name=os.environ.get('AWS_REGION', 'ap-south-1'),
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    )


def _s3_upload_bytes(file_bytes: bytes, key: str) -> str:
    client = _get_s3_client()
    client.upload_fileobj(io.BytesIO(file_bytes), S3_BUCKET, key)
    return key


def _s3_download_bytes(key: str) -> bytes:
    client = _get_s3_client()
    buf = io.BytesIO()
    try:
        client.download_fileobj(S3_BUCKET, key, buf)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.error(f"[S3_STORAGE_ERR] Failed to download {key}: {e}")
        raise


def get_signed_url(key: str, expires_in: int = 3600) -> str:
    """Generate a signed URL for direct browser access."""
    if USE_S3:
        client = _get_s3_client()
        return client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': key},
            ExpiresIn=expires_in
        )
    
    # Local fallback
    from django.conf import settings
    # Normalize path for URL
    safe_key = key.replace('\\', '/')
    return f"{settings.MEDIA_URL}bulk_pipeline/{safe_key}"
