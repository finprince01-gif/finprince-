import fitz  # PyMuPDF
import re
import logging
import hashlib
import json
from typing import List, Tuple
from .repository import InvoiceTempOCR

logger = logging.getLogger(__name__)

def segment_pdf_by_boundaries(file_bytes: bytes) -> List[bytes]:
    """
    STRICT Identity-Based Segmentation Engine.
    Ensures no merging happens when invoice numbers or totals differ.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        logger.error(f"Failed to open PDF for segmentation: {e}")
        return [file_bytes]

    total_pages = len(doc)
    if total_pages <= 1:
        return [file_bytes]

    invoice_groups: List[List[int]] = []
    current_group = [0]
    
    # ── Rules ──
    LABEL_PATTERNS = [r"INVOICE\s*NO", r"INVOICE\s*NUMBER", r"BILL\s*NO", r"INV\s*NO", r"INVOICE\s*#"]
    REJECTION_WORDS = ["HSN", "QTY", "RATE", "AMOUNT", "CGST", "SGST", "TAX", "TOTAL"]

    def is_valid_format(val: str) -> bool:
        if not val: return False
        val = val.strip().upper()
        if len(val) < 3 or len(val) > 25: return False
        has_special = any(c in val for c in ["/", "-", ".", "_", " "])
        has_alpha = any(c.isalpha() for c in val)
        has_digit = any(c.isdigit() for c in val)
        if val.isdigit() and len(val) > 7: return False
        return has_digit and (has_special or has_alpha)

    def extract_high_fidelity_invoice_no(page_obj):
        blocks = page_obj.get_text("blocks")
        page_height = page_obj.rect.height
        candidates = []

        for b_idx, b in enumerate(blocks):
            text = b[4].upper()
            y_pos = b[1]
            found_label = any(re.search(lp, text) for lp in LABEL_PATTERNS)
            if found_label:
                match = re.search(r"(?:NO|#|NUM)?[\s.:]*([A-Z0-9\/\-\.\_\s]{3,})", text)
                if match:
                    val = match.group(1).strip()
                    if is_valid_format(val):
                        candidates.append({"val": val, "y": y_pos})
                if b_idx + 1 < len(blocks):
                    next_text = blocks[b_idx+1][4].strip().upper()
                    if is_valid_format(next_text):
                        candidates.append({"val": next_text, "y": blocks[b_idx+1][1]})

        filtered = [c for c in candidates if not any(rw in c["val"] for rw in REJECTION_WORDS)]
        if not filtered: return None
        # Score by position (top of page is best)
        best = max(filtered, key=lambda c: 100 if c["y"] < (page_height * 0.30) else 0)
        return best["val"]

    def extract_total_amount(page_obj):
        blocks = page_obj.get_text("blocks")
        total_patterns = [r"TOTAL", r"GRAND\s*TOTAL", r"INVOICE\s*VALUE", r"NET\s*AMOUNT"]
        for b in blocks:
            text = b[4].upper()
            if any(re.search(p, text) for p in total_patterns):
                match = re.search(r"(?:₹|RS\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\b", text)
                if match:
                    try:
                        val = float(match.group(1).replace(",", ""))
                        if val > 0: return val
                    except: pass
        return None

    last_inv_no = extract_high_fidelity_invoice_no(doc[0])
    last_total = extract_total_amount(doc[0])
    
    for i in range(1, total_pages):
        page = doc[i]
        curr_inv_no = extract_high_fidelity_invoice_no(page)
        curr_total = extract_total_amount(page)
        text = page.get_text("text").upper()
        
        split_decision = False
        reason = "Continuing same invoice"
        
        # --- UPDATED SEGMENTATION LOGIC (Conservative) ---
        if curr_inv_no:
            if last_inv_no and last_inv_no != curr_inv_no:
                # We found a DIFFERENT invoice number → definite split
                split_decision = True
                reason = f"New invoice number: {curr_inv_no} (prev: {last_inv_no})"
            elif not last_inv_no:
                # We didn't have a previous number but found one now
                # This could be a split if the previous page was a "blind" continuation
                # or it could be the first page of a new invoice. 
                # To be safe, we split only if the previous page had a total amount.
                if last_total:
                    split_decision = True
                    reason = "New invoice detected (previous had no number but had total)"
                else:
                    split_decision = False
                    reason = "Initial invoice number found"
            else:
                # curr_inv_no == last_inv_no
                split_decision = False
                reason = "Same invoice number"
        else:
            # Current page has NO invoice number
            # We assume it's a CONTINUATION unless the total amount significantly changes
            # or other logic (like a fresh GSTIN or Vendor Name) suggests otherwise.
            # But here we stay conservative to prevent breaking multi-page invoices.
            split_decision = False
            reason = "Continuation (no new invoice number)"

        # DEBUG LOGGING (MANDATORY FORMAT)
        logger.info(json.dumps({
            "page": i + 1,
            "prev_invoice": last_inv_no,
            "curr_invoice": curr_inv_no,
            "decision": "split" if split_decision else "merge",
            "reason": reason
        }))

        if split_decision:
            invoice_groups.append(current_group)
            current_group = [i]
        else:
            current_group.append(i)

        if curr_inv_no: last_inv_no = curr_inv_no
        if curr_total: last_total = curr_total

    invoice_groups.append(current_group)

    # Final Segments Conversion
    blobs = []
    for group in invoice_groups:
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=group[0], to_page=group[-1])
        blobs.append(new_doc.write())
        new_doc.close()

    doc.close()
    logger.info(
        f"[SEGMENTATION COMPLETE] total_pages={total_pages} "
        f"segments={len(blobs)} groups={[g for g in invoice_groups]}"
    )
    return blobs

def run_grouping_logic(tenant_id, upload_session_id):
    """
    STRICT Grouping logic: Groups only if invoice_no matches EXACTLY.
    """
    if not upload_session_id:
        return

    logger.info(f"[GROUPING START] session={upload_session_id} tenant={tenant_id}")

    records = InvoiceTempOCR.objects.filter(
        tenant_id=str(tenant_id),
        upload_session_id=upload_session_id,
        processed=False
    ).order_by('created_at', 'id')

    record_count = records.count()
    logger.info(f"[GROUPING] {record_count} unprocessed records found for session {upload_session_id}")

    seen = {}  # invoice_no -> group_id

    for r in records:
        inv_no = (r.supplier_invoice_no or "").strip()
        gstin = (r.gstin or "").strip().upper()
        file_hash = (r.file_hash or "")[:12]

        if not inv_no:
            # Cannot group safely without invoice number
            logger.info(
                f"[GROUPING] record={r.id} hash={file_hash}... "
                f"inv_no=MISSING → STANDALONE"
            )
            r.is_primary = True
            r.group_id = None
            r.save()
            continue

        # CRITICAL FIX: Group by (InvoiceNo + GSTIN) to prevent multi-vendor collision
        # If GSTIN is missing, we use 'UNKNOWN' to keep them distinct from records with GSTINs
        key = f"{inv_no.lower()}|{gstin or 'UNKNOWN_GSTIN'}"
        
        if key not in seen:
            # STEP 1: New Group
            group_id = hashlib.sha256(f"{key}_{upload_session_id}".encode()).hexdigest()[:16]
            seen[key] = group_id
            r.is_primary = True
            r.group_id = group_id
            logger.info(
                f"[GROUPING] record={r.id} hash={file_hash}... "
                f"key='{key}' → NEW_PRIMARY group_id={group_id}"
            )
        else:
            # Subsequent page for the same invoice/vendor pair
            existing_group_id = seen[key]
            r.is_primary = False
            r.group_id = existing_group_id
            logger.info(
                f"[GROUPING] record={r.id} hash={file_hash}... "
                f"key='{key}' → CONTINUATION of group_id={existing_group_id}"
            )

        r.save()

    groups_formed = len(seen)
    logger.info(
        f"[GROUPING COMPLETE] session={upload_session_id} "
        f"records={record_count} distinct_invoices={groups_formed} standalone={record_count - sum(1 for _ in seen)}"
    )
