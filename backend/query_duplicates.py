import json
from django.core.serializers.json import DjangoJSONEncoder
from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

def run():
    out = []
    def log(msg):
        print(msg)
        out.append(msg)
        
    log("--- PENDING PURCHASES ---")
    p_purchases = PendingPurchase.objects.filter(invoice_number__in=['UMT25-26/091', 'UMT25-26/251'])
    log(f"Total PendingPurchase: {p_purchases.count()}")
    for p in p_purchases:
        log(f"ID: {p.id}")
        log(f"  company_id: {p.company_id}")
        log(f"  branch_id: {p.branch_id}")
        log(f"  scan_session_id: {p.scan_session_id}")
        log(f"  source_scan_row_id: {p.source_scan_row_id}")
        log(f"  source_document_hash: {p.source_document_hash}")
        log(f"  invoice_number: {p.invoice_number}")
        log(f"  invoice_date: {p.invoice_date}")
        log(f"  vendor_name: {p.vendor_name}")
        log(f"  vendor_gstin: {p.vendor_gstin}")
        log(f"  amount: {p.amount}")
        log(f"  vendor_status: {p.vendor_status}")
        log(f"  voucher_status: {p.voucher_status}")
        log(f"  item_status: {p.item_status}")
        log(f"  pending_purchase_status: {p.pending_purchase_status}")
        log(f"  created_at: {p.created_at}")
        log(f"  extraction_payload keys: {list(p.extraction_payload.keys()) if p.extraction_payload else None}")
        log(f"  review_payload keys: {list(p.review_payload.keys()) if p.review_payload else None}")
        log("-" * 40)
        
    log("\n--- INVOICE TEMP OCR ---")
    ocr_rows = InvoiceTempOCR.objects.filter(supplier_invoice_no__in=['UMT25-26/091', 'UMT25-26/251'])
    log(f"Total InvoiceTempOCR: {ocr_rows.count()}")
    for ocr in ocr_rows:
        log(f"ID: {ocr.id}")
        log(f"  file_hash: {ocr.file_hash}")
        log(f"  tenant_id: {ocr.tenant_id}")
        log(f"  file_path: {ocr.file_path}")
        log(f"  upload_session_id: {ocr.upload_session_id}")
        log(f"  status: {ocr.status}")
        log(f"  processed: {ocr.processed}")
        log(f"  validation_status: {ocr.validation_status}")
        log(f"  vendor_status: {ocr.vendor_status}")
        log(f"  vendor_id: {ocr.vendor_id}")
        log(f"  voucher_id: {ocr.voucher_id}")
        log(f"  supplier_invoice_no: {ocr.supplier_invoice_no}")
        log(f"  gstin: {ocr.gstin}")
        log(f"  branch: {ocr.branch}")
        log(f"  created_at: {ocr.created_at}")
        log("-" * 40)

    with open('query_results.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

if __name__ == '__main__':
    run()
