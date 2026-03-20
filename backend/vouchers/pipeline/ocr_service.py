"""
OCR Service – Hardened (invoice.upload → invoice.ocr)
=======================================================
Changes from v1:
  - Skip blank pages BEFORE publishing to Kafka (reduces topic volume)
  - Use job_id as partition key (ensures per-job ordering in merge)
  - No local temp files – all bytes flow through storage layer
  - Tracks blank-skip metrics
"""
import os
import sys
import asyncio
import logging
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from . import storage, kafka_client

logger = logging.getLogger(__name__)

MIN_TEXT_LENGTH = int(os.environ.get('OCR_MIN_TEXT_LENGTH', '30'))


async def handle_upload_event(payload: dict):
    job_id      = payload['job_id']
    storage_key = payload['storage_key']
    filename    = payload.get('filename', 'file.pdf')
    tenant_id   = payload.get('tenant_id', 'unknown')
    item_id     = payload.get('item_id')

    logger.info(f"[OCR] Job {job_id}: {filename}")

    try:
        file_bytes = storage.download_bytes(storage_key)
        is_pdf = filename.lower().endswith('.pdf')

        pages = await _split_pages(file_bytes, filename) if is_pdf else [
            {'bytes': file_bytes, 'page_number': 1, 'page_count': 1}
        ]

        total = len(pages)
        published = 0
        skipped   = 0

        for page in pages:
            text = _extract_text(page['bytes'], filename)

            # ── SKIP blank/noise pages BEFORE publishing ────────────────────
            if _is_blank_page(text):
                logger.debug(f"[OCR] Job {job_id} page {page['page_number']}: BLANK – skipped")
                skipped += 1
                continue

            page_key  = storage.make_key(job_id, f"p{page['page_number']}.pdf")
            page_hash = storage.hash_bytes(page['bytes'])
            storage.upload_bytes(page['bytes'], page_key)

            await kafka_client.publish('ocr', {
                'job_id':      job_id,
                'tenant_id':   tenant_id,
                'item_id':     item_id,
                'page_key':    page_key,
                'page_hash':   page_hash,
                'page_number': page['page_number'],
                'page_count':  total,
                'text':        text,
                'text_length': len(text.strip()),
                'filename':    filename,
            }, key=str(job_id))   # ← partition by job_id for ordering

            published += 1

        logger.info(f"[OCR] Job {job_id}: {published} pages published, {skipped} blank pages skipped")

    except Exception as e:
        logger.error(f"[OCR] Job {job_id} failed: {e}")
        await kafka_client.publish('retry', {
            'job_id': job_id, 'item_id': item_id, 'stage': 'ocr',
            'error': str(e), 'retry_count': payload.get('retry_count', 0) + 1,
            **{k: v for k, v in payload.items() if k != 'retry_count'},
        })


def _is_blank_page(text: str) -> bool:
    return len(text.strip()) < MIN_TEXT_LENGTH


def _extract_text(file_bytes: bytes, filename: str) -> str:
    try:
        import fitz
        ftype = "pdf" if filename.lower().endswith('.pdf') else "png"
        doc   = fitz.open(stream=file_bytes, filetype=ftype)
        text  = "".join(p.get_text("text") for p in doc)
        doc.close()
        return text.strip()
    except Exception as e:
        logger.warning(f"[OCR TEXT] Extraction failed: {e}")
        return ""


async def _split_pages(file_bytes: bytes, filename: str) -> list:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _split_sync, file_bytes, filename)


def _split_sync(file_bytes: bytes, filename: str) -> list:
    import fitz
    pages = []
    try:
        from core.pdf_splitter import split_pdf_into_invoice_files
        results = split_pdf_into_invoice_files(file_bytes, filename)
        for _inv, _tmp, group in results:
            indices = group.page_indices
            total   = len(indices)
            for i, idx in enumerate(indices):
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                out = fitz.open()
                out.insert_pdf(doc, from_page=idx, to_page=idx)
                pages.append({'bytes': out.tobytes(), 'page_number': i + 1, 'page_count': total})
                out.close(); doc.close()
    except Exception:
        doc   = fitz.open(stream=file_bytes, filetype="pdf")
        total = doc.page_count
        for i in range(total):
            out = fitz.open()
            out.insert_pdf(doc, from_page=i, to_page=i)
            pages.append({'bytes': out.tobytes(), 'page_number': i + 1, 'page_count': total})
            out.close()
        doc.close()
    return pages


async def run():
    logger.info("[OCR SERVICE] invoice.upload consumer starting")
    await kafka_client.consume('upload', 'ocr-workers', handle_upload_event)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
