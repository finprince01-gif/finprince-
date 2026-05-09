import re
import logging
from typing import List, Dict, Any
from collections import defaultdict

logger = logging.getLogger(__name__)

class ForensicMerger:
    """
    Senior Forensic Pipeline Debugger
    Objective: Detect, group, and MERGE duplicate invoice copies (ORIGINAL / DUPLICATE / TRANSPORT COPY)
    Ensures NO data loss before Zoho mapping.
    """

    def __init__(self):
        # Step 1 Patterns
        self.copy_patterns = {
            "original": r"ORIGINAL\s*FOR\s*RECIPIENT",
            "duplicate": r"DUPLICATE\s*FOR\s*TRANSPORTER",
            "triplicate": r"TRIPLICATE",
            "copy": r"\bCOPY\b",
            "transport_copy": r"TRANSPORT\s*COPY"
        }
        self.traces = []

    def _to_float(self, val: Any) -> float:
        if val is None or str(val).strip() == "":
            return 0.0
        try:
            cleaned = re.sub(r'[^\d.-]', '', str(val))
            return float(cleaned) if cleaned else 0.0
        except:
            return 0.0

    def log_trace(self, prev, curr, decision, reason):
        prev_total = self._to_float(prev.get("total_invoice_value") or prev.get("total_amount"))
        curr_total = self._to_float(curr.get("total_invoice_value") or curr.get("total_amount"))
        
        # Get tax info for logging
        def get_tax_summary(inv):
            igst = self._to_float(inv.get("total_igst") or inv.get("igst"))
            taxable = self._to_float(inv.get("total_taxable_value"))
            if igst > 0: return f"IGST: {igst:.2f}"
            cgst = self._to_float(inv.get("total_cgst") or inv.get("cgst"))
            sgst = self._to_float(inv.get("total_sgst") or inv.get("sgst"))
            return f"CGST+SGST: {cgst+sgst:.2f}"

        prev_no = str(prev.get("invoice_number") or "").strip()
        curr_no = str(curr.get("invoice_number") or "").strip()
        
        trace = {
            "prev_invoice": prev_no or "MISSING",
            "curr_invoice": curr_no or "MISSING",
            "invoice_no_status": "valid" if prev_no and curr_no else "missing",
            "prev_total": f"{prev_total:.2f}",
            "curr_total": f"{curr_total:.2f}",
            "prev_tax": get_tax_summary(prev),
            "curr_tax": get_tax_summary(curr),
            "decision": decision,
            "reason": reason
        }
        self.traces.append(trace)
        logger.info(f"FORENSIC DECISION: {decision.upper()} | Reason: {reason} | InvNo: {trace['prev_invoice']} vs {trace['curr_invoice']} | Totals: {trace['prev_total']} vs {trace['curr_total']}")

    def group_invoices(self, invoices: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Step 2: Invoice-Level Deduplication (SAFE & FINANCIAL-FIRST)
        Groups by (invoice_number + gstin + total_invoice_value).
        Uses strict should_merge validation to prevent accidental merges.
        """
        from .integrity_enforcer import get_integrity_enforcer
        enforcer = get_integrity_enforcer()
        
        final_groups = [] # List of groups, each group is a list of invoices
        
        for curr in invoices:
            matched = False
            for group in final_groups:
                prev = group[0]
                
                # Rule: Must have same GSTIN to even consider merging
                prev_gstin = str(prev.get("gstin") or "").strip().upper()
                curr_gstin = str(curr.get("gstin") or "").strip().upper()
                
                if prev_gstin != curr_gstin:
                    continue

                # 🛡️ STEP 2 & 3: Redefine Merge Logic (SAFE & FINANCIAL-FIRST)
                should, reason = enforcer.should_merge(prev, curr)
                
                if not should:
                    # They are DIFFERENT, do NOT merge into this group
                    self.log_trace(prev, curr, "split", reason)
                    continue
                
                # If we reach here, they passed all strict financial and identity checks
                group.append(curr)
                matched = True
                self.log_trace(prev, curr, "merge", reason)
                break
            
            if not matched:
                final_groups.append([curr])

        # Convert list of groups to dict for compatibility with existing merge logic
        result = {}
        for i, group in enumerate(final_groups):
            first = group[0]
            inv_no = str(first.get("invoice_number") or "UNKNOWN").strip().upper()
            total = self._to_float(first.get("total_invoice_value"))
            key = f"GRP_{i}_{inv_no}_{total:.2f}"
            result[key] = group
            
        return result

    def select_best_header(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Step 4: Header Selection
        Priority: 1. ORIGINAL, 2. Most complete, 3. Best OCR.
        """
        def get_header_score(inv):
            score = 0
            copy_type = inv.get("_copy_type", "continuation")
            
            # Rule 1: ORIGINAL page priority
            if copy_type == "original":
                score += 10000
            elif copy_type != "continuation": # triplicate, duplicate, etc.
                score += 5000
                
            # Rule 2: Most complete fields
            essential_fields = [
                "invoice_number", "invoice_date", "vendor_name", 
                "gstin", "total_taxable_value", "total_invoice_value",
                "place_of_supply", "billing_address", "vendor_address"
            ]
            for field in essential_fields:
                val = inv.get(field)
                if val and str(val).strip() not in ("", "None", "—"):
                    score += 100
                    
            # Rule 3: Best OCR quality (proxy: item count and numeric validity)
            items = inv.get("items", [])
            score += len(items)
            
            # Numeric validity (qty * rate = taxable)
            valid_math_count = 0
            for itm in items:
                q = self._to_float(itm.get("qty") or itm.get("quantity"))
                r = self._to_float(itm.get("rate") or itm.get("item_rate"))
                t = self._to_float(itm.get("taxable_value") or itm.get("taxable_amount"))
                if q > 0 and r > 0 and abs((q * r) - t) < 0.1:
                    valid_math_count += 1
            score += (valid_math_count * 10)
            
            return score

        best = max(group, key=get_header_score)
        logger.info(f"FORENSIC: Selected header from copy type '{best.get('_copy_type')}' for invoice {best.get('invoice_number')}")
        return best.copy()

    def detect_copy_type(self, inv: Dict[str, Any]) -> str:
        """
        Step 1: Detect Copy Type via Regex in raw text.
        Returns: 'original', 'duplicate', 'triplicate', 'transport_copy', or 'continuation'.
        """
        raw_text = str(inv.get("_raw_text") or "").upper()
        
        for type_name, pattern in self.copy_patterns.items():
            if re.search(pattern, raw_text, re.IGNORECASE):
                return type_name
                
        # Fallback: if no copy keywords but has items, it's a 'page_result'
        return "page_result"

    def deduplicate_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Step 3: Item Deduplication
        Remove duplicate items using (item_name + qty + rate + taxable_value).
        Also handles OCR variations by selecting rows with better numeric integrity.
        """
        if not items:
            return []

        # First, group items by name and qty to handle variations in rate/amount
        item_groups = defaultdict(list)
        for itm in items:
            name = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            qty = self._to_float(itm.get("qty") or itm.get("quantity"))
            # Grouping by name+qty to apply quality filtering across multiple pages
            key = (name, qty)
            item_groups[key].append(itm)

        final_items = []
        for (name, qty), group in item_groups.items():
            if len(group) == 1:
                final_items.append(group[0])
                continue

            # Variation Handling: Prefer rows with valid math
            def item_quality_score(itm):
                q = self._to_float(itm.get("qty") or itm.get("quantity"))
                r = self._to_float(itm.get("rate") or itm.get("item_rate"))
                t = self._to_float(itm.get("taxable_value") or itm.get("taxable_amount"))
                score = 0
                if q > 0 and r > 0 and abs((q * r) - t) < 0.1: score += 100
                if q > 0: score += 10
                if r > 0: score += 10
                if t > 0: score += 10
                return score

            best_item = max(group, key=item_quality_score)
            final_items.append(best_item)

        # Step 3: Strict Deduplication (name + qty + rate + taxable_value)
        strict_deduped = []
        seen_keys = set()
        for itm in final_items:
            name = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            qty = self._to_float(itm.get("qty") or itm.get("quantity"))
            rate = self._to_float(itm.get("rate") or itm.get("item_rate"))
            amt = self._to_float(itm.get("taxable_value") or itm.get("taxable_amount"))
            
            # Step 3 Key
            key = (name, qty, f"{rate:.2f}", f"{amt:.2f}")
            if key not in seen_keys:
                strict_deduped.append(itm)
                seen_keys.add(key)

        return strict_deduped

    def merge_group(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Step 3: MERGE ALL PAGES (MANDATORY)."""
        if not group:
            return {}

        # Step 1: Detect types for all members
        for inv in group:
            inv["_copy_type"] = self.detect_copy_type(inv)

        # Step 4: Select best base header
        merged_invoice = self.select_best_header(group)

        # 🛡️ STEP 4.5: Header Backfill (NO DATA LOSS RULE)
        # If the 'best' header is missing fields that exist in other copies, fill them.
        for other in group:
            if other is merged_invoice: continue
            for k, v in other.items():
                if k == "items": continue # Items merged separately
                if not merged_invoice.get(k) or str(merged_invoice.get(k)).strip() in ("", "None", "—"):
                    if v and str(v).strip() not in ("", "None", "—"):
                        merged_invoice[k] = v
                        logger.info(f"FORENSIC: Backfilled header field '{k}' from other group member")

        # Step 3: Combine ALL items from ALL pages
        all_raw_items = []
        for inv in group:
            all_raw_items.extend(inv.get("items", []))

        # Step 5 & 6: Deduplicate and handle variations
        merged_invoice["items"] = self.deduplicate_items(all_raw_items)

        # Step 7: Validation - Sum(items) ≈ header total
        total_items_taxable = sum(self._to_float(i.get("taxable_value") or i.get("taxable_amount")) for i in merged_invoice["items"])
        header_taxable = self._to_float(merged_invoice.get("total_taxable_value"))
        
        if abs(total_items_taxable - header_taxable) > 1.0:
            merged_invoice["_forensic_warning"] = f"Taxable mismatch after merge: Items({total_items_taxable}) vs Header({header_taxable})"
            logger.warning(merged_invoice["_forensic_warning"])

        return merged_invoice

    def merge(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Main entry point for Forensic Merge."""
        invoices = data.get("invoices", [])
        if not invoices:
            return {"invoices": []}

        # Step 2: Group
        groups = self.group_invoices(invoices)
        
        # Step 3: Merge groups
        merged_invoices = []
        for key, group_list in groups.items():
            merged_invoices.append(self.merge_group(group_list))

        return {"invoices": merged_invoices}

def get_forensic_merger():
    return ForensicMerger()
