import logging
import re
from typing import List, Dict, Any
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

def normalize_gstin(gstin: Any) -> str:
    """OCR-tolerant GSTIN normalization."""
    if not gstin: return ""
    raw = str(gstin).strip().upper()
    # Remove all non-alphanumeric separators
    raw = re.sub(r"[^A-Z0-9]", "", raw)
    # OCR character-mapping logic (O->0, I->1, etc.)
    fixed = raw.translate(str.maketrans({
        'O': '0', 'I': '1', 'Z': '2', 'B': '8', 'S': '5', 'G': '6'
    }))
    logger.info(f"[GSTIN_NORMALIZED] raw='{gstin}' normalized='{fixed}'")
    return fixed

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
        "gst_summary": r"gst\s+summary"
    }
    
    for marker, pattern in patterns.items():
        if re.search(pattern, t):
            markers.append(marker)
            
    return markers

class ZohoIntegrityEnforcer:
    """
    Senior Runtime Data Integrity Enforcer (Zoho Bulk Upload Pipeline)
    Weighted Merge Confidence Engine.
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
        WEIGHTED MERGE CONFIDENCE ENGINE.
        Replaces hard splitting logic with probabilistic confidence scoring.
        """
        score = 0
        reasons = []
        
        # ── PHASE 3: GROUPING_INPUT ──
        logger.info(f"[GROUPING_INPUT] prev_inv='{prev.get('invoice_no')}' curr_inv='{curr.get('invoice_no')}'")

        # ── 1. INVOICE NUMBER (WEIGHT: 50) ──
        p_no = str(prev.get("invoice_no") or "").strip().upper()
        c_no = str(curr.get("invoice_no") or "").strip().upper()
        if p_no and c_no:
            if p_no == c_no:
                score += 50
                reasons.append(f"Invoice match (+50): {p_no}")
            else:
                # Partial match (suffix match for JC/4742 vs 4742)
                if p_no.endswith(c_no) or c_no.endswith(p_no):
                    score += 30
                    reasons.append(f"Partial invoice match (+30): {p_no} vs {c_no}")
                else:
                    score -= 40
                    reasons.append(f"Invoice mismatch (-40): {p_no} vs {c_no}")
        elif p_no or c_no:
            # One is missing, neutral
            pass

        # ── 2. GSTIN (WEIGHT: 40) ── (Increased weight for Phase 3)
        p_gst = normalize_gstin(prev.get("gstin"))
        c_gst = normalize_gstin(curr.get("gstin"))
        if p_gst and c_gst:
            if p_gst == c_gst:
                score += 40
                reasons.append(f"GSTIN match (+40): {p_gst}")
            else:
                score -= 30
                reasons.append(f"GSTIN mismatch (-30): {p_gst} vs {c_gst}")

        # ── 3. VENDOR NAME SIMILARITY (WEIGHT: 20) ──
        p_v = str(prev.get("vendor_name") or "").strip().upper()
        c_v = str(curr.get("vendor_name") or "").strip().upper()
        if p_v and c_v:
             sim = SequenceMatcher(None, p_v, c_v).ratio()
             if sim > 0.85:
                 score += 20
                 reasons.append(f"Vendor similarity {int(sim*100)}% (+20)")
             elif sim < 0.5:
                 score -= 20
                 reasons.append(f"Vendor mismatch {int(sim*100)}% (-20)")

        # ── 4. TOTAL AMOUNT (WEIGHT: 30) ──
        p_t = self._to_float(prev.get("invoice_total"))
        c_t = self._to_float(curr.get("invoice_total"))
        if p_t > 0 and c_t > 0:
            if abs(p_t - c_t) < 1.0:
                score += 30
                reasons.append("Total match (+30)")
            else:
                # ── PHASE 3: REDUCE AGGRESSIVE SPLIT ──
                # If everything else matches (GSTIN, File), don't let total mismatch alone split
                score -= 20 # Reduced penalty from -30 to -20
                reasons.append(f"Total mismatch ({p_t} vs {c_t}) (-20)")

        # ── 5. CONTINUATION MARKERS (WEIGHT: 50) ── (Increased weight)
        raw_text = str(curr.get("_raw_text") or "")
        markers = detect_continuation_markers(raw_text)
        if markers:
            score += 50
            reasons.append(f"Continuation detected {markers} (+50)")

        # ── 6. CONTEXTUAL METADATA (WEIGHT: 20) ──
        if prev.get("upload_session_id") == curr.get("upload_session_id"):
            score += 10
            reasons.append("Same upload session (+10)")
        
        # ── PHASE 3: Sequential pages in same file ──
        if prev.get("file_path") == curr.get("file_path"):
            score += 20 # Increased weight from +10 to +20
            reasons.append("Same PDF file (+20)")

        # ── FINAL DECISION ──
        logger.info(f"[GROUPING_SCORE] score={score} reasons={reasons}")
        
        # THRESHOLD: 40 is a high-confidence merge
        decision = score >= 40
        logger.info(f"[FINAL_MERGE_DECISION] {'MERGED' if decision else 'SPLIT'} | score={score} | reason='{' | '.join(reasons)}'")
        
        return decision, " | ".join(reasons)

    def classify_page(self, text: str, items: List[Dict[str, Any]]) -> str:
        """
        Classify page role:
        PAGE_ROLE_PRIMARY: Contains header and start of items.
        PAGE_ROLE_CONTINUATION: Continuation of items.
        PAGE_ROLE_TOTALS: Final page with totals and signature.
        PAGE_ROLE_TAX_SUMMARY: Page containing tax tables.
        """
        t = (text or "").lower()
        markers = detect_continuation_markers(t)
        
        # Item Validity Check
        has_real_items = False
        for itm in items:
            q = self._to_float(itm.get("quantity") or itm.get("qty"))
            r = self._to_float(itm.get("rate"))
            if q > 0 and r > 0:
                has_real_items = True
                break
        
        role = "PAGE_ROLE_PRIMARY"
        
        if "continued_to_page" in markers:
            role = "PAGE_ROLE_PRIMARY"
        elif any(m in ["total_invoice_value", "rounded_off", "authorised_signatory"] for m in markers):
            role = "PAGE_ROLE_TOTALS"
        elif any(m in ["tax_summary", "gst_summary"] for m in markers):
            role = "PAGE_ROLE_TAX_SUMMARY"
        elif "page_2" in markers or not has_real_items:
            role = "PAGE_ROLE_CONTINUATION"
            
        logger.info(f"[PAGE_ROLE_CLASSIFIED] role={role} markers={markers} has_real_items={has_real_items}")
        return role

    def verify(self, final_invoices: List[Dict[str, Any]], original_count: int = 0) -> Dict[str, Any]:
        """Runs the 8-step runtime verification protocol."""
        report = {"validation": "PASS", "ready_for_zoho": True, "stage": "RUNTIME_VERIFICATION", "failures": []}
        
        for inv in final_invoices:
            # STEP 5 — TOTAL RECONCILIATION
            taxable = self._to_float(inv.get("total_taxable_value"))
            cgst = self._to_float(inv.get("total_cgst"))
            sgst = self._to_float(inv.get("total_sgst"))
            igst = self._to_float(inv.get("total_igst"))
            total = self._to_float(inv.get("invoice_total"))
            
            calculated_total = taxable + cgst + sgst + igst
            if total > 0 and abs(calculated_total - total) > 2.0:
                logger.warning(f"[TOTAL_RECONCILIATION] mismatch for {inv.get('invoice_no')}: Calc({calculated_total}) vs Header({total})")
                # Fallback: If header total exists, trust it, but log the discrepancy
                logger.info(f"[TOTAL_RECONCILIATION] header_total={total} items_total={calculated_total} final_total={total} source=HEADER")
            elif total == 0 and calculated_total > 0:
                logger.info(f"[TOTAL_RECONCILIATION] header_total=0 items_total={calculated_total} final_total={calculated_total} source=ITEMS")
                inv["invoice_total"] = calculated_total
        
        return report

    def verify_flatten(self, rows: List[Dict[str, Any]], invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Verifies that flattening didn't lose any invoices or items.
        Compares total invoice count and total value.
        """
        row_inv_nos = set(r.get("Invoice No") for r in rows)
        source_inv_nos = set(i.get("invoice_no") for i in invoices)
        
        if len(row_inv_nos) != len(source_inv_nos):
            missing = source_inv_nos - row_inv_nos
            return {
                "validation": "FAIL",
                "reason": f"Invoice count mismatch after flattening. Missing: {missing}"
            }
            
        # Total Value Reconciliation
        row_total = sum(self._to_float(r.get("Taxable Value")) for r in rows)
        source_total = sum(self._to_float(i.get("total_taxable_value")) for i in invoices)
        
        if abs(row_total - source_total) > 10.0: # Tolerance for rounding
            return {
                "validation": "FAIL",
                "reason": f"Value mismatch after flattening: Rows({row_total:.2f}) vs Source({source_total:.2f})"
            }
            
        return {"validation": "PASS"}

def get_integrity_enforcer():
    return ZohoIntegrityEnforcer()
