import re
import logging
import copy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from ocr_pipeline.normalize import lossless_preserve
from typing import List, Dict, Any
from collections import defaultdict
from .integrity_enforcer import get_integrity_enforcer, hydrate_identity_fields

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

    def _to_decimal(self, val: Any) -> Decimal:
        if val is None or str(val).strip() == "":
            return Decimal("0.00")
        try:
            if isinstance(val, Decimal):
                return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            cleaned = re.sub(r'[^\d.-]', '', str(val))
            if not cleaned:
                return Decimal("0.00")
            return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError, TypeError):
            return Decimal("0.00")

    def _to_float(self, val: Any) -> float:
        if val is None or str(val).strip() == "":
            return 0.0
        try:
            cleaned = re.sub(r'[^\d.-]', '', str(val))
            return float(cleaned) if cleaned else 0.0
        except:
            return 0.0

    def log_trace(self, prev, curr, decision, reason):
        prev_total = self._to_float(prev.get("total_invoice_value"))
        curr_total = self._to_float(curr.get("total_invoice_value"))
        
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

    def is_empty_or_zero(self, val: Any) -> bool:
        """Helper to determine if a value is null, empty or zero-equivalent."""
        if val in [None, "", [], {}, 0, 0.0, "0.0", "0.00", "—", "N/A", "null", "MISSING", "nan", "NaN"]:
            return True
        if isinstance(val, Decimal):
            return val == Decimal("0.00") or val.is_zero()
        if isinstance(val, str):
            val_clean = val.strip().lower()
            if val_clean in ["", "none", "—", "missing", "nan", "null"]:
                return True
            # Check if it represents zero
            try:
                cleaned = re.sub(r'[^\d.-]', '', val_clean)
                if cleaned and Decimal(cleaned) == Decimal("0.00"):
                    return True
            except:
                pass
        return False

    def safe_merge(self, primary: Dict[str, Any], continuation: Dict[str, Any]):
        """
        Defensive merge helper (Requirement #4).
        - Preserve populated primary values.
        - Only accept continuation values when primary is empty/zero-equivalent.
        - Reject sparse overrides.
        """
        for k, v in continuation.items():
            if k == "items":
                continue
            
            primary_val = primary.get(k)
            is_pri_empty = self.is_empty_or_zero(primary_val)
            is_cont_empty = self.is_empty_or_zero(v)
            
            if is_pri_empty and not is_cont_empty:
                logger.info(f"[CONTINUATION_FIELD_ACCEPTED] field='{k}' accepted='{v}'")
                primary[k] = v
            elif not is_pri_empty and not is_cont_empty:
                if str(primary_val).strip() != str(v).strip():
                    logger.info(f"[PRIMARY_FIELD_PRESERVED] field='{k}' preserved='{primary_val}' rejected_override='{v}'")
                    # Optionally preserve longer strings if applicable, but reject zero/garbage overrides
                    if isinstance(primary_val, str) and isinstance(v, str):
                        if len(v.strip()) > len(primary_val.strip()) and not self.is_empty_or_zero(v):
                            logger.info(f"[FIELD_SOURCE_SELECTED] field='{k}' longer value selected='{v}' (was '{primary_val}')")
                            primary[k] = v
                else:
                    logger.info(f"[FIELD_SOURCE_SELECTED] field='{k}' values identical ('{primary_val}')")
            elif not is_pri_empty and is_cont_empty:
                logger.info(f"[FIELD_OVERRIDE_BLOCKED] field='{k}' preserved primary='{primary_val}' blocked continuation sparse/empty")

    def recompute_totals_if_needed(self, inv: Dict[str, Any]):
        """
        Recomputes invoice totals from line items using Decimal arithmetic
        strictly following safety preservation rules.
        """
        items = inv.get("items", [])
        invoice_no = inv.get("invoice_no", "unknown")
        
        # Check current header values using Decimal
        header_taxable = self._to_decimal(inv.get("total_taxable_value"))
        header_igst = self._to_decimal(inv.get("total_igst"))
        header_cgst = self._to_decimal(inv.get("total_cgst"))
        header_sgst = self._to_decimal(inv.get("total_sgst"))
        header_cess = self._to_decimal(inv.get("total_cess") or inv.get("cess"))
        header_invoice_val = self._to_decimal(inv.get("total_invoice_value") or inv.get("total_amount"))
        
        logger.info(f"[TOTAL_RECOMPUTE_INPUT] invoice_no='{invoice_no}' header_taxable={header_taxable} header_invoice={header_invoice_val} header_igst={header_igst} header_cgst={header_cgst} header_sgst={header_sgst} header_cess={header_cess} items_count={len(items)}")

        # Item totals calculations
        calc_taxable = Decimal("0.00")
        calc_igst = Decimal("0.00")
        calc_cgst = Decimal("0.00")
        calc_sgst = Decimal("0.00")
        calc_cess = Decimal("0.00")
        
        if items:
            for idx, item in enumerate(items):
                i_taxable = self._to_decimal(item.get("taxable_value"))
                i_igst = self._to_decimal(item.get("igst"))
                i_cgst = self._to_decimal(item.get("cgst"))
                i_sgst = self._to_decimal(item.get("sgst"))
                i_cess = self._to_decimal(item.get("cess") or item.get("cess_value"))
                
                logger.info(f"[TOTAL_COMPONENT_TRACE] invoice_no='{invoice_no}' item_index={idx} taxable={i_taxable} igst={i_igst} cgst={i_cgst} sgst={i_sgst} cess={i_cess}")
                
                calc_taxable += i_taxable
                calc_igst += i_igst
                calc_cgst += i_cgst
                calc_sgst += i_sgst
                calc_cess += i_cess

        calc_invoice_val = calc_taxable + calc_igst + calc_cgst + calc_sgst + calc_cess
        logger.info(f"[TOTAL_COMPONENT_TRACE] invoice_no='{invoice_no}' sum_calculated={calc_invoice_val} calc_taxable={calc_taxable} calc_igst={calc_igst} calc_cgst={calc_cgst} calc_sgst={calc_sgst} calc_cess={calc_cess}")

        # Check if totals are missing or empty
        taxable_missing = self.is_empty_or_zero(header_taxable)
        invoice_val_missing = self.is_empty_or_zero(header_invoice_val)

        # 1. Taxable Value Recomputation
        if taxable_missing:
            if not self.is_empty_or_zero(calc_taxable):
                logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_taxable_value' old={header_taxable} new={calc_taxable} reason='field_missing'")
                inv["total_taxable_value"] = float(calc_taxable)
        else:
            logger.info(f"[TOTAL_PRESERVED] invoice_no='{invoice_no}' field='total_taxable_value' value={header_taxable}")
            logger.info(f"[TOTAL_OVERRIDE_BLOCKED] invoice_no='{invoice_no}' field='total_taxable_value' preserved={header_taxable} rejected={calc_taxable} reason='original_field_valid'")
            inv["total_taxable_value"] = float(header_taxable)

        # 2. Tax Components Overrides (Only if missing in header)
        if self.is_empty_or_zero(header_igst) and not self.is_empty_or_zero(calc_igst):
            inv["total_igst"] = float(calc_igst)
            logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_igst' old={header_igst} new={calc_igst} reason='field_missing'")
        else:
            inv["total_igst"] = float(header_igst)

        if self.is_empty_or_zero(header_cgst) and not self.is_empty_or_zero(calc_cgst):
            inv["total_cgst"] = float(calc_cgst)
            logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_cgst' old={header_cgst} new={calc_cgst} reason='field_missing'")
        else:
            inv["total_cgst"] = float(header_cgst)

        if self.is_empty_or_zero(header_sgst) and not self.is_empty_or_zero(calc_sgst):
            inv["total_sgst"] = float(calc_sgst)
            logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_sgst' old={header_sgst} new={calc_sgst} reason='field_missing'")
        else:
            inv["total_sgst"] = float(header_sgst)

        if self.is_empty_or_zero(header_cess) and not self.is_empty_or_zero(calc_cess):
            inv["total_cess"] = float(calc_cess)
            logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_cess' old={header_cess} new={calc_cess} reason='field_missing'")
        else:
            inv["total_cess"] = float(header_cess)

        # 3. Invoice Total Value Recomputation
        if invoice_val_missing:
            if not self.is_empty_or_zero(calc_invoice_val):
                logger.info(f"[TOTAL_RECOMPUTED_SAFE] invoice_no='{invoice_no}' field='total_invoice_value' old={header_invoice_val} new={calc_invoice_val} reason='field_missing'")
                inv["total_invoice_value"] = float(calc_invoice_val)
                inv["total_amount"] = float(calc_invoice_val)
        else:
            logger.info(f"[TOTAL_PRESERVED] invoice_no='{invoice_no}' field='total_invoice_value' value={header_invoice_val}")
            logger.info(f"[TOTAL_OVERRIDE_BLOCKED] invoice_no='{invoice_no}' field='total_invoice_value' preserved={header_invoice_val} rejected={calc_invoice_val} reason='original_field_valid'")
            inv["total_invoice_value"] = float(header_invoice_val)
            inv["total_amount"] = float(header_invoice_val)

    def group_invoices(self, invoices: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        [DETERMINISTIC] Grouping with Safety Split Guards (Requirement #6)
        """
        enforcer = get_integrity_enforcer()

        final_groups = []
        consumed_page_indices = set()

        logger.info(f"[FORENSIC GROUP] Starting grouping for {len(invoices)} invoice pages")

        # Deterministic groups map: merge_key -> list of invoices
        deterministic_groups = {}
        
        for curr_idx, curr in enumerate(invoices):
            # [MANDATORY HYDRATION] (Requirement #1)
            hydrate_identity_fields(curr)
            
            curr_page_no = curr.get("_page_no")
            if curr_page_no in consumed_page_indices:
                continue

            curr_inv = str(curr.get("invoice_no") or "").strip() or "MISSING"
            curr_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper() or "MISSING"
            curr_vendor = str(curr.get("vendor_name") or "").strip().upper() or "MISSING"
            curr_date = str(curr.get("invoice_date") or "").strip() or "MISSING"
            curr_tenant = str(curr.get("tenant_id") or "").strip() or "MISSING"
            
            # ── DETERMINISTIC MERGE KEY (Requirement #11) ──
            merge_key = f"{curr_tenant}_{curr_gstin}_{curr_inv}_{curr_date}"
            is_deterministic = (curr_inv != "MISSING")
            
            # [IDENTITY_TRACE] stage=grouping_input (Requirement #10)
            logger.info(f"[IDENTITY_TRACE] stage=grouping_input page={curr_page_no} inv={curr_inv} gstin={curr_gstin} vendor={curr_vendor} merge_key={merge_key}")
            
            # [GROUP_PRECHECK] (Requirement #7)
            logger.info(f"[GROUP_PRECHECK] page={curr_page_no} inv={curr_inv} gstin={curr_gstin} vendor={curr_vendor} hydrated={bool(curr_inv != 'MISSING' or curr_gstin != 'MISSING')}")

            matched = False
            
            # 1. Deterministic Key Match
            if is_deterministic and merge_key in deterministic_groups:
                logger.info(f"[MERGE_DECISION] candidate_page={curr_page_no} decision='MERGE' reason='Deterministic key match ({merge_key})'")
                deterministic_groups[merge_key].append(curr)
                consumed_page_indices.add(curr_page_no)
                self.log_trace(deterministic_groups[merge_key][0], curr, "merge", "Deterministic key match")
                matched = True
                continue

            # 2. Sequential / Semantic Fallback (if key matching fails or lacks identity)
            for group_idx, group in enumerate(final_groups):
                prev = group[0]
                
                # ── 1. SAFETY SPLIT GUARD (Requirement #6) ──
                # If group is large and metadata starts diverging, force split.
                if len(group) >= 3:
                    inv_nos = {str(p.get("invoice_no") or "").strip() for p in group if p.get("invoice_no")}
                    gstins = {str(p.get("gstin") or "").strip() for p in group if p.get("gstin")}
                    if (curr_inv != "MISSING" and curr_inv not in inv_nos) or (curr_gstin != "MISSING" and curr_gstin not in gstins):
                        logger.info(f"[SAFETY_SPLIT_GUARD] Diversity detected in group {group_idx}. Forcing SPLIT for page {curr_page_no}")
                        continue

                # ── 2. WEIGHTED MERGE DECISION ──
                should, reason = enforcer.should_merge(prev, curr)
                
                logger.info(
                    f"[MERGE_DECISION] candidate_page={curr_page_no} current_group={[p.get('_page_no') for p in group]} "
                    f"decision={'MERGE' if should else 'SPLIT'} reason='{reason}'"
                )

                if not should:
                    continue

                # MERGE VALIDATED
                group.append(curr)
                consumed_page_indices.add(curr_page_no)
                matched = True
                
                if len(group) > 1:
                    logger.info(f"[MULTIPAGE_GROUP_CONFIRMED] inv={curr_inv} pages={len(group)} reason='{reason}'")
                
                self.log_trace(prev, curr, "merge", reason)
                
                # If this group was previously tracked deterministically, ensure the new page doesn't corrupt it
                break

            if not matched:
                logger.info(f"[NEW_INVOICE_CREATED] inv='{curr_inv}' gstin={curr_gstin} page={curr_page_no}")
                new_group = [curr]
                final_groups.append(new_group)
                consumed_page_indices.add(curr_page_no)
                if is_deterministic:
                    deterministic_groups[merge_key] = new_group

        logger.info(f"[FORENSIC GROUP DONE] {len(invoices)} pages -> {len(final_groups)} distinct groups")

        # ── 3. PRIMARY PAGE GUARANTEE (Requirement #3) ──
        validated_groups = {}
        for i, group in enumerate(final_groups):
            # Assign roles based on final group context
            for inv in group:
                inv["_page_role"] = enforcer.classify_page(inv.get("_raw_text", ""), inv.get("items", []), invoice_data=inv)
            
            primary_count = sum(1 for p in group if p.get("_page_role") == "PAGE_ROLE_PRIMARY")
            logger.info(f"[PRIMARY_CHECK] group={i} size={len(group)} primary_count={primary_count}")
            
            # Collect valid invoice numbers from all pages in the group
            group_inv_nos = [str(p.get('invoice_no') or '').strip() for p in group]
            valid_inv_nos = [n for n in group_inv_nos if n and n.upper() != 'MISSING']
            
            if not valid_inv_nos:
                # Instead of discarding, we preserve it as a new invoice (Requirement #3 & #8)
                logger.warning(f"[PAGE_PRESERVED] Group {i} has no valid invoice_no across {len(group)} pages but we will preserve it safely.")
                key = f"GRP_{i}_UNKNOWN_{i}"
                validated_groups[key] = group
                continue

            # Use unique key to avoid collision
            key = f"GRP_{i}_{valid_inv_nos[0]}"
            validated_groups[key] = group
            
            for p in group:
                logger.info(f"[PAGE_NOT_DISCARDED] Preserving page {p.get('_page_no')} in group {key}")

        return validated_groups

    def select_best_header(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Step 4: Header Selection
        Priority: 1. ORIGINAL, 2. Most complete, 3. Best OCR.
        """
        def get_header_score(inv):
            score = 0
            copy_type = inv.get("_copy_type", "continuation")
            page_role = inv.get("_page_role", "PAGE_ROLE_CONTINUATION")
            
            # Give lower score to continuation pages, but do not reject them
            if page_role != "PAGE_ROLE_PRIMARY":
                score -= 1000
            
            # Rule 1: ORIGINAL page priority
            if copy_type == "original":
                score += 10000
            elif copy_type != "continuation": # triplicate, duplicate, etc.
                score += 5000
                
            # Rule 2: Most complete fields
            essential_fields = [
                "invoice_no", "invoice_date", "vendor_name", 
                "gstin", "total_taxable_value", "total_invoice_value",
                "place_of_supply", "bill_to", "bill_from"
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
        
        logger.info(f"FORENSIC: Selected header from copy type '{best.get('_copy_type')}' for invoice {best.get('invoice_no')} score={get_header_score(best)}")
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
        [FORENSIC] Deterministic Item Deduplication.
        Dedupes if (description, amount, rate) are identical, regardless of page_no.
        """
        if not items:
            return []

        seen_keys = set()
        unique_items = []
        
        for itm in items:
            desc = str(itm.get("description") or "").strip().lower()
            amt = self._to_float(itm.get("taxable_value") or itm.get("amount"))
            rate = self._to_float(itm.get("rate") or 0.0)
            
            # Cross-page deduplication key
            key = (desc, amt, rate)
            
            if key not in seen_keys:
                seen_keys.add(key)
                unique_items.append(itm)
            else:
                logger.info(f"[ITEM_DEDUPE_GUARD] Dropping cross-page duplicate item: desc='{desc[:20]}' amt={amt} rate={rate}")
                
        return unique_items


    def merge_group(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Step 3: MERGE ALL PAGES (MANDATORY)."""
        if not group:
            return {}

        # [MERGE_GROUP_TRACE] (Requirement #5)
        for p in group:
            logger.info(f"[MERGE_GROUP_ENTRY_COUNT] page={p.get('_page_no')} items={len(p.get('items', []))}")
            
        enforcer = get_integrity_enforcer()

        # Step 1: Detect roles for all members
        for inv in group:
            # [MANDATORY HYDRATION] (Requirement #1)
            hydrate_identity_fields(inv)
            role = enforcer.classify_page(inv.get("_raw_text", ""), inv.get("items", []), invoice_data=inv)
            inv["_page_role"] = role

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
        logger.info(f"FORENSIC_MERGE_START: inv={merged_inv_no} primary_keys={list(merged_invoice.keys())}")
        
        # ── [BILL_TO_WINDOW] [SHIP_TO_WINDOW] Telemetry ──
        logger.info("[BILL_TO_WINDOW]\nstart='Buyer (Bill to)'\nend='Place of Supply'")
        logger.info("[SHIP_TO_WINDOW]\nstart='Consignee (Ship to)'\nend='Buyer (Bill to)'")

        # Defensive merge from other pages (Continuation/Totals/Tax Summary)
        for other in group:
            if other is merged_invoice:
                continue
            self.safe_merge(merged_invoice, other)

        # Step 3: Combine ALL items from ALL pages
        all_raw_items = []
        logger.info(f"[ITEM_AGGREGATION_START] inv={merged_inv_no} total_pages={len(group)}")
        
        # Sort by page number to keep items in order
        sorted_group = sorted(group, key=lambda x: x.get("_page_no", 0))
        for inv in sorted_group:
            page_no = inv.get("_page_no", 0)
            page_items = inv.get("items", [])
            
            # [ITEM_APPEND] (Requirement #4)
            added_count = len(page_items)
            
            # Ensure items carry their page context for deduplication logic
            for itm in page_items:
                if "_page_no" not in itm: itm["_page_no"] = page_no
                if "_copy_type" not in itm: itm["_copy_type"] = inv.get("_copy_type", "page_result")
                # [ITEM_BEFORE_MERGE] Trace (Requirement #3)
                logger.info(f"[ITEM_BEFORE_MERGE] page={page_no} desc='{itm.get('description', '')[:20]}' taxable={itm.get('taxable_value')}")

            all_raw_items.extend(page_items)
            logger.info(f"[ITEM_APPEND] inv={merged_inv_no} source_page={page_no} added={added_count} total={len(all_raw_items)}")
            
            # ── [ROOT-CAUSE FIX] Union Underscore Metadata (OCR/Tracing) ──
            for k, v in inv.items():
                if k.startswith("_") and (k not in merged_invoice or not merged_invoice[k]):
                    merged_invoice[k] = v

        # Deduplicate and handle variations
        merged_invoice["items"] = self.deduplicate_items(all_raw_items)
        
        # Recompute totals defensively (Requirement #6)
        self.recompute_totals_if_needed(merged_invoice)
        
        # [ITEM_AFTER_MERGE] Trace
        for itm in merged_invoice["items"]:
            logger.info(f"[ITEM_AFTER_MERGE] inv={merged_inv_no} desc='{itm.get('description', '')[:20]}' taxable={itm.get('taxable_value')}")
            
        logger.info(f"[FINAL_ITEM_COUNT] inv={merged_inv_no} items={len(merged_invoice['items'])}")
        
        logger.info(f"FORENSIC_MERGE_COMPLETE: inv={merged_inv_no} vendor='{merged_invoice.get('vendor_name')}' bill_from_len={len(str(merged_invoice.get('bill_from')))}")

        # Final Validation (Handle Title Case aliases)
        total_items_taxable = sum(self._to_float(i.get("taxable_value")) for i in merged_invoice["items"])
        header_taxable = self._to_float(merged_invoice.get("total_taxable_value"))

        # [FINAL_GROUP_METRICS] (Requirement #7)
        real_items = [i for i in merged_invoice["items"] if i.get("_is_synthetic") is not True]
        synthetic_items = [i for i in merged_invoice["items"] if i.get("_is_synthetic") is True]
        
        logger.info(f"[REAL_ITEM_COUNT] inv={merged_inv_no} count={len(real_items)}")
        logger.info(f"[SYNTHETIC_ITEM_COUNT] inv={merged_inv_no} count={len(synthetic_items)}")
        logger.info(f"[FINAL_GROUP_ITEM_COUNT] inv={merged_inv_no} count={len(merged_invoice['items'])}")
        logger.info(f"[EXPORT_FINAL_ROW] inv={merged_invoice.get('invoice_no')} name={merged_invoice.get('vendor_name')} total={merged_invoice.get('total_invoice_value')}")

        if len(real_items) == 0:
             logger.warning(f"[EXTRACTION_DEGRADED] inv={merged_inv_no} No real items found.")
             merged_invoice["_status"] = "DEGRADED"

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
