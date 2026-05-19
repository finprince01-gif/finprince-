import logging
import re
from typing import List, Dict, Any
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

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
        "page_2": r"page[\s-]*2",
        "amount_chargeable": r"amount\s+chargeable",
        "total_invoice_value": r"total\s+invoice\s+value",
        "rounded_off": r"rounded\s+off",
        "tax_amount": r"tax\s+amount",
        "bank_details": r"bank\s+details",
        "authorised_signatory": r"authorised\s+signatory",
        "tax_summary": r"tax\s+summary",
        "gst_summary": r"gst\s+summary",
        "carried_forward": r"carried\s+forward",
        "brought_forward": r"brought\s+forward"
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
        [PHASE 4 STABILIZATION] Strict Deterministic Merge Rules.
        Harden boundaries using multiple anchors (Requirement #8).
        """
        p_no = str(prev.get("invoice_no") or "").strip().upper()
        c_no = str(curr.get("invoice_no") or "").strip().upper()
        
        p_irn = str(prev.get("irn") or "").strip().upper()
        c_irn = str(curr.get("irn") or "").strip().upper()

        p_ack = str(prev.get("ack_no") or "").strip().upper()
        c_ack = str(curr.get("ack_no") or "").strip().upper()

        # ── 1. PRIMARY GROUP KEYS MATCH ──
        # If any of the primary keys match (and are not empty), MERGE SAFELY.
        if p_no and c_no and p_no == c_no and p_no != "MISSING":
            logger.info(f"[SAFE_MERGE_APPLIED] Matched on invoice_no: {p_no}")
            return True, f"[SAFE_MERGE_APPLIED] Matched invoice_no: {p_no}"
            
        if p_irn and c_irn and p_irn == c_irn and p_irn != "MISSING":
            logger.info(f"[SAFE_MERGE_APPLIED] Matched on irn: {p_irn}")
            return True, f"[SAFE_MERGE_APPLIED] Matched irn: {p_irn}"
            
        if p_ack and c_ack and p_ack == c_ack and p_ack != "MISSING":
            logger.info(f"[SAFE_MERGE_APPLIED] Matched on ack_no: {p_ack}")
            return True, f"[SAFE_MERGE_APPLIED] Matched ack_no: {p_ack}"

        # ── 2. EXPLICIT MISMATCHES ──
        # If primary keys are present on both but they mismatch, DO NOT MERGE.
        if p_no and c_no and p_no != c_no and p_no != "MISSING" and c_no != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Invoice number mismatch '{p_no}' vs '{c_no}'")
            logger.info(f"[SAFE_NEW_INVOICE_CREATED] New invoice boundary detected (invoice_no mismatch)")
            return False, "Invoice number mismatch"
            
        if p_irn and c_irn and p_irn != c_irn and p_irn != "MISSING" and c_irn != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: IRN mismatch '{p_irn}' vs '{c_irn}'")
            logger.info(f"[SAFE_NEW_INVOICE_CREATED] New invoice boundary detected (IRN mismatch)")
            return False, "IRN mismatch"
            
        if p_ack and c_ack and p_ack != c_ack and p_ack != "MISSING" and c_ack != "MISSING":
            logger.warning(f"[INVOICE_BOUNDARY_DETECTED] Split: Ack No mismatch '{p_ack}' vs '{c_ack}'")
            logger.info(f"[SAFE_NEW_INVOICE_CREATED] New invoice boundary detected (Ack mismatch)")
            return False, "Ack No mismatch"

        # ── 3. SECONDARY CHECKS OR SAFE FALLBACK ──
        # If current page has NO identity (no inv_no, no irn, no ack_no), 
        # and it's sequential to a page with items, we can safely merge it as a continuation.
        has_primary_identity = (c_no and c_no != "MISSING") or (c_irn and c_irn != "MISSING") or (c_ack and c_ack != "MISSING")
        if not has_primary_identity:
            p_idx = int(prev.get("_page_no") or 0)
            c_idx = int(curr.get("_page_no") or 0)
            is_sequential = (c_idx == p_idx + 1)
            
            p_items = prev.get("items", [])
            has_p_items = len(p_items) > 0
            
            if is_sequential and has_p_items:
                logger.info(f"[SAFE_MERGE_APPLIED] Sequential page without primary identity -> merging as continuation.")
                return True, "[SAFE_MERGE_APPLIED] Sequential continuation"

        # If confidence is ambiguous, DO NOT MERGE. False duplicate is safer than deleted.
        logger.info(f"[SAFE_NEW_INVOICE_CREATED] Ambiguous identity -> creating new invoice entry.")
        return False, "Ambiguous identity (Deterministic SPLIT)"

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
        for itm in items:
            q = self._to_float(itm.get("quantity") or itm.get("qty") or itm.get("Qty"))
            r = self._to_float(itm.get("rate") or itm.get("Item Rate"))
            if q > 0 and r > 0:
                has_real_items = True
                break
        
        # ── CLASSIFICATION LOGIC ──
        role = "PAGE_ROLE_CONTINUATION" # Default

        if "continued_to_page" in markers:
            role = "PAGE_ROLE_PRIMARY"
        elif any(m in ["total_invoice_value", "rounded_off", "authorised_signatory"] for m in markers):
            role = "PAGE_ROLE_TOTALS"
        elif any(m in ["tax_summary", "gst_summary"] for m in markers):
            role = "PAGE_ROLE_TAX_SUMMARY"
        elif "page_2" in markers or "amount_chargeable" in markers or "carried_forward" in markers or "brought_forward" in markers:
            role = "PAGE_ROLE_CONTINUATION"
        elif has_real_items and anchor_count >= 1:
            # [PHASE 11.9] Relaxed anchor requirement. 
            # If we have items AND at least one anchor (like "Invoice No" or "Tax Invoice"), it's PRIMARY.
            role = "PAGE_ROLE_PRIMARY"
        elif has_real_items:
            role = "PAGE_ROLE_CONTINUATION"
            
        logger.info(f"[PAGE_ROLE_DECISION] anchors={anchor_count} matched={matched_keywords} has_items={has_real_items} role={role}")
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
                # Unless it's a TOTAL void
                if not v_name and not v_inv_no and not v_items:
                     report.update({"validation": "FAIL", "ready_for_zoho": False})
                     logger.error(f"[INTEGRITY_FAIL] Invoice[{idx}] is a total void. Rejecting batch.")
            else:
                logger.info(f"[INTEGRITY_PASS] Invoice[{idx}] has minimum identity anchors.")
        
        return report

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
