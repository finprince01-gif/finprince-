import logging
import hashlib
import json
from typing import List, Dict, Any
from .repository import InvoiceTempOCR

logger = logging.getLogger(__name__)

def run_grouping_logic(tenant_id, upload_session_id):
    """
    Consolidated Grouping logic: routes all grouping decisions through the
    canonical ForensicMerger to ensure consistency.
    """
    if not upload_session_id:
        return

    logger.info(f"[CANONICAL GROUPING START] session={upload_session_id} tenant={tenant_id}")

    records_qs = InvoiceTempOCR.objects.filter(
        tenant_id=str(tenant_id),
        upload_session_id=upload_session_id,
        processed=False
    ).order_by('created_at', 'id')

    records = list(records_qs)

    # ── CONSISTENCY LAYER: ALIGN GSTIN VARIANTS FOR SAME INVOICE ──
    from collections import defaultdict
    from difflib import SequenceMatcher
    import re

    def score_gstin(gstin_val: str) -> int:
        if not gstin_val:
            return 0
        gst = gstin_val.strip().upper()
        if len(gst) != 15:
            return 1
        if re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$', gst):
            return 10
        return 5

    def are_gstins_similar(g1: str, g2: str) -> bool:
        if not g1 or not g2:
            return False
        g1 = g1.strip().upper()
        g2 = g2.strip().upper()
        if g1 == g2:
            return True
        return SequenceMatcher(None, g1, g2).ratio() > 0.85

    # Group records by non-empty supplier_invoice_no
    inv_groups = defaultdict(list)
    for r in records:
        inv_no = (r.supplier_invoice_no or "").strip()
        if inv_no and inv_no.upper() not in ("MISSING", "N/A", "—"):
            inv_groups[inv_no].append(r)

    for inv_no, rec_list in inv_groups.items():
        if len(rec_list) <= 1:
            continue
        
        # Collect distinct non-empty GSTINs
        gstin_to_recs = defaultdict(list)
        for r in rec_list:
            ext_data = r.extracted_data or {}
            gst = (ext_data.get("canonical_vendor_gstin") or ext_data.get("vendor_gstin") or r.gstin or "").strip().upper()
            if gst and gst not in ("MISSING", "N/A", "—"):
                gstin_to_recs[gst].append(r)
                
        if len(gstin_to_recs) <= 1:
            continue
            
        # Group GSTINs by similarity
        distinct_gstins = list(gstin_to_recs.keys())
        similarity_groups = [] # list of sets of similar GSTINs
        
        for gst in distinct_gstins:
            added = False
            for group in similarity_groups:
                first = list(group)[0]
                if are_gstins_similar(first, gst):
                    group.add(gst)
                    added = True
                    break
            if not added:
                similarity_groups.append({gst})
                
        # For each similarity group with variants, choose canonical and align
        for group in similarity_groups:
            if len(group) <= 1:
                continue
                
            def sort_key(gst):
                recs_count = len(gstin_to_recs[gst])
                return (score_gstin(gst), recs_count, gst)
                
            canonical_gstin = max(group, key=sort_key)
            logger.info(f"[OCR_GSTIN_INCONSISTENCY] invoice_no='{inv_no}' variants={list(group)} chosen='{canonical_gstin}'")
            
            # Update all records in the group
            for gst in group:
                if gst == canonical_gstin:
                    continue
                for r in gstin_to_recs[gst]:
                    r.gstin = canonical_gstin
                    # Also update extracted_data if necessary
                    if isinstance(r.extracted_data, dict):
                        dirty = False
                        ext = dict(r.extracted_data)
                        if 'gstin' in ext:
                            ext['gstin'] = canonical_gstin
                            dirty = True
                        if 'vendor_gstin' in ext:
                            ext['vendor_gstin'] = canonical_gstin
                            dirty = True
                        if 'canonical_gstin' in ext:
                            ext['canonical_gstin'] = canonical_gstin
                            dirty = True
                        if 'canonical_vendor_gstin' in ext:
                            ext['canonical_vendor_gstin'] = canonical_gstin
                            dirty = True
                        if dirty:
                            r.extracted_data = ext
                    r.save(update_fields=['gstin', 'extracted_data'])
                    logger.info(f"[OCR_GSTIN_ALIGNED] record={r.id} invoice_no='{inv_no}' old='{gst}' new='{canonical_gstin}'")

    # ── DETERMINISTIC PHYSICAL PAGE SORTING ──
    def get_record_physical_page(r):
        ext = r.extracted_data if isinstance(r.extracted_data, dict) else {}
        val = ext.get("_physical_page_no") or ext.get("_page_no")
        if val is not None:
            try:
                return int(val)
            except (ValueError, TypeError):
                pass
        return r.id or 0

    records = sorted(records, key=get_record_physical_page)

    record_count = len(records)
    if record_count == 0:
        logger.info(f"[CANONICAL GROUPING] No unprocessed records found for session {upload_session_id}")
        return

    # Build payloads compatible with ForensicMerger
    payloads = []
    record_map = {} # _page_no -> record object
    
    for idx, r in enumerate(records):
        page_no = idx + 1
        
        # Extract date
        date_val = ""
        if r.supplier_invoice_date:
            if hasattr(r.supplier_invoice_date, 'strftime'):
                date_val = r.supplier_invoice_date.strftime("%Y-%m-%d")
            else:
                date_val = str(r.supplier_invoice_date)
        
        ext_data = r.extracted_data if isinstance(r.extracted_data, dict) else {}
        
        # Determine physical page number
        phys_page = ext_data.get("_physical_page_no") or ext_data.get("_page_no") or page_no
        try:
            phys_page = int(phys_page)
        except (ValueError, TypeError):
            phys_page = page_no

        gst_val = (ext_data.get("canonical_vendor_gstin") or ext_data.get("vendor_gstin") or r.gstin or "").strip().upper()
        payload = {
            "invoice_no": (r.supplier_invoice_no or "").strip(),
            "gstin": gst_val,
            "vendor_name": (r.vendor_name or "").strip(),
            "tenant_id": str(r.tenant_id),
            "invoice_date": date_val,
            "raw_gstin": (ext_data.get("raw_vendor_gstin") or gst_val).strip().upper(),
            "canonical_gstin": gst_val,
            "_page_no": page_no,
            "_physical_page_no": phys_page,
            "items": ext_data.get("items", []),
            "_raw_text": ext_data.get("_raw_text") or "",
            "_pdf_ocr_text": ext_data.get("_pdf_ocr_text") or "",
            "record_id": str(r.id),
            "upload_session_id": upload_session_id
        }
        payloads.append(payload)
        record_map[page_no] = r

    # Run ForensicMerger grouping
    from .forensic_merger import get_forensic_merger
    merger = get_forensic_merger()
    groups_dict = merger.group_invoices(payloads)

    logger.info(f"[CANONICAL GROUPING] Formed {len(groups_dict)} groups from {record_count} records")

    # Update records in database
    for group_key, group_payloads in groups_dict.items():
        # Sort members by _page_no to be deterministic
        sorted_payloads = sorted(group_payloads, key=lambda x: x["_page_no"])
        
        # Compute deterministic group_id
        member_ids = ",".join(str(p["record_id"]) for p in sorted_payloads)
        group_hash = hashlib.sha256(f"{member_ids}_{upload_session_id}".encode('utf-8')).hexdigest()[:16]
        group_id = f"GRP_HASH_{group_hash}"

        # Update first as primary
        for p_idx, p in enumerate(sorted_payloads):
            r = record_map[p["_page_no"]]
            is_primary = (p_idx == 0)
            
            r.is_primary = is_primary
            # If the group only contains a single record, group_id should be None (standalone)
            r.group_id = group_id if len(sorted_payloads) > 1 else None
            r.save(update_fields=['is_primary', 'group_id'])
            
            logger.info(
                f"[CANONICAL GROUPING UPDATE] record={r.id} "
                f"is_primary={is_primary} group_id={r.group_id} "
                f"invoice_no='{r.supplier_invoice_no}' gstin='{r.gstin}'"
            )

    logger.info(f"[CANONICAL GROUPING COMPLETE] session={upload_session_id}")
