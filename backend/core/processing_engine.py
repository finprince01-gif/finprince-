# LEGACY PROCESSING ENGINE - DEPRECATED
# Use ocr_pipeline instead.

def raise_legacy_error():
    raise Exception("OLD PROCESSING PIPELINE SHOULD NOT BE USED. Use ocr_pipeline instead.")

def safe_json_load(*args, **kwargs): raise_legacy_error()
def parse_and_process_ocr(*args, **kwargs): raise_legacy_error()
def run_invoice_processing_pipeline(*args, **kwargs): raise_legacy_error()
def recursive_normalize(*args, **kwargs): raise_legacy_error()
def clean_numeric_value(*args, **kwargs): raise_legacy_error()
def normalize_key(*args, **kwargs): raise_legacy_error()
