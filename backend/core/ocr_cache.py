"""
OCR Result Caching Module
=========================
Provides a temporary caching layer for scanned invoice OCR results.

Key rules:
  - Uses the invoice_ocr_temp table (MySQL/PostgreSQL) for persistence.
  - Does NOT modify existing OCR logic, upload flow, or UI behaviour.
  - Records expire 15 days after upload.
  - File identity is determined by an SHA-256 hash of the uploaded bytes so
    the same physical invoice is never re-scanned.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta
from .processing_engine import safe_json_load

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache duration (days)
# ---------------------------------------------------------------------------
OCR_CACHE_TTL_DAYS = 15


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_file_hash(file_bytes: bytes) -> str:
    """Return the SHA-256 hex digest of raw file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_cached_ocr(file_hash: str, tenant_id: str) -> dict | None:
    """
    Look up a non-expired OCR cache record by file hash + tenant.

    Returns the full cache row dict on hit, or None on miss / expiry.
    The returned dict has keys:
        id, file_hash, file_path, ocr_raw_text, extracted_data,
        created_at, expires_at
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, file_hash, file_path, ocr_raw_text,
                       extracted_data, created_at, expires_at, upload_session_id, processed, 
                       validation_status, matched_by, conflict_message, vendor_id, voucher_id, status
                FROM   invoice_ocr_temp
                WHERE  file_hash  = %s
                  AND  tenant_id  = %s
                  AND  expires_at > NOW()
                LIMIT  1
                """,
                [file_hash, tenant_id],
            )
            row = cursor.fetchone()

        if not row:
            return None

        col_names = [
            "id", "file_hash", "file_path", "ocr_raw_text",
            "extracted_data", "created_at", "expires_at", "upload_session_id", 
            "processed", "validation_status", "matched_by", "conflict_message", 
            "vendor_id", "voucher_id", "status"
        ]
        record = dict(zip(col_names, row))

        # Deserialise the JSON blob stored in extracted_data
        if isinstance(record["extracted_data"], str):
            try:
                record["extracted_data"] = safe_json_load(record["extracted_data"])
            except Exception:
                record["extracted_data"] = {}

        return record

    except Exception as exc:
        logger.warning("ocr_cache.get_cached_ocr error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def save_ocr_cache(
    file_hash: str,
    tenant_id: str,
    upload_session_id: str | None = None,
    file_path: str = "",
    ocr_raw_text: str = "",
    extracted_data: dict | None = None,
    validation_status: str = 'PENDING',
    matched_by: str | None = None,
    conflict_message: str | None = None,
    vendor_id: int | None = None,
) -> int | None:
    """
    Persist an OCR result into invoice_ocr_temp.

    Returns the new record id on success, or None on failure.
    """
    from django.db import connection

    expires_at = datetime.utcnow() + timedelta(days=OCR_CACHE_TTL_DAYS)
    extracted_json = json.dumps(extracted_data or {}, ensure_ascii=False, default=str)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO invoice_ocr_temp
                    (file_hash, tenant_id, upload_session_id, file_path, ocr_raw_text, extracted_data,
                     created_at, expires_at, processed, validation_status, status, matched_by, conflict_message, vendor_id)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, FALSE, %s, %s, %s, %s, %s)
                """,
                [
                    file_hash,
                    tenant_id,
                    upload_session_id,
                    file_path,
                    ocr_raw_text,
                    extracted_json,
                    expires_at,
                    validation_status,
                    validation_status, # status column
                    matched_by,
                    conflict_message,
                    vendor_id,
                ],
            )
            connection.commit()
            record_id = cursor.lastrowid
        logger.info(
            "ocr_cache: saved record id=%s hash=%s tenant=%s expires=%s",
            record_id, file_hash[:12], tenant_id, expires_at.date(),
        )
        return record_id
    except Exception as exc:
        logger.warning("ocr_cache.save_ocr_cache error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Update (editing behaviour — update extracted_data only, no re-scan)
# ---------------------------------------------------------------------------

def update_ocr_cache_extracted_data(record_id: int, extracted_data: dict) -> bool:
    """
    Update the extracted_data JSON for an existing cache record (by id).
    Called when a user manually edits invoice fields after scanning.

    Returns True on success, False on failure.
    """
    from django.db import connection

    extracted_json = json.dumps(extracted_data, ensure_ascii=False, default=str)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE invoice_ocr_temp
                SET    extracted_data = %s
                WHERE  id = %s
                  AND  expires_at > NOW()
                  AND  processed  = FALSE
                """,
                [extracted_json, record_id],
            )
        return cursor.rowcount > 0
    except Exception as exc:
        logger.warning("ocr_cache.update_ocr_cache_extracted_data error: %s", exc)
        return False


def update_staged_invoice_extracted_data(
    file_hash: str, 
    tenant_id: str, 
    extracted_data: dict, 
    validation_status: str | None = None,
    matched_by: str | None = None,
    conflict_message: str | None = None,
    vendor_id: int | None = None
) -> bool:
    """
    Update the extracted_data JSON for a staged invoice identified by file_hash + tenant_id.
    Used by the Bulk OCR Staging PATCH endpoint when the user saves edits.
    OCR is NEVER re-run — only the stored JSON is updated.

    If validation_status is provided, updates that too.

    Returns True if at least one row was updated, False otherwise.
    """
    from django.db import connection

    extracted_json = json.dumps(extracted_data, ensure_ascii=False, default=str)

    try:
        with connection.cursor() as cursor:
            if validation_status:
                cursor.execute(
                    """
                    UPDATE invoice_ocr_temp
                    SET    extracted_data = %s,
                           validation_status = %s,
                           status = %s,
                           matched_by = %s,
                           conflict_message = %s,
                           vendor_id = %s
                    WHERE  file_hash  = %s
                      AND  tenant_id  = %s
                      AND  expires_at > NOW()
                      AND  processed  = FALSE
                    """,
                    [extracted_json, validation_status, validation_status, matched_by, conflict_message, vendor_id, file_hash, tenant_id],
                )
            else:
                cursor.execute(
                    """
                    UPDATE invoice_ocr_temp
                    SET    extracted_data = %s
                    WHERE  file_hash  = %s
                      AND  tenant_id  = %s
                      AND  expires_at > NOW()
                      AND  processed  = FALSE
                    """,
                    [extracted_json, file_hash, tenant_id],
                )
            updated = cursor.rowcount > 0
        if updated:
            logger.info(
                "ocr_cache: updated extracted_data (val_status=%s) for hash=%s tenant=%s",
                validation_status, file_hash[:12], tenant_id,
            )
        else:
            logger.warning(
                "ocr_cache: update_staged_invoice_extracted_data — no matching row for hash=%s tenant=%s",
                file_hash[:12], tenant_id,
            )
        return updated
    except Exception as exc:
        logger.warning("ocr_cache.update_staged_invoice_extracted_data error: %s", exc)
        return False


def update_ocr_text(file_hash: str, tenant_id: str, text: str) -> bool:
    """
    Update the ocr_raw_text for an existing cache record.
    Used when OCR finishes and needs to fill in the pre-created staging record.
    """
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE  invoice_ocr_temp
                SET     ocr_raw_text = %s
                WHERE   file_hash = %s
                  AND   tenant_id = %s
                """,
                [text, file_hash, tenant_id]
            )
            connection.commit()
            updated = cursor.rowcount > 0
        if updated:
            logger.info("ocr_cache: updated ocr_raw_text for hash=%s", file_hash[:12])
        return updated
    except Exception as exc:
        logger.warning("ocr_cache.update_ocr_text error: %s", exc)
        return False


def update_ocr_cache_validation_status(file_hash: str, tenant_id: str, status: str) -> bool:
    """Update the validation_status for a cached record."""
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE  invoice_ocr_temp
                SET     validation_status = %s, status = %s
                WHERE   file_hash = %s
                  AND   tenant_id = %s
                """,
                [status, status, file_hash, tenant_id]
            )
            return cursor.rowcount > 0
    except Exception as exc:
        logger.warning("ocr_cache.update_ocr_cache_validation_status error: %s", exc)
        return False


def update_ocr_cache_session(record_id: int, new_session_id: str) -> bool:
    """
    Transfer an existing cache record into a new upload session.
    """
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE invoice_ocr_temp
                SET    upload_session_id = %s
                WHERE  id = %s
                """,
                [new_session_id, record_id]
            )
            return cursor.rowcount > 0
    except Exception as exc:
        logger.warning("ocr_cache.update_ocr_cache_session error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Staging Workflow (Get, Remove, Clear)
# ---------------------------------------------------------------------------

def get_all_staged_invoices(tenant_id: str, upload_session_id: str = None) -> list[dict]:
    """
    Return all non-expired, unprocessed staged invoices for a given tenant.
    If upload_session_id is provided, filters by session too.
    Ordered by newest first.
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            query = """
                SELECT id, file_hash, file_path, ocr_raw_text,
                       extracted_data, created_at, expires_at, upload_session_id, processed, 
                       validation_status, status, matched_by, conflict_message, vendor_id, voucher_id
                FROM   invoice_ocr_temp
                WHERE  tenant_id  = %s
                  AND  expires_at > NOW()
                  AND  processed  = FALSE
            """
            params = [tenant_id]
            if upload_session_id:
                query += " AND upload_session_id = %s "
                params.append(upload_session_id)
            
            query += " ORDER BY created_at DESC "
            cursor.execute(query, params)
            rows = cursor.fetchall()

        col_names = [
            "id", "file_hash", "file_path", "ocr_raw_text",
            "extracted_data", "created_at", "expires_at", "upload_session_id", 
            "processed", "validation_status", "status", "matched_by", "conflict_message",
            "vendor_id", "voucher_id"
        ]
        
        results = []
        for row in rows:
            record = dict(zip(col_names, row))
            if isinstance(record["extracted_data"], str):
                try:
                    record["extracted_data"] = safe_json_load(record["extracted_data"])
                except Exception:
                    record["extracted_data"] = {}
            results.append(record)
            
        return results

    except Exception as exc:
        logger.warning("ocr_cache.get_all_staged_invoices error: %s", exc)
        return []


def remove_staged_invoice(file_hash: str, tenant_id: str) -> bool:
    """
    Remove a specific invoice from the staging table for a tenant.
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM invoice_ocr_temp
                WHERE file_hash = %s
                  AND tenant_id = %s
                """,
                [file_hash, tenant_id],
            )
            return cursor.rowcount > 0
    except Exception as exc:
        logger.warning("ocr_cache.remove_staged_invoice error: %s", exc)
        return False


def mark_invoice_as_processed(
    file_hash: str,
    tenant_id: str,
    voucher_id: int | None = None
) -> bool:
    """
    Mark a staged invoice as processed after voucher creation.
    If voucher_id is provided, store it and update status to 'Voucher Created'.
    """
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            if voucher_id:
                cursor.execute(
                    """
                    UPDATE invoice_ocr_temp
                    SET    processed = TRUE,
                           voucher_id = %s,
                           validation_status = 'Voucher Created',
                           status = 'Voucher Created'
                    WHERE  file_hash = %s
                      AND  tenant_id = %s
                    """,
                    [voucher_id, file_hash, tenant_id]
                )
            else:
                cursor.execute(
                    """
                    UPDATE invoice_ocr_temp
                    SET    processed = TRUE
                    WHERE  file_hash = %s
                      AND  tenant_id = %s
                    """,
                    [file_hash, tenant_id]
                )
            return cursor.rowcount > 0
    except Exception as exc:
        logger.warning("ocr_cache.mark_invoice_as_processed error: %s", exc)
        return False


def remove_processed_invoices(file_hashes: list, tenant_id: str, upload_session_id: str = None) -> int:
    """
    Remove multiple invoices from the staging table for a tenant.
    Called after partial finalization.
    Only deletes if they are marked as processed=TRUE.
    """
    if not file_hashes:
        return 0
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            # Use IN clause for bulk deletion
            format_strings = ','.join(['%s'] * len(file_hashes))
            query = f"""
                DELETE FROM invoice_ocr_temp
                WHERE tenant_id = %s
                  AND processed = TRUE
                  AND file_hash IN ({format_strings})
            """
            params = [tenant_id] + list(file_hashes)
            
            if upload_session_id:
                query += " AND upload_session_id = %s "
                params.append(upload_session_id)
                
            cursor.execute(query, params)
            return cursor.rowcount
    except Exception as exc:
        logger.warning("ocr_cache.remove_processed_invoices error: %s", exc)
        return 0


def clear_staged_invoices(tenant_id: str) -> bool:
    """
    Clear all staged records for a tenant.
    Typically called after successful voucher creation.
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM invoice_ocr_temp WHERE tenant_id = %s",
                [tenant_id],
            )
            return True
    except Exception as exc:
        logger.warning("ocr_cache.clear_staged_invoices error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Cleanup (called by the daily management command)
# ---------------------------------------------------------------------------

def delete_expired_records() -> int:
    """
    Delete all records where expires_at < NOW().

    Also removes the corresponding temporary files from disk if they still exist.
    Returns the number of DB rows deleted.
    """
    import os
    from django.db import connection

    try:
        # ── Step 1: collect file paths BEFORE deletion ────────────────────────
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT file_path FROM invoice_ocr_temp WHERE expires_at < NOW()"
            )
            rows = cursor.fetchall()

        # ── Step 2: remove temp files from disk ───────────────────────────────
        deleted_files: int = 0
        for (file_path,) in rows:
            if file_path and os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                    deleted_files += 1
                    logger.debug("ocr_cache: removed temp file %s", file_path)
                except OSError as file_exc:
                    logger.warning(
                        "ocr_cache: could not delete temp file %s: %s",
                        file_path, file_exc,
                    )

        # ── Step 3: delete expired DB rows ────────────────────────────────────
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM invoice_ocr_temp WHERE expires_at < NOW()"
            )
            deleted = cursor.rowcount

        logger.info(
            "ocr_cache: cleanup deleted %d expired records and %d temp files",
            deleted, deleted_files,
        )
        return deleted

    except Exception as exc:
        logger.error("ocr_cache.delete_expired_records error: %s", exc)
        return 0
