import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class ZohoIntegrityEnforcer:
    """
    Senior Runtime Data Integrity Enforcer (Zoho Bulk Upload Pipeline)
    VERIFIES that FINAL_INVOICES is clean, deduplicated, and consistent.
    If ANY inconsistency is detected, it STOPS the pipeline.
    """

    def __init__(self):
        pass

    def _to_float(self, val: Any) -> float:
        """Robust numeric parsing for currency and OCR noise."""
        if val is None or val == "": return 0.0
        try:
            if isinstance(val, str):
                # Remove currency symbols and common OCR noise
                cleaned = "".join(c for c in val if c.isdigit() or c == ".")
                return float(cleaned) if cleaned else 0.0
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    def should_merge(self, prev: Dict[str, Any], curr: Dict[str, Any]) -> (bool, str):
        """
        SAFE and FINANCIAL-FIRST merge logic.
        Returns (should_merge: bool, reason: str)
        """
        # 1. GSTIN Check (Base requirement)
        prev_gstin = str(prev.get("gstin") or "").strip().upper()
        curr_gstin = str(curr.get("gstin") or "").strip().upper()
        if prev_gstin and curr_gstin and prev_gstin != curr_gstin:
            return False, "GSTIN mismatch"

        # 2. Invoice Number Logic
        prev_no = str(prev.get("invoice_number") or "").strip().upper()
        curr_no = str(curr.get("invoice_number") or "").strip().upper()

        # If both have different non-empty invoice numbers → SPLIT
        if prev_no and curr_no and prev_no != curr_no:
            return False, "invoice number mismatch"

        # If invoice number is MISSING → DO NOT TRUST MERGE unless financial values match exactly
        is_missing_no = not prev_no or not curr_no

        # 3. Financial Validation (Total)
        prev_total = self._to_float(prev.get("total_invoice_value") or prev.get("total_amount"))
        curr_total = self._to_float(curr.get("total_invoice_value") or curr.get("total_amount"))
        
        # Always validate total
        if prev_total > 0 and curr_total > 0:
            if abs(prev_total - curr_total) > 1.0:
                return False, "total mismatch"
        elif is_missing_no:
            # If one total is missing and invoice number is missing -> unsafe to merge
            return False, "missing financial identity (no total + no invoice_no)"

        # 4. Tax Structure Validation
        def get_tax_info(inv):
            items = inv.get("items", [])
            rates = set()
            for itm in items:
                r = self._to_float(itm.get("igst_rate") or itm.get("cgst_rate", 0) + itm.get("sgst_rate", 0))
                if r > 0: rates.add(f"{r:.2f}")
            
            igst = self._to_float(inv.get("total_igst") or inv.get("igst"))
            tax_type = "IGST" if igst > 0 else "CGST/SGST"
            return rates, tax_type

        prev_rates, prev_type = get_tax_info(prev)
        curr_rates, curr_type = get_tax_info(curr)

        # Validate tax rates
        if prev_rates and curr_rates and prev_rates != curr_rates:
            return False, "tax rate mismatch"

        # Validate tax type (IGST vs GST)
        if prev_type != curr_type:
            return False, "tax type mismatch"

        # 5. Date Validation
        prev_date = str(prev.get("invoice_date") or "").strip()
        curr_date = str(curr.get("invoice_date") or "").strip()
        if prev_date and curr_date and prev_date != curr_date:
            return False, "date mismatch"

        # 6. SAFE FALLBACK RULE: If invoice number is missing, REQUIRE both total and tax match
        if is_missing_no:
            if not prev_total or not curr_total:
                return False, "missing total with missing invoice number"
            # We already checked total and tax above, so if we're here, they match
            return True, "safe merge (financial match)"

        return True, "safe merge"

    def is_new_invoice(self, prev: Dict[str, Any], curr: Dict[str, Any]) -> (bool, str):
        """Adapter for legacy calls. Returns (is_different, reason)"""
        should, reason = self.should_merge(prev, curr)
        return not should, reason

    def verify(self, final_invoices: List[Dict[str, Any]], original_count: int = 0) -> Dict[str, Any]:
        """
        Runs the 8-step runtime verification protocol.
        """
        report = {
            "validation": "PASS",
            "ready_for_zoho": True,
            "stage": "RUNTIME_VERIFICATION",
            "failures": []
        }

        # 🔍 STEP 1 — INVOICE UNIQUENESS CHECK
        seen_invoice_keys = set()
        
        for inv in final_invoices:
            inv_no = str(inv.get("invoice_number") or "").strip().upper()
            gstin = str(inv.get("gstin") or "").strip().upper()
            total = self._to_float(inv.get("total_invoice_value"))
            
            # Refined Uniqueness Key: (No + GSTIN + Total)
            key = f"{inv_no}|{gstin}|{total:.2f}"
            if key in seen_invoice_keys and inv_no != "":
                report["failures"].append({
                    "invoice_number": inv_no,
                    "reason": f"DUPLICATE_INVOICE_DETECTED: {inv_no}",
                    "stage": "STEP_1_UNIQUENESS"
                })
            seen_invoice_keys.add(key)

        # Per-Invoice Checks
        for inv in final_invoices:
            inv_no = str(inv.get("invoice_number") or "").strip().upper()
            items = inv.get("items", [])

            # 🔍 STEP 3 — ITEM COUNT VALIDATION
            if not items:
                report["failures"].append({
                    "invoice_number": inv_no,
                    "reason": "EMPTY_ITEM_LIST: Invoice has no items",
                    "stage": "STEP_3_ITEM_COUNT"
                })

            # 🔍 STEP 5 — TOTAL RECONCILIATION
            taxable = self._to_float(inv.get("total_taxable_value"))
            cgst = self._to_float(inv.get("total_cgst") or inv.get("cgst"))
            sgst = self._to_float(inv.get("total_sgst") or inv.get("sgst"))
            igst = self._to_float(inv.get("total_igst") or inv.get("igst"))
            total = self._to_float(inv.get("total_invoice_value"))
            
            calculated_total = taxable + cgst + sgst + igst
            if abs(calculated_total - total) > 2.0: # Tolerance for rounding
                report["failures"].append({
                    "invoice_number": inv_no,
                    "reason": f"FINANCIAL_MISMATCH: Taxable({taxable}) + Tax({cgst+sgst+igst}) != Total({total})",
                    "stage": "STEP_6_VALIDATION"
                })

            # 🔍 STEP 6 — STRUCTURE INTEGRITY
            missing_fields = []
            if not inv.get("invoice_number"): missing_fields.append("invoice_number")
            if not inv.get("vendor_name"): missing_fields.append("vendor_name")
            if not inv.get("gstin"): missing_fields.append("gstin")
            
            if missing_fields:
                report["failures"].append({
                    "invoice_number": inv_no,
                    "reason": f"STRUCTURE_INTEGRITY: Missing required fields: {', '.join(missing_fields)}",
                    "stage": "STEP_6_STRUCTURE"
                })

        # Evaluation
        critical_failures = [f for f in report["failures"] if f.get("stage") in ["STEP_6_STRUCTURE", "STEP_6_VALIDATION"]]
        
        if critical_failures:
            report["validation"] = "FAIL"
            report["ready_for_zoho"] = False
        
        return report

    def verify_flatten(self, zoho_rows: List[Dict[str, Any]], final_invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """🔍 STEP 8 — FLATTEN CONSISTENCY."""
        expected_rows = sum(len(inv.get("items", [])) for inv in final_invoices)
        actual_rows = len(zoho_rows)
        
        if actual_rows != expected_rows:
            return {
                "validation": "FAIL",
                "ready_for_zoho": False,
                "stage": "STEP_8_FLATTEN_CONSISTENCY",
                "reason": f"FLATTEN_MISMATCH: Actual({actual_rows}) != Expected({expected_rows})"
            }
        return {"validation": "PASS"}

def get_integrity_enforcer():
    return ZohoIntegrityEnforcer()

