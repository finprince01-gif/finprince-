# LEGACY OCR CACHE - DEPRECATED
# Use ocr_pipeline module instead.

def raise_legacy_error():
    raise Exception("OLD PIPELINE SHOULD NOT BE USED. Use ocr_pipeline instead.")

def get_all_staged_invoices(*args, **kwargs): raise_legacy_error()
def remove_staged_invoice(*args, **kwargs): raise_legacy_error()
def clear_staged_invoices(*args, **kwargs): raise_legacy_error()
def compute_file_hash(*args, **kwargs): raise_legacy_error()
def save_ocr_cache(*args, **kwargs): raise_legacy_error()
def get_cached_ocr(*args, **kwargs): raise_legacy_error()
def remove_processed_invoices(*args, **kwargs): raise_legacy_error()
def mark_invoice_as_processed(*args, **kwargs): raise_legacy_error()
def update_ocr_cache_session(*args, **kwargs): raise_legacy_error()
def update_staged_invoice_extracted_data(*args, **kwargs): raise_legacy_error()
