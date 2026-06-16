from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR
import json

def run():
    p_purchases = PendingPurchase.objects.filter(invoice_number__in=['UMT25-26/091', 'UMT25-26/251']).order_by('invoice_number', 'created_at')
    
    records = []
    for p in p_purchases:
        ocr = InvoiceTempOCR.objects.filter(id=p.source_scan_row_id).first()
        record_info = {
            "pending_purchase_id": p.id,
            "source_invoice_temp_ocr_id": p.source_scan_row_id,
            "upload_session_id": p.scan_session_id,
            "supplier_invoice_no": p.invoice_number,
            "gstin": p.vendor_gstin,
            "vendor_id": ocr.vendor_id if ocr else None,
            "branch_id": p.branch_id,
            "file_hash": p.source_document_hash,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        records.append(record_info)
        
    print(json.dumps(records, indent=2))
    with open('extracted_duplicates.json', 'w') as f:
        json.dump(records, f, indent=2)

if __name__ == '__main__':
    run()
