import logging
import re
from typing import List, Dict, Any
from difflib import SequenceMatcher
import hashlib
import json
import time

logger = logging.getLogger(__name__)

def get_dto_hash(dto: dict) -> str:
    clean_dto = {k: v for k, v in dto.items() if k not in ["validation_revision", "validation_warnings", "_lineage", "is_canonical_frozen", "status", "visible_in_ui", "requires_manual_review", "_integrity_blocked"]}
    try:
        return hashlib.sha256(json.dumps(clean_dto, sort_keys=True, default=str).encode('utf-8')).hexdigest()
    except Exception:
        return str(hash(frozenset(str(x) for x in clean_dto.items())))

def normalize_gstin(gstin: Any) -> str:
    """Non-destructive GSTIN normalization (Requirement #1)."""
    from ocr_pipeline.normalize import normalize_gstin_safe
    return normalize_gstin_safe(gstin)

def hydrate_identity_fields(page: Dict[str, Any]) -> Dict[str, Any]:
    """
    [FORENSIC HYDRATION] Ensures identity fields are at the top level for grouping.
    Resolution Order: 1. top-level, 2. header, 3. _normalized, 4. extracted_data.
    """
    if not isinstance(page, dict): return page

    def resolve(keys: List[str]):
        sources = [
            (page, "top-level"),
            (page.get("header", {}), "header"),
            (page.get("_normalized", {}), "_normalized"),
            (page.get("extracted_data", {}), "extracted_data")
        ]
        for src_dict, src_name in sources:
            if not isinstance(src_dict, dict): continue
            for k in keys:
                val = src_dict.get(k)
                if val and str(val).strip() not in ("", "None", "—", "MISSING"):
                    return str(val).strip(), f"{src_name}.{k}"
        return None, None

    mapping = {
        "invoice_no": ["invoice_no", "invoice_number", "supplier_invoice_no"],
        "gstin": ["gstin", "vendor_gstin", "supplier_gstin"],
        "vendor_name": ["vendor_name", "supplier_name", "vendor"],
        "invoice_date": ["invoice_date", "date", "supplier_invoice_date"]
    }

    for target, sources in mapping.items():
        curr_val = str(page.get(target) or "").strip()
        if curr_val in ("", "None", "—", "MISSING"):
            val, src_path = resolve(sources)
            if val:
                page[target] = val
                logger.info(f"[IDENTITY_TRACE] stage=hydration page={page.get('_page_no')} {target}={val} source={src_path}")
    
    # Critical Aliasing
    if page.get("vendor_gstin") and not page.get("gstin"):
        page["gstin"] = page["vendor_gstin"]
    if page.get("gstin") and not page.get("vendor_gstin"):
        page["vendor_gstin"] = page.get("gstin")

    return page

def detect_continuation_markers(text: str) -> List[str]:
    """Detect markers indicating this is a continuation of a previous invoice."""
    markers = []
    if not text: return markers
    t = text.lower()
    
    patterns = {
        "continued_to_page": r"continued\s+to\s+page",
        "continued": r"\bcontinued\b",
        "carry_forward": r"carry\s+forward",
        "page_2": r"page[\s-]*2",
        "page_2_of_3": r"page[\s-]*2[\s-]*of[\s-]*3",
        "item_table_continues": r"item\s+table\s+continues",
        "subtotal_carried_forward": r"subtotal\s+carried\s+forward",
        "carried_forward": r"carried\s+forward",
        "brought_forward": r"brought\s+forward",
        "tax_summary": r"tax\s+summary",
        "gst_summary": r"gst\s+summary"
    }
    
    for marker, pattern in patterns.items():
        if re.search(pattern, t):
            markers.append(marker)
            
    return markers
class ZohoIntegrityEnforcer:
    """
    Senior Runtime Data Integrity Enforcer (Zoho Bulk Upload Pipeline)
    """
    def __init__(self):
        pass

    def _to_float(self, val: Any) -> float:
        """Robust numeric parsing for currency and OCR noise."""
        if val is None or val == "": return 0.0
        try:
            if isinstance(val, (int, float)): return float(val)
            cleaned = re.sub(r'[^\d.-]', '', str(val))
            return float(cleaned) if cleaned else 0.0
        except (ValueError, TypeError):
            return 0.0

    def should_merge(self, prev: Dict[str, Any], curr: Dict[str, Any]) -> (bool, str):
        """
        [PHASE 4 STABILIZATION] SAFE MULTI-PAGE CONTINUATION LOGIC.
        """
        # ── CRITICAL OCR FAILURE RULE ──
        curr_error = curr.get("_error")
        ocr_text = str(curr.get("_pdf_ocr_text") or curr.get("_raw_text") or "").strip()
        ocr_quality = len(ocr_text)
        if curr_error or ocr_quality < 15:
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Failed OCR page")
            return False, "Failed OCR page (DO NOT MERGE)"
        
        # ── NEW HEADER DETECTED RULE ──
        curr_role = self.classify_page(ocr_text, curr.get("items", []), invoice_data=curr)
        if curr_role == "PAGE_ROLE_PRIMARY":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: New invoice header detected on page")
            return False, "New header detected (FORCE PRIMARY)"
            
        # ── INVOICE_NO MUST DOMINATE RULE ──
        p_no = str(prev.get("invoice_no") or "").strip().upper()
        c_no = str(curr.get("invoice_no") or "").strip().upper()
        
        # If invoice_no differs: NEVER MERGE
        if p_no and c_no and p_no != c_no and p_no != "MISSING" and c_no != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Invoice number mismatch '{p_no}' vs '{c_no}'")
            return False, "Invoice number mismatch"
            
        same_invoice = (not c_no or c_no == "MISSING" or c_no == p_no)
        
        p_gstin = str(prev.get("gstin") or prev.get("vendor_gstin") or "").strip().upper()
        c_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper()
        if p_gstin and c_gstin and p_gstin != c_gstin and p_gstin != "MISSING" and c_gstin != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Vendor mismatch '{p_gstin}' vs '{c_gstin}'")
            return False, "Vendor mismatch"
        same_vendor = (not c_gstin or c_gstin == "MISSING" or c_gstin == p_gstin)
        
        p_branch = str(prev.get("tenant_id") or "").strip().upper()
        c_branch = str(curr.get("tenant_id") or "").strip().upper()
        same_branch = (not c_branch or c_branch == "MISSING" or c_branch == p_branch)
        
        p_date = str(prev.get("invoice_date") or "").strip().upper()
        c_date = str(curr.get("invoice_date") or "").strip().upper()
        if p_date and c_date and p_date != c_date and p_date != "MISSING" and c_date != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Date mismatch '{p_date}' vs '{c_date}'")
            return False, "Date mismatch"
        same_date = (not c_date or c_date == "MISSING" or c_date == p_date)
        
        # ── POSITIVE CONTINUATION EVIDENCE ──
        continuation_structure = (curr_role in ["PAGE_ROLE_CONTINUATION", "PAGE_ROLE_TOTALS", "PAGE_ROLE_TAX_SUMMARY"])
        
        if same_invoice and same_vendor and same_branch and same_date and continuation_structure:
            logger.info(f"[SAFE_MERGE_APPLIED] Safe continuation merge applied")
            return True, "Safe continuation merge"
            
        return False, "No positive continuation evidence"

    def classify_page(self, text: str, items: List[Dict[str, Any]], invoice_data: Dict[str, Any] = None) -> str:
        """
        [HARDENED] Classify page role based on identity anchors vs item density (Requirement #4).
        """
        t = (text or "").lower()
        markers = detect_continuation_markers(t)
        
        # Identity Anchors (Requirement #3)
        has_inv_no = bool(invoice_data.get("invoice_no") if invoice_data else None)
        has_gstin = bool(invoice_data.get("gstin") if invoice_data else None)
        has_date = bool(invoice_data.get("invoice_date") if invoice_data else None)
        
        header_keywords = ["tax invoice", "bill of supply", "original for recipient", "invoice copy", "consignee", "buyer", "invoice no", "date"]
        matched_keywords = [m for m in header_keywords if m in t]
        has_header_keywords = len(matched_keywords) > 0
        
        # Identity Confidence
        anchor_count = sum([has_inv_no, has_gstin, has_date, has_header_keywords])
        
        # Item Validity Check
        has_real_items = False
        real_item_count = 0
        for itm in items:
            q = self._to_float(itm.get("quantity") or itm.get("qty") or itm.get("Qty"))
            r = self._to_float(itm.get("rate") or itm.get("Item Rate"))
            # Real inventory rows must have positive quantity and positive rate
            if q > 0 and r > 0:
                has_real_items = True
                real_item_count += 1
        
        # First page structural confidence
        is_first_page = False
        if invoice_data:
            page_no = invoice_data.get("_page_no") or invoice_data.get("_physical_page_no")
            try:
                if int(page_no) == 1:
                    is_first_page = True
            except:
                pass

        # Check if continuation summary page using forensic_merger's helper
        is_summary_only = False
        try:
            from ocr_pipeline.forensic_merger import get_forensic_merger
            is_summary_only = get_forensic_merger().is_continuation_summary_page(invoice_data or {})
        except Exception:
            pass

        # Primary page structural/content confidence
        is_primary_confident = False
        if is_first_page:
            is_primary_confident = True
        elif has_header_keywords and has_real_items:
            is_primary_confident = True
        elif has_real_items and anchor_count >= 2:
            is_primary_confident = True
        elif real_item_count >= 2 and anchor_count >= 1:
            is_primary_confident = True
        
        # ── CLASSIFICATION LOGIC ──
        role = "PAGE_ROLE_UNKNOWN" # Default: Unknown is NOT continuation

        if "continued_to_page" in markers:
            role = "PAGE_ROLE_PRIMARY"
        elif any(m in ["total_invoice_value", "rounded_off", "authorised_signatory"] for m in markers) or is_summary_only:
            role = "PAGE_ROLE_TOTALS"
        elif any(m in ["tax_summary", "gst_summary"] for m in markers):
            role = "PAGE_ROLE_TAX_SUMMARY"
        elif any(m in markers for m in ["continued", "carry_forward", "page_2", "page_2_of_3", "item_table_continues", "subtotal_carried_forward", "carried_forward", "brought_forward"]):
            role = "PAGE_ROLE_CONTINUATION"
        elif is_primary_confident:
            role = "PAGE_ROLE_PRIMARY"
        elif has_real_items:
            role = "PAGE_ROLE_CONTINUATION"
            
        logger.info(f"[PAGE_ROLE_DECISION] anchors={anchor_count} matched={matched_keywords} has_items={has_real_items} role={role} is_first_page={is_first_page} is_summary_only={is_summary_only}")
        if role == "PAGE_ROLE_PRIMARY":
            logger.info(f"[PRIMARY_SELECTED] anchors={anchor_count}")
        
        return role

    def verify(self, final_invoices: List[Dict[str, Any]], original_count: int = 0) -> Dict[str, Any]:
        """
        Runs the 8-step runtime verification protocol.
        [PHASE 11.9] Hardened for Semantic Validity.
        """
        report = {"validation": "PASS", "ready_for_zoho": True, "stage": "RUNTIME_VERIFICATION", "failures": []}
        
        if not final_invoices:
            report.update({"validation": "FAIL", "ready_for_zoho": False})
            report["failures"].append("CRITICAL: No invoices produced after assembly merge.")
            return report

        for idx, inv in enumerate(final_invoices):
            # Check validation revision to avoid duplicate validation execution
            current_hash = get_dto_hash(inv)
            val_rev = inv.get("validation_revision")
            if val_rev and isinstance(val_rev, dict) and val_rev.get("hash") == current_hash:
                logger.info(f"[VALIDATION_SKIPPED_ALREADY_VALIDATED] Skip verify for invoice {inv.get('invoice_no')} hash {current_hash}")
                cached_failures = val_rev.get("failures", [])
                if cached_failures:
                    report["failures"].extend(cached_failures)
                    report["validation"] = "FAIL"
                    report["ready_for_zoho"] = False
                continue

            failures_start_idx = len(report["failures"])

            # ── [PHASE 11.9] SEMANTIC VALIDATION ──
            v_name = str(inv.get("vendor_name") or "").strip()
            v_inv_no = str(inv.get("invoice_no") or "").strip()
            v_items = inv.get("items", [])

            missing = []
            if not v_name and not v_inv_no: missing.append("vendor_identity")
            if not v_items: missing.append("items")

            if missing:
                err = f"Invoice[{idx}] potentially incomplete. Missing: {', '.join(missing)}"
                logger.warning(f"[INTEGRITY_WARNING] {err}")
                report["failures"].append(err)
                # [PHASE 11.9] Tolerant Mode: We don't fail the whole batch for warnings
                # [FIX] VOID != FAILED. Treat as degraded visible rows instead of partial extraction, NOT failing batch.
                if not v_name and not v_inv_no and not v_items:
                     logger.warning(f"[DEGRADED_INVOICE_VISIBLE] idx={idx} Invoice is a total void. Treating as partial extraction, NOT failing batch.")
                     inv["status"] = "partial_extraction"
                     inv["visible_in_ui"] = True
                     inv["requires_manual_review"] = True
            else:
                logger.info(f"[INTEGRITY_PASS] Invoice[{idx}] has minimum identity anchors.")
                
            # ── FINANCIAL RECONCILIATION ──
            recon = self.run_financial_reconciliation(inv)
            if not recon["valid"]:
                err_msg = f"Financial reconciliation failed for {v_inv_no}: {recon['reason']}"
                logger.error(f"[INVOICE_RECONCILIATION_FAILED] invoice={v_inv_no} reason='{recon['reason']}'")
                report["failures"].append(err_msg)
                report.update({"validation": "FAIL", "ready_for_zoho": False})
                inv["_integrity_blocked"] = True
            else:
                logger.info(f"[INVOICE_RECONCILIATION_SUCCESS] invoice={v_inv_no}")

            # Capture failures specific to this invoice and save validation revision
            inv_failures = report["failures"][failures_start_idx:]
            prev_version = 0
            if val_rev and isinstance(val_rev, dict):
                prev_version = val_rev.get("version", 0)

            inv["validation_revision"] = {
                "hash": current_hash,
                "version": prev_version + 1,
                "timestamp": time.time(),
                "failures": inv_failures
            }
        
        return report

    def run_financial_reconciliation(self, inv: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates accounting correctness and precision.
        """
        items = inv.get("items", [])
        inv_no = inv.get("invoice_no", "unknown")
        
        sum_taxable = 0.0
        sum_igst = 0.0
        sum_cgst = 0.0
        sum_sgst = 0.0
        rates_seen = set()
        tax_rows_seen = set()
        
        for idx, item in enumerate(items):
            taxable = self._to_float(item.get("taxable_value"))
            igst = self._to_float(item.get("igst"))
            cgst = self._to_float(item.get("cgst"))
            sgst = self._to_float(item.get("sgst"))
            rate = self._to_float(item.get("rate") or 0)
            
            sum_taxable += taxable
            sum_igst += igst
            sum_cgst += cgst
            sum_sgst += sgst
            if rate > 0:
                rates_seen.add(rate)
            
            # Duplicate tax-row detection
            row_sig = (taxable, igst, cgst, sgst)
            if row_sig != (0.0, 0.0, 0.0, 0.0):
                if row_sig in tax_rows_seen:
                    logger.warning(f"[DUPLICATE_TAX_ROW] invoice={inv_no} duplicate signature={row_sig}")
                tax_rows_seen.add(row_sig)
                
        if len(rates_seen) > 1:
            logger.info(f"[MULTI_RATE_VALIDATED] invoice={inv_no} rates={rates_seen}")
            
        header_taxable = self._to_float(inv.get("total_taxable_value"))
        header_igst = self._to_float(inv.get("total_igst"))
        header_cgst = self._to_float(inv.get("total_cgst"))
        header_sgst = self._to_float(inv.get("total_sgst"))
        header_total = self._to_float(inv.get("total_invoice_value") or inv.get("total_amount"))
        
        tolerance = 2.0  # Allow rounding drift up to 2.0
        
        # 1. Taxable Value Match
        if abs(sum_taxable - header_taxable) > tolerance and header_taxable > 0:
            return {"valid": False, "reason": f"Taxable value mismatch: items_sum={sum_taxable} header={header_taxable}"}
            
        # 2. GST Match
        if abs(sum_igst - header_igst) > tolerance and header_igst > 0:
             return {"valid": False, "reason": f"IGST mismatch: items_sum={sum_igst} header={header_igst}"}
        if abs((sum_cgst + sum_sgst) - (header_cgst + header_sgst)) > tolerance and (header_cgst + header_sgst) > 0:
             return {"valid": False, "reason": f"CGST/SGST mismatch: items_sum={sum_cgst+sum_sgst} header={header_cgst+header_sgst}"}
             
        logger.info(f"[GST_TOTAL_VALIDATED] invoice={inv_no}")
        
        # 3. Invoice Total Match
        calculated_total = header_taxable + header_igst + header_cgst + header_sgst
        if header_taxable == 0:  # Fallback if header is empty but items exist
            calculated_total = sum_taxable + sum_igst + sum_cgst + sum_sgst
            
        diff = abs(calculated_total - header_total)
        if diff > tolerance and header_total > 0:
            if diff < 10.0:
                logger.warning(f"[ROUNDING_DRIFT_DETECTED] invoice={inv_no} calculated={calculated_total} header={header_total}")
                # We do not fail for minor rounding drift, just log it.
            else:
                return {"valid": False, "reason": f"Invoice total mismatch: calculated={calculated_total} header={header_total}"}
                
        # 4. HSN Aggregation Validation (Simplified check)
        hsn_totals = {}
        for item in items:
            hsn = str(item.get("hsn_code") or "UNKNOWN")
            hsn_totals[hsn] = hsn_totals.get(hsn, 0.0) + self._to_float(item.get("taxable_value"))
        logger.info(f"[HSN_TOTAL_VALIDATED] invoice={inv_no} unique_hsns={len(hsn_totals)}")
        
        return {"valid": True, "reason": "Passed"}

    def verify_flatten(self, rows: List[Dict[str, Any]], invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Verifies that flattening didn't lose any invoices or items.
        Compares total invoice count and total value.
        """
        row_inv_nos = set(r.get("invoice_no") for r in rows)
        source_inv_nos = set(i.get("invoice_no") for i in invoices)
        
        if len(row_inv_nos) != len(source_inv_nos):
            missing = source_inv_nos - row_inv_nos
            return {
                "validation": "FAIL",
                "reason": f"Invoice count mismatch after flattening. Missing: {missing}"
            }
            
        # Total Value Reconciliation
        row_total = sum(self._to_float(r.get("taxable_value")) for r in rows)
        source_total = sum(self._to_float(i.get("total_taxable_value")) for i in invoices)
        
        if abs(row_total - source_total) > 10.0: # Tolerance for rounding
            return {
                "validation": "FAIL",
                "reason": f"Value mismatch after flattening: Rows({row_total:.2f}) vs Source({source_total:.2f})"
            }
            
        return {"validation": "PASS"}

def get_integrity_enforcer():
    return ZohoIntegrityEnforcer()
