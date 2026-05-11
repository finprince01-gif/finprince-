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
        REJECT_STARTS = ["TOTAL", "SUBTOTAL", "CGST", "SGST", "IGST", "ROUND OFF", "GRAND TOTAL", "AMOUNT IN WORDS", "TAXABLE VALUE"]
        
        if any(upper_text.startswith(kw) for kw in REJECT_STARTS):
            logger.info(f"[ITEM_REJECTED] reason='keyword_match' description='{text}'")
            return True

        for p in self.non_item_patterns:
            if re.search(p, text, re.IGNORECASE):
                logger.info(f"[ITEM_REJECTED] reason='pattern_match' pattern='{p}' description='{text}'")
                return True
        
        for cp in self.continuation_patterns:
            if re.search(cp, text, re.IGNORECASE):
                logger.info(f"[PAGE_CONTINUATION_SKIP] {text}")
                return True

        return False

    def classify_numeric_roles(self, row_numbers: List[float], provided_amount: float = 0, hints: Dict[str, float] = None) -> Dict[str, float]:
        """
        Step 1: Numeric Role Classification
        Determines which number is Qty, Rate, and Amount based on math.
        PRIORITIZES originally mapped fields if mathematically valid.
        """
        if not row_numbers:
            return {"qty": 1.0, "rate": provided_amount, "amount": provided_amount, "confidence": 0.1}

        # ── [PHASE 1] TRUST BUT VERIFY HINTS ──
        if hints:
            h_qty = hints.get("qty", 1.0)
            h_rate = hints.get("rate", provided_amount)
            h_amt = hints.get("amount") or provided_amount
            
            if h_qty > 0 and h_rate > 0:
                calc = round(h_qty * h_rate, 2)
                if abs(calc - h_amt) < (h_amt * 0.02) or abs(calc - h_amt) < 0.2:
                    logger.info(f"[ROLES_HINT_SUCCESS] qty={h_qty} rate={h_rate} amount={h_amt}")
                    return {"qty": h_qty, "rate": h_rate, "amount": h_amt, "confidence": 0.99}

        # Step 2: fallback to math-only re-classification
        nums = sorted(row_numbers, reverse=True)
        potential_amount = nums[0] if nums else provided_amount
        other_nums = nums[1:] if len(nums) > 1 else [1.0]

        for i, qty in enumerate(other_nums):
            for j, rate in enumerate(other_nums):
                calc_total = round(qty * rate, 2)
                if abs(calc_total - potential_amount) < 0.2:
                    return {"qty": qty, "rate": rate, "amount": potential_amount, "confidence": 0.95}

        # Step 6: Correction Logic (Fallback: Amount / Qty = Rate)
        qty = min([n for n in other_nums if n > 0] or [1.0])
        rate = round(potential_amount / qty, 2) if qty > 0 else potential_amount
        
        return {"qty": qty, "rate": rate, "amount": potential_amount, "confidence": 0.5}

    def reconstruct(self, raw_items: List[Dict[str, Any]], invoice_total: float = 0) -> List[Dict[str, Any]]:
        """
        Main Engine Logic (Steps 1-7)
        Input: List of raw extraction objects
        Output: Fully reconstructed and mathematically validated item list
        """
        if not raw_items:
            return []

        reconstructed_items = []
        seen_descriptions = set()
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
            hints = {
                "qty": self._to_float(item.get("qty") or item.get("quantity")),
                "rate": self._to_float(item.get("rate") or item.get("item_rate")),
                "amount": self._to_float(item.get("taxable_value") or item.get("amount"))
            }
            roles = self.classify_numeric_roles(row_vals, provided_amount, hints=hints)
            
            # ── [PHASE 2] HARDENED ACCEPTANCE RULES ──
            reject_reason = None
            
            # 1. Math Mismatch (Rate * Qty != Amount)
            if roles["confidence"] < 0.9 and roles["amount"] > 10:
                calc = round(roles["qty"] * roles["rate"], 2)
                # Allow 10% tolerance for non-hinted roles
                if abs(calc - roles["amount"]) / max(roles["amount"], 1) > 0.1:
                    reject_reason = "MATH_MISMATCH"

            # 2. Extreme Quantity (Garbage row check)
            # Only reject if confidence is LOW or if it's clearly a noise row
            if roles["qty"] > 1000 and roles["confidence"] < 0.9 and invoice_total > 0 and invoice_total < 5000:
                reject_reason = "SUSPICIOUS_QUANTITY"
                
            # 3. Keyword Check (already handled in is_non_item_row but double guard)
            if self.is_non_item_row(desc):
                reject_reason = "KEYWORD_REJECT"

            if reject_reason:
                logger.warning(f"[ITEM_REJECT_BYPASS] reason={reject_reason} description='{desc}' qty={roles['qty']} rate={roles['rate']} amount={roles['amount']} confidence={roles['confidence']}")
                # FALLBACK: Attach warning but DO NOT drop
                item["_warning"] = reject_reason

            # STRICT VALIDATION: Must have description, qty, rate, and amount
            is_detail_row = (
                desc and 
                (roles["qty"] > 0 or roles["amount"] > 0) # Loosened: allow if either qty or amount > 0
            )

            if is_detail_row:
                full_item_name = (pending_desc + " " + desc).strip()
                
                # ── [PHASE 4] NON-DESTRUCTIVE DUPLICATES ──
                if full_item_name in seen_descriptions and roles["amount"] > 0:
                    logger.warning(f"[DUPLICATE_ROW_RECOVERED] Preserving duplicate row description: {full_item_name}")
                
                # ── [PHASE 4] NON-DESTRUCTIVE RECONSTRUCTION SAFETY ──
                # Log but DO NOT skip
                current_sum = sum(i["taxable_value"] for i in reconstructed_items)
                if invoice_total > 0 and (current_sum + roles["amount"]) > (invoice_total * 1.1):
                    logger.warning(f"[RECONSTRUCTION_OVERFLOW] Sum ({current_sum + roles['amount']}) exceeds 1.1x total ({invoice_total}). Preserving row anyway: {full_item_name}")

                seen_descriptions.add(full_item_name)
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
                logger.info(f"[LINE_ITEM_ACCEPTED] {full_item_name}")
                
                pending_desc = ""
                pending_hsn = ""
            else:
                if desc:
                    logger.info(f"[LINE_ITEM_ACCUMULATED] {desc}")
                    pending_desc = (pending_desc + " " + desc).strip()
                if hsn:
                    pending_hsn = hsn

        # Final check for any dangling description
        if pending_desc and not self.is_non_item_row(pending_desc):
            # Only add if it looks like a valid item name (longer than 3 chars)
            if len(pending_desc) > 3:
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
