import re
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class TableReconstructor:
    """
    Senior Table Reconstruction Engine (Zoho Invoice Context)
    Extracts ALL line items from inconsistent tables without data loss.
    Handles misaligned, multi-line, and broken table rows.
    """

    def __init__(self):
        # Step 6: Non-item / Footer patterns
        self.non_item_patterns = [
            r"\bTOTAL\b", r"\bSUBTOTAL\b", r"\bCGST\b", r"\bSGST\b", 
            r"\bIGST\b", r"\bROUND\s*OFF\b", r"\bNET\s*AMOUNT\b",
            r"\bTAX\s*AMOUNT\b", r"\bGRAND\s*TOTAL\b",
            r"HSN\s*SUMMARY", r"BANK\s*DETAILS", r"DECLARATION",
            r"AMOUNT\s*CHARGEABLE", r"OUTPUT\s*CGST", r"OUTPUT\s*SGST",
            r"CARRIED\s*OVER", r"BROUGHT\s*FORWARD", r"SUMMARY\s*TABLE",
            r"TAX\s*SUMMARY"
        ]
        self.continuation_patterns = [
            r"CONTINUED", r"NEXT\s*PAGE", r"P\.T\.O", r"CARRIED\s*OVER"
        ]

    def _to_float(self, val: Any) -> float:
        if val is None or val == "": return 0.0
        try:
            if isinstance(val, str):
                # Handle formatted numbers like 1,234.56
                cleaned = val.replace(",", "")
                cleaned = "".join(c for c in cleaned if c.isdigit() or c == ".")
                return float(cleaned) if cleaned else 0.0
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    def is_non_item_row(self, text: str) -> bool:
        """Step 6: Filter Non-Item Rows."""
        if not text or not text.strip():
            return True
        
        # Explicit starts_with checks for totals
        upper_text = text.upper().strip()
        if upper_text.startswith("TOTAL") or upper_text.startswith("CGST") or upper_text.startswith("SGST"):
            logger.info(f"[FOOTER ROW REJECTED] Starts with total/tax keyword: {text}")
            return True

        for p in self.non_item_patterns:
            if re.search(p, text, re.IGNORECASE):
                logger.info(f"[FOOTER ROW REJECTED] Matched footer pattern '{p}': {text}")
                return True
        
        for cp in self.continuation_patterns:
            if re.search(cp, text, re.IGNORECASE):
                logger.info(f"[PAGE CONTINUATION DETECTED] {text}")
                return True

        return False

    def classify_numeric_roles(self, row_numbers: List[float], provided_amount: float = 0) -> Dict[str, float]:
        """
        Step 1: Numeric Role Classification
        Determines which number is Qty, Rate, and Amount based on math.
        """
        if not row_numbers:
            return {"qty": 1.0, "rate": provided_amount, "amount": provided_amount}

        # Sort numbers descending to find potential Amount
        nums = sorted(row_numbers, reverse=True)
        potential_amount = nums[0] if nums else provided_amount
        other_nums = nums[1:] if len(nums) > 1 else [1.0]

        # Step 2: Validate Item Row (amount ≈ quantity × rate)
        # Try to find a combination that works
        best_match = {"qty": 1.0, "rate": potential_amount, "amount": potential_amount, "confidence": 0.5}
        
        for i, qty in enumerate(other_nums):
            for j, rate in enumerate(other_nums):
                # Try both ways (qty and rate can be swapped)
                calc_total = round(qty * rate, 2)
                if abs(calc_total - potential_amount) < 0.1:
                    return {"qty": qty, "rate": rate, "amount": potential_amount, "confidence": 0.95}

        # Step 6: Correction Logic (Fallback: Amount / Qty = Rate)
        # If no perfect match, assume largest is amount and smallest > 0 is qty
        qty = min([n for n in other_nums if n > 0] or [1.0])
        rate = round(potential_amount / qty, 2) if qty > 0 else potential_amount
        
        return {"qty": qty, "rate": rate, "amount": potential_amount, "confidence": 0.7}

    def reconstruct(self, raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Main Engine Logic (Steps 1-7)
        Input: List of raw extraction objects
        Output: Fully reconstructed and mathematically validated item list
        """
        if not raw_items:
            return []

        reconstructed_items = []
        pending_desc = ""
        pending_hsn = ""

        for item in raw_items:
            desc = str(item.get("description") or item.get("item_name") or "").strip()
            hsn = str(item.get("hsn_sac") or item.get("hsn") or "").strip()
            
            if self.is_non_item_row(desc):
                continue

            # Collect all numeric values from the item object to re-classify roles
            row_vals = [
                self._to_float(item.get("qty") or item.get("quantity")),
                self._to_float(item.get("rate") or item.get("item_rate")),
                self._to_float(item.get("taxable_value") or item.get("taxable_amount") or item.get("amount"))
            ]
            row_vals = [v for v in row_vals if v > 0]
            
            provided_amount = self._to_float(item.get("taxable_value") or item.get("amount"))
            
            # Step 1 & 2: Classify and Validate
            roles = self.classify_numeric_roles(row_vals, provided_amount)
            
            # STRICT VALIDATION: Must have description, qty, rate, and amount
            is_detail_row = (
                desc and 
                roles["qty"] > 0 and 
                roles["rate"] > 0 and 
                roles["amount"] > 0
            )

            if is_detail_row:
                full_item_name = (pending_desc + " " + desc).strip()
                logger.info(f"[DETAIL ROW DETECTED] {desc} | Qty: {roles['qty']} | Rate: {roles['rate']} | Amt: {roles['amount']}")
                
                # Step 3, 4, 5: Tax extraction and GST derivation handled in normalize.py
                reconstructed_items.append({
                    "description": full_item_name,
                    "qty": roles["qty"],
                    "rate": roles["rate"],
                    "taxable_value": roles["amount"],
                    "uom": item.get("uom") or item.get("unit") or item.get("quantity_uom") or "",
                    "hsn": hsn or pending_hsn,
                    "igst": self._to_float(item.get("igst") or item.get("igst_amount")),
                    "cgst": self._to_float(item.get("cgst") or item.get("cgst_amount")),
                    "sgst": self._to_float(item.get("sgst") or item.get("sgst_amount")),
                    "igst_rate": self._to_float(item.get("igst_rate")),
                    "cgst_rate": self._to_float(item.get("cgst_rate")),
                    "sgst_rate": self._to_float(item.get("sgst_rate")),
                    "confidence": roles["confidence"]
                })
                logger.info(f"[LINE ITEM ACCEPTED] {full_item_name}")
                
                pending_desc = ""
                pending_hsn = ""
            else:
                if desc:
                    logger.info(f"[LINE ITEM REJECTED] {desc} (Insufficient numeric data or missing fields)")
                    pending_desc = (pending_desc + " " + desc).strip()
                if hsn:
                    pending_hsn = hsn

        # Final check for any dangling description that isn't just a footer
        if pending_desc and not self.is_non_item_row(pending_desc):
            logger.info(f"[SUMMARY TABLE DETECTED] Processing remaining text: {pending_desc}")
            # If it has some numeric content but failed strict detail check, add as low confidence
            # but only if it's not obviously a total
            reconstructed_items.append({
                "description": pending_desc,
                "qty": 1.0,
                "rate": 0.0,
                "taxable_value": 0.0,
                "uom": "",
                "hsn": pending_hsn,
                "confidence": 0.1
            })

        if reconstructed_items:
            logger.info(f"ENGINE: Reconstructed {len(reconstructed_items)} items with mathematical validation.")
        return reconstructed_items

def get_table_reconstructor():
    return TableReconstructor()
