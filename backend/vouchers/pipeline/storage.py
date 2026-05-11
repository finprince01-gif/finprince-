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

logger = logging.getLogger(__name__)

USE_S3 = os.environ.get('USE_S3', 'false').lower() == 'true'
S3_BUCKET = os.environ.get('S3_BUCKET', 'finpixe-invoices')
LOCAL_STORAGE_ROOT = os.environ.get('LOCAL_STORAGE_ROOT', os.path.join(os.path.dirname(__file__), '..', '..', 'media', 'bulk_pipeline'))


def _ensure_local(path: str):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


def upload_bytes(file_bytes: bytes, key: str) -> str:
    """
    Store raw bytes under the given storage key.
    Returns the canonical storage key.
    """
    if USE_S3:
        return _s3_upload_bytes(file_bytes, key)
    return _local_upload_bytes(file_bytes, key)


def download_bytes(key: str) -> bytes:
    """Retrieve raw bytes for a storage key."""
    if USE_S3:
        return _s3_download_bytes(key)
    return _local_download_bytes(key)


def make_key(job_id: int, filename: str) -> str:
    """Generate a unique storage key for a file, preserving the original name for the UI."""
    ext = os.path.splitext(filename)[1].lower() or '.bin'
    safe_name = "".join([c if c.isalnum() or c in ".-_" else "_" for c in filename])
    return f"jobs/{job_id}/{uuid.uuid4().hex[:8]}---{safe_name}"


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ─────────────────────────────────────────────
# LOCAL FILESYSTEM BACKEND
# ─────────────────────────────────────────────
def _local_path(key: str) -> str:
    return os.path.join(LOCAL_STORAGE_ROOT, key.replace('/', os.sep))


def _local_upload_bytes(file_bytes: bytes, key: str) -> str:
    path = _local_path(key)
    _ensure_local(path)
    with open(path, 'wb') as f:
        f.write(file_bytes)
    logger.debug(f"[STORAGE] Saved {len(file_bytes)} bytes → {path}")
    return key


def _local_download_bytes(key: str) -> bytes:
    path = _local_path(key)
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
    logger.info(f"[S3] Uploaded s3://{S3_BUCKET}/{key}")
    return key


def _s3_download_bytes(key: str) -> bytes:
    client = _get_s3_client()
    buf = io.BytesIO()
    client.download_fileobj(S3_BUCKET, key, buf)
    buf.seek(0)
    return buf.read()


def get_signed_url(key: str, expires_in: int = 3600) -> str:
    """
    Generate a signed URL for direct browser access or inter-service transfer.
    (Requirement Phase 1F)
    """
    if USE_S3:
        client = _get_s3_client()
        return client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': key},
            ExpiresIn=expires_in
        )
    
    # Local fallback (returns media URL)
    from django.conf import settings
    return f"{settings.MEDIA_URL}bulk_pipeline/{key}"
