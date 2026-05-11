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
        prev_total = self._to_float(prev.get("invoice_total"))
        curr_total = self._to_float(curr.get("invoice_total"))
        
        # Get tax info for logging
        def get_tax_summary(inv):
            igst = self._to_float(inv.get("total_igst"))
            taxable = self._to_float(inv.get("total_taxable_value"))
            if igst > 0: return f"IGST: {igst:.2f}"
            cgst = self._to_float(inv.get("total_cgst"))
            sgst = self._to_float(inv.get("total_sgst"))
            return f"CGST+SGST: {cgst+sgst:.2f}"

        prev_no = str(prev.get("invoice_no") or "").strip()
        curr_no = str(curr.get("invoice_no") or "").strip()
        
        trace = {
            "prev_invoice": prev_no or "MISSING",
            "curr_invoice": curr_no or "MISSING",
            "invoice_no_status": "valid" if prev_no and curr_no else "missing",
            "prev_total": f"{prev_total:.2f}",
            "curr_total": f"{curr_total:.2f}",
            "prev_tax": get_tax_summary(prev),
            "prev_taxable": f"{self._to_float(prev.get('total_taxable_value')):.2f}",
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

        final_groups = []  # List of groups, each group is a list of invoices

        logger.info(f"[FORENSIC GROUP] Starting grouping for {len(invoices)} invoice pages")

        for curr_idx, curr in enumerate(invoices):
            curr_inv = str(curr.get("invoice_no") or "").strip() or "MISSING"
            curr_gstin = str(curr.get("gstin") or "").strip().upper() or "MISSING"
            curr_total = self._to_float(curr.get("invoice_total"))
            curr_id = curr.get("id", f"idx_{curr_idx}")

            logger.info(
                f"[FORENSIC GROUP] Processing page id={curr_id} "
                f"inv_no='{curr_inv}' gstin={curr_gstin} total={curr_total:.2f}"
            )

            matched = False
            for group_idx, group in enumerate(final_groups):
                prev = group[0]
                prev_inv = str(prev.get("invoice_no") or "").strip() or "MISSING"
                prev_gstin = str(prev.get("gstin") or "").strip().upper() or "MISSING"

                # STEP 2 & 3: Redefine Merge Logic (SAFE & FINANCIAL-FIRST)
                # The weighted enforcer now handles GSTIN tolerance.
                should, reason = enforcer.should_merge(prev, curr)

                if not should:
                    # They are DIFFERENT, do NOT merge into this group
                    logger.info(
                        f"[FORENSIC GROUP]   group[{group_idx}] SPLIT → reason='{reason}' "
                        f"prev_inv='{prev_inv}' curr_inv='{curr_inv}'"
                    )
                    
                    # ── [MULTIPAGE_SPLIT_FAILURE] Validation Assertion ──
                    raw_text = str(curr.get("_raw_text") or "")
                    if "continued to page" in raw_text.lower():
                        logger.error(f"[MULTIPAGE_SPLIT_FAILURE] page={curr.get('id')} contains continuation marker but was SPLIT from group {group_idx}")

                    self.log_trace(prev, curr, "split", reason)
                    continue

                # If we reach here, they passed all strict financial and identity checks
                logger.info(
                    f"[FORENSIC GROUP]   group[{group_idx}] MERGE → reason='{reason}' "
                    f"prev_inv='{prev_inv}' curr_inv='{curr_inv}' "
                    f"group_size_before={len(group)} group_size_after={len(group)+1}"
                )
                
                # ── [CONTINUATION_PAGE_DETECTED] Telemetry ──
                if "Continuation detected" in reason:
                    logger.info(f"[CONTINUATION_PAGE_DETECTED] invoice_no={curr_inv}")

                group.append(curr)
                matched = True
                self.log_trace(prev, curr, "merge", reason)
                break

            if not matched:
                logger.info(
                    f"[FORENSIC GROUP]   NEW GROUP[{len(final_groups)}] for inv='{curr_inv}' gstin={curr_gstin}"
                )
                final_groups.append([curr])

        logger.info(
            f"[FORENSIC GROUP DONE] {len(invoices)} pages → {len(final_groups)} distinct invoice groups"
        )

        # Convert list of groups to dict for compatibility with existing merge logic
        result = {}
        for i, group in enumerate(final_groups):
            first = group[0]
            inv_no = str(first.get("invoice_no") or "UNKNOWN").strip().upper()
            total = self._to_float(first.get("invoice_total"))
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
                "invoice_no", "invoice_date", "vendor_name", 
                "gstin", "total_taxable_value", "invoice_total",
                "place_of_supply", "bill_address_to", "bill_address_from"
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
                q = self._to_float(itm.get("qty"))
                r = self._to_float(itm.get("rate"))
                t = self._to_float(itm.get("taxable_value"))
                if q > 0 and r > 0 and abs((q * r) - t) < 0.1:
                    valid_math_count += 1
            score += (valid_math_count * 10)
            
            return score

        best = max(group, key=get_header_score)
        logger.info(f"FORENSIC: Selected header from copy type '{best.get('_copy_type')}' for invoice {best.get('invoice_no')}")
        return best.copy()

    def detect_copy_type(self, inv: Dict[str, Any]) -> str:
        """
        Step 1: Detect Copy Type via Regex in raw text.
        Returns: 'original', 'duplicate', 'triplicate', 'transport_copy', or 'continuation'.
        """
        raw_text = str(inv.get("_raw_text") or "").upper()
        
        # Check for standard copy types
        for type_name, pattern in self.copy_patterns.items():
            if re.search(pattern, raw_text, re.IGNORECASE):
                return type_name
                
        # Check for continuation roles
        from .integrity_enforcer import get_integrity_enforcer
        enforcer = get_integrity_enforcer()
        role = enforcer.classify_page(inv.get("_raw_text", ""), inv.get("items", []))
        
        if role == "PAGE_ROLE_PRIMARY":
            return "original"
        elif role in ["PAGE_ROLE_CONTINUATION", "PAGE_ROLE_TOTALS", "PAGE_ROLE_TAX_SUMMARY"]:
            return "continuation"
            
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
                q = self._to_float(itm.get("qty"))
                r = self._to_float(itm.get("rate"))
                t = self._to_float(itm.get("taxable_value"))
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
            name = str(itm.get("description") or "").strip().lower()
            qty = self._to_float(itm.get("qty"))
            rate = self._to_float(itm.get("rate"))
            amt = self._to_float(itm.get("taxable_value"))
            
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

        from .integrity_enforcer import get_integrity_enforcer
        enforcer = get_integrity_enforcer()

        # Step 1: Detect roles for all members
        for inv in group:
            role = enforcer.classify_page(inv.get("_raw_text", ""), inv.get("items", []))
            inv["_page_role"] = role
            inv["_copy_type"] = self.detect_copy_type(inv)
            # ── [PAGE_ROLE_CLASSIFIED] Telemetry ──
            logger.info(f"[PAGE_ROLE_CLASSIFIED] page={inv.get('_page_no')} role={role.replace('PAGE_ROLE_', '')}")

        # ── [MULTIPAGE_MERGE_APPLIED] Telemetry ──
        logger.info(f"[MULTIPAGE_MERGE_APPLIED] pages={[inv.get('_page_no') for inv in group]}")

        # Step 4: Select best base header (Page 1 usually)
        # Priority for Primary role
        primary_pages = [p for p in group if p.get("_page_role") == "PAGE_ROLE_PRIMARY"]
        
        # ── [MERGE_GROUP_FORENSIC] ──
        logger.info(f"[MERGE_GROUP_FORENSIC] group_size={len(group)} primary_count={len(primary_pages)}")
        for idx, p in enumerate(group):
             logger.info(f"[PAGE_KEYS_TRACE] page={p.get('_page_no')} role={p.get('_page_role')} keys={list(p.keys())}")

        if primary_pages:
            merged_invoice = self.select_best_header(primary_pages)
        else:
            merged_invoice = self.select_best_header(group)

        merged_inv_no = str(merged_invoice.get('invoice_no') or '').strip() or 'MISSING'
        
        # ── [BILL_TO_WINDOW] [SHIP_TO_WINDOW] Telemetry ──
        logger.info("[BILL_TO_WINDOW]\nstart='Buyer (Bill to)'\nend='Place of Supply'")
        logger.info("[SHIP_TO_WINDOW]\nstart='Consignee (Ship to)'\nend='Buyer (Bill to)'")

        # PRESERVE from PAGE 1 (Primary)
        # These fields should NEVER be overwritten by continuation pages
        protected_fields = [
            "bill_address_to", "bill_address_from", "place_of_supply", 
            "vendor_name", "gstin", "billing_address", "vendor_address"
        ]

        # MERGE from other pages (Continuation/Totals/Tax Summary)
        for other in group:
            if other is merged_invoice: continue
            
            other_role = other.get("_page_role")
            
            # 1. Header Backfill (only if missing in primary)
            for k, v in other.items():
                if k == "items": continue
                
                is_protected = k in protected_fields
                is_empty_in_primary = not merged_invoice.get(k) or str(merged_invoice.get(k)).strip() in ("", "None", "—")
                
                # Rule: NEVER allow continuation pages to overwrite buyer/ship-to/vendor unless missing
                if not is_protected or is_empty_in_primary:
                    if v and str(v).strip() not in ("", "None", "—"):
                        # If it's a TOTALS page, we definitely want the financial totals
                        if other_role == "PAGE_ROLE_TOTALS" and k in ["invoice_total", "total_amount", "rounded_off", "amount_in_words"]:
                            merged_invoice[k] = v
                            if k == "invoice_total":
                                logger.info(f"[TOTALS_PAGE_MERGED] invoice_total={v}")
                        # If primary is empty, fill it
                        elif is_empty_in_primary:
                            merged_invoice[k] = v

        # Step 3: Combine ALL items from ALL pages
        all_raw_items = []
        # Sort by page number to keep items in order
        sorted_group = sorted(group, key=lambda x: x.get("_page_no", 0))
        for inv in sorted_group:
            all_raw_items.extend(inv.get("items", []))
            
            # ── [ROOT-CAUSE FIX] Union Underscore Metadata (OCR/Tracing) ──
            for k, v in inv.items():
                if k.startswith("_") and (k not in merged_invoice or not merged_invoice[k]):
                    merged_invoice[k] = v

        # Deduplicate and handle variations
        merged_invoice["items"] = self.deduplicate_items(all_raw_items)

        # Final Validation
        total_items_taxable = sum(self._to_float(i.get("taxable_value")) for i in merged_invoice["items"])
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
