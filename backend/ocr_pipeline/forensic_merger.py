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
        header_round_off = self._to_decimal(inv.get("round_off"))
        header_invoice_val = self._to_decimal(inv.get("total_invoice_value") or inv.get("total_amount"))
        
        # ── EXTRACT ROUND OFF ──
        ocr_text = inv.get("_pdf_ocr_text", "")
        
        # Look for round off in OCR text if missing from header
        if self.is_empty_or_zero(header_round_off) and ocr_text:
            ro_match = re.search(r'(?i)(?:Round\s*Off|Rounding\s*Adjustment|Adjustment|Final\s*Adjustment)\s*[:/-]?\s*([+-]?[0-9]*\.[0-9]{1,2})', ocr_text)
            if ro_match:
                header_round_off = self._to_decimal(ro_match.group(1))
                logger.info(f"[ROUND_OFF_DETECTED] invoice_no='{invoice_no}' source='ocr' value={header_round_off}")
                inv["round_off"] = float(header_round_off)
        elif not self.is_empty_or_zero(header_round_off):
            logger.info(f"[ROUND_OFF_CANDIDATE] invoice_no='{invoice_no}' value={header_round_off}")
        
        logger.info(f"[TOTAL_RECOMPUTE_INPUT] invoice_no='{invoice_no}' header_taxable={header_taxable} header_invoice={header_invoice_val} header_igst={header_igst} header_cgst={header_cgst} header_sgst={header_sgst} header_cess={header_cess} header_round_off={header_round_off} items_count={len(items)}")

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

        calc_invoice_val = calc_taxable + calc_igst + calc_cgst + calc_sgst + calc_cess + header_round_off
        logger.info(f"[TOTAL_COMPONENT_TRACE] invoice_no='{invoice_no}' sum_calculated={calc_invoice_val} calc_taxable={calc_taxable} calc_igst={calc_igst} calc_cgst={calc_cgst} calc_sgst={calc_sgst} calc_cess={calc_cess} round_off={header_round_off}")

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
            delta = calc_invoice_val - header_invoice_val
            if delta != 0:
                logger.info(f"[TOTAL_DELTA_ANALYSIS] invoice_no='{invoice_no}' header={header_invoice_val} calc={calc_invoice_val} delta={delta}")
            
            logger.info(f"[TOTAL_PRESERVED] invoice_no='{invoice_no}' field='total_invoice_value' value={header_invoice_val}")
            logger.info(f"[TOTAL_OVERRIDE_BLOCKED] invoice_no='{invoice_no}' field='total_invoice_value' preserved={header_invoice_val} rejected={calc_invoice_val} reason='original_field_valid'")
            logger.info(f"[HEADER_TOTAL_LOCKED] invoice_no='{invoice_no}' preserved_total={header_invoice_val}")
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
        logger.info(f"[GROUPING_START] total_pages={len(invoices)}")

        # ── 1. PAGE CLASSIFICATION BEFORE GROUPING ──
        from .integrity_enforcer import detect_continuation_markers

        # Step 1.1: Hydrate all pages first
        for curr in invoices:
            # [MANDATORY HYDRATION] (Requirement #1)
            hydrate_identity_fields(curr)

        # Step 1.2: Cross-page identity stabilization pass (majority vote reconciliation)
        invoice_no_groups = defaultdict(list)
        for curr in invoices:
            inv_no = str(curr.get("invoice_no") or "").strip().upper()
            if inv_no and inv_no not in ("MISSING", "NONE", "—", "NULL", "N/A"):
                invoice_no_groups[inv_no].append(curr)

        for inv_no, group_pages in invoice_no_groups.items():
            if len(group_pages) > 1:
                # Reconcile GSTIN
                gstin_votes = defaultdict(int)
                for p in group_pages:
                    g = str(p.get("gstin") or p.get("vendor_gstin") or "").strip().upper()
                    if g and g not in ("MISSING", "NONE", "—", "NULL", "N/A"):
                        gstin_votes[g] += 1
                if gstin_votes:
                    candidate_gstins = list(gstin_votes.keys())
                    # [DB_GSTIN_ELECTION] Prefer GSTINs that are registered vendors in the DB.
                    # This prevents the buyer's GSTIN (extracted by OCR from a different block)
                    # from winning a majority-vote tie against the real supplier's GSTIN.
                    db_vendor_gstins = []
                    try:
                        from vendors.models import VendorMasterGSTDetails
                        db_vendor_gstins = [
                            g.upper() for g in
                            VendorMasterGSTDetails.objects.filter(
                                gstin__in=candidate_gstins
                            ).values_list('gstin', flat=True)
                        ]
                    except Exception as _dbe:
                        logger.warning(f"[STABILIZER_DB_GSTIN_LOOKUP_ERR] inv_no={inv_no} err={_dbe}")

                    db_candidates = [g for g in candidate_gstins if g in db_vendor_gstins]
                    if db_candidates:
                        # Among DB-registered GSTINs, pick the one with the highest vote count
                        best_gstin = max(db_candidates, key=lambda g: gstin_votes[g])
                        logger.info(
                            f"[STABILIZER_GSTIN_DB_ELECTED] inv_no={inv_no} "
                            f"best={best_gstin} db_candidates={db_candidates} votes={dict(gstin_votes)}"
                        )
                    else:
                        # No DB match — fall back to pure majority vote
                        best_gstin = max(gstin_votes, key=gstin_votes.get)
                        logger.info(
                            f"[STABILIZER_GSTIN_VOTE_ELECTED] inv_no={inv_no} "
                            f"best={best_gstin} votes={dict(gstin_votes)}"
                        )
                    for p in group_pages:
                        p["gstin"] = best_gstin
                        p["vendor_gstin"] = best_gstin
                        p["canonical_gstin"] = best_gstin
                        p["canonical_vendor_gstin"] = best_gstin
                        if "extracted_data" in p and isinstance(p["extracted_data"], dict):
                            p["extracted_data"]["gstin"] = best_gstin
                            p["extracted_data"]["vendor_gstin"] = best_gstin
                            p["extracted_data"]["canonical_vendor_gstin"] = best_gstin

                # Reconcile invoice_date
                date_votes = defaultdict(int)
                for p in group_pages:
                    d = str(p.get("invoice_date") or "").strip().upper()
                    if d and d not in ("MISSING", "NONE", "—", "NULL", "N/A"):
                        date_votes[d] += 1
                if date_votes:
                    best_date = max(date_votes, key=date_votes.get)
                    for p in group_pages:
                        p["invoice_date"] = best_date
                        if "extracted_data" in p and isinstance(p["extracted_data"], dict):
                            p["extracted_data"]["invoice_date"] = best_date

                # Reconcile vendor_name
                name_votes = defaultdict(int)
                for p in group_pages:
                    n = str(p.get("vendor_name") or "").strip().upper()
                    if n and n not in ("MISSING", "NONE", "—", "NULL", "N/A"):
                        name_votes[n] += 1
                if name_votes:
                    best_name = max(name_votes, key=name_votes.get)
                    for p in group_pages:
                        p["vendor_name"] = best_name
                        p["canonical_vendor_name"] = best_name
                        if "extracted_data" in p and isinstance(p["extracted_data"], dict):
                            p["extracted_data"]["vendor_name"] = best_name

        # Step 1.3: Classify page roles and apply relational check
        for i, curr in enumerate(invoices):
            # [GROUPING_INPUT]
            logger.info(
                f"[GROUPING_INPUT] "
                f"page_number={curr.get('_page_no')} "
                f"invoice_no={curr.get('invoice_no')} "
                f"raw_gstin={curr.get('raw_gstin') or curr.get('gstin')} "
                f"canonical_gstin={curr.get('canonical_gstin') or curr.get('gstin')} "
                f"vendor_name={curr.get('vendor_name')} "
                f"item_count={len(curr.get('items', []))}"
            )
            
            # Pre-classify each page
            curr_ocr = curr.get("_pdf_ocr_text") or curr.get("_raw_text") or ""
            role = enforcer.classify_page(curr_ocr, curr.get("items", []), invoice_data=curr)
            
            # Apply summary page heuristic explicitly
            if self.is_continuation_summary_page(curr):
                role = "PAGE_ROLE_SUMMARY"
                
            # REQUIRED RELATIONAL CHECK:
            if i > 0:
                prev = invoices[i - 1]
                
                prev_inv = str(prev.get("invoice_no") or "").strip().upper()
                curr_inv = str(curr.get("invoice_no") or "").strip().upper()
                prev_gstin = str(prev.get("gstin") or prev.get("vendor_gstin") or "").strip().upper()
                curr_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper()
                
                same_invoice = (curr_inv == prev_inv and curr_inv not in ("", "MISSING", "N/A"))
                same_gstin = (curr_gstin == prev_gstin and curr_gstin not in ("", "MISSING", "N/A"))
                same_session = (prev.get("upload_session_id") == curr.get("upload_session_id"))
                same_pdf = (prev.get("record_id") == curr.get("record_id") or prev.get("file_path") == curr.get("file_path"))
                
                # Check if previous page contains continuation markers or was primary/continuation
                prev_ocr = prev.get("_pdf_ocr_text") or prev.get("_raw_text") or ""
                prev_has_continuation = (
                    prev.get("_page_role") in ["PAGE_ROLE_PRIMARY", "PAGE_ROLE_CONTINUATION"] or
                    len(detect_continuation_markers(prev_ocr)) > 0
                )
                
                # Current page lacks real inventory density
                has_real_items = False
                for itm in curr.get("items", []):
                    q = enforcer._to_float(itm.get("quantity") or itm.get("qty") or itm.get("Qty"))
                    r = enforcer._to_float(itm.get("rate") or itm.get("Item Rate"))
                    if q > 0 and r > 0:
                        has_real_items = True
                        break
                lacks_real_density = not has_real_items
                
                # Current page mainly contains totals/tax summaries
                is_summary_or_totals = (
                    role in ["PAGE_ROLE_TOTALS", "PAGE_ROLE_TAX_SUMMARY", "PAGE_ROLE_SUMMARY"] or
                    self.is_continuation_summary_page(curr)
                )
                
                if same_invoice and same_gstin and same_session and same_pdf and prev_has_continuation and lacks_real_density and is_summary_or_totals:
                    logger.info(f"[MULTIPAGE_ROLE_DECISION] Relational override applied: page_no={curr.get('_page_no')} -> PAGE_ROLE_CONTINUATION")
                    role = "PAGE_ROLE_CONTINUATION"
                
            curr["_page_role"] = role
            
            curr_inv = str(curr.get("invoice_no") or "").strip() or "MISSING"
            curr_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper() or "MISSING"
            logger.info(f"[PAGE_ROLE_CLASSIFIED] page_no={curr.get('_page_no')} page_role={role} invoice_no={curr_inv} gstin={curr_gstin}")

        # ── 2. DOCUMENT GROUPING & CONTINUATION ATTACHMENT ──
        # Counterfactual counters
        total_rejections = 0
        count_role_only_merged = 0
        count_gstin_only_merged = 0
        count_invoice_only_merged = 0
        count_combined_merged = 0

        for curr_idx, curr in enumerate(invoices):
            curr_page_no = curr.get("_page_no")
            if curr_page_no in consumed_page_indices:
                continue
                
            role = curr.get("_page_role")
            curr_inv = str(curr.get("invoice_no") or "").strip() or "MISSING"
            curr_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper() or "MISSING"
            
            # CONTINUATION ATTACHMENT (attach to nearest PREVIOUS valid group)
            if role in ["PAGE_ROLE_CONTINUATION", "PAGE_ROLE_SUMMARY", "PAGE_ROLE_TOTALS", "PAGE_ROLE_TAX_SUMMARY"]:
                if final_groups:
                    # Attach to the most recent group (since pages are ordered by page_no)
                    target_group = final_groups[-1]
                    
                    logger.info(f"[CONTINUATION_PAGE_ATTACHED] page_no={curr_page_no} attached_to_group={len(final_groups)-1} role={role}")
                    
                    # Inherit metadata from the primary page of this group
                    primary_page = target_group[0]
                    curr["invoice_no"] = primary_page.get("invoice_no")
                    curr["gstin"] = primary_page.get("gstin")
                    curr["vendor_name"] = primary_page.get("vendor_name")
                    curr["invoice_date"] = primary_page.get("invoice_date")
                    curr["tenant_id"] = primary_page.get("tenant_id")
                    
                    target_group.append(curr)
                    consumed_page_indices.add(curr_page_no)
                    
                    self.log_trace(primary_page, curr, "merge", "Continuation attachment")
                    continue
                else:
                    logger.warning(f"[ORPHAN_CONTINUATION] page_no={curr_page_no} has no previous group to attach to. Treating as primary.")
                    role = "PAGE_ROLE_PRIMARY" # Fallback if it's the very first page
                    curr["_page_role"] = role
            
            # PRIMARY_PAGE GROUPING
            if role == "PAGE_ROLE_PRIMARY" or role == "PAGE_ROLE_UNKNOWN":
                curr_date = str(curr.get("invoice_date") or "").strip() or "MISSING"
                curr_tenant = str(curr.get("tenant_id") or "").strip() or "MISSING"
                
                matched = False
                
                # Check semantic fallback with existing groups
                for group_idx, group in enumerate(final_groups):
                    prev = group[0]
                    should, reason = enforcer.should_merge(prev, curr)
                    
                    # [GROUPING_DECISION]
                    p_no = str(prev.get("invoice_no") or "").strip().upper()
                    c_no = str(curr.get("invoice_no") or "").strip().upper()
                    p_gstin = str(prev.get("gstin") or prev.get("vendor_gstin") or "").strip().upper()
                    c_gstin = str(curr.get("gstin") or curr.get("vendor_gstin") or "").strip().upper()
                    p_can_gstin = str(prev.get("canonical_gstin") or prev.get("gstin") or "").strip().upper()
                    c_can_gstin = str(curr.get("canonical_gstin") or curr.get("gstin") or "").strip().upper()
                    
                    invoice_match = (p_no == c_no and p_no not in ("", "MISSING", "N/A"))
                    gstin_match = (p_gstin == c_gstin and p_gstin not in ("", "MISSING", "N/A"))
                    canonical_gstin_match = (p_can_gstin == c_can_gstin and p_can_gstin not in ("", "MISSING", "N/A"))
                    
                    logger.info(
                        f"[GROUPING_DECISION] page_a={prev.get('_page_no')} page_b={curr.get('_page_no')} "
                        f"invoice_match={invoice_match} gstin_match={gstin_match} "
                        f"canonical_gstin_match={canonical_gstin_match} grouped={should} "
                        f"rejection_reason='{reason if not should else ''}'"
                    )
                    
                    if not should:
                        total_rejections += 1
                        
                        # Log CURRENT_DECISION
                        page_a = prev.get('_page_no')
                        page_b = curr.get('_page_no')
                        logger.info(
                            f"[CURRENT_DECISION] page_a={page_a} page_b={page_b} "
                            f"grouped=False rejection_reason='{reason}'"
                        )
                        
                        curr_ocr = curr.get("_pdf_ocr_text") or curr.get("_raw_text") or ""
                        curr_role = enforcer.classify_page(curr_ocr, curr.get("items", []), invoice_data=curr)
                        
                        # Determine blocking conditions
                        blocked_by_role = (curr_role == "PAGE_ROLE_PRIMARY")
                        blocked_by_invoice = (p_no and c_no and p_no != c_no and p_no != "MISSING" and c_no != "MISSING")
                        blocked_by_gstin = (p_gstin and c_gstin and p_gstin != c_gstin and p_gstin != "MISSING" and c_gstin != "MISSING")
                        
                        first_blocking = "other"
                        if blocked_by_role:
                            first_blocking = "PAGE_ROLE_PRIMARY"
                        elif blocked_by_invoice:
                            first_blocking = "invoice mismatch"
                        elif blocked_by_gstin:
                            first_blocking = "GSTIN mismatch"
                            
                        # Fuzzy matches
                        # GSTIN fuzzy matching
                        gstin_fuzzy_match = False
                        if not p_gstin or not c_gstin or p_gstin == "MISSING" or c_gstin == "MISSING":
                            gstin_fuzzy_match = True
                        elif p_gstin == c_gstin:
                            gstin_fuzzy_match = True
                        else:
                            from difflib import SequenceMatcher
                            if SequenceMatcher(None, p_can_gstin, c_can_gstin).ratio() > 0.85:
                                gstin_fuzzy_match = True
                                
                        # Invoice fuzzy matching
                        invoice_fuzzy_match = False
                        if not p_no or not c_no or p_no == "MISSING" or c_no == "MISSING":
                            invoice_fuzzy_match = True
                        elif p_no == c_no:
                            invoice_fuzzy_match = True
                        else:
                            from difflib import SequenceMatcher
                            p_no_clean = re.sub(r'[^A-Z0-9]', '', p_no)
                            c_no_clean = re.sub(r'[^A-Z0-9]', '', c_no)
                            if p_no_clean == c_no_clean:
                                invoice_fuzzy_match = True
                            elif SequenceMatcher(None, p_no, c_no).ratio() > 0.85:
                                invoice_fuzzy_match = True
                                
                        # Date and branch
                        p_branch = str(prev.get("tenant_id") or "").strip().upper()
                        c_branch = str(curr.get("tenant_id") or "").strip().upper()
                        same_branch = (not c_branch or c_branch == "MISSING" or c_branch == p_branch)
                        
                        p_date = str(prev.get("invoice_date") or "").strip().upper()
                        c_date = str(curr.get("invoice_date") or "").strip().upper()
                        same_date = (not c_date or c_date == "MISSING" or c_date == p_date or p_date == c_date)
                        
                        # 1. Role Only
                        would_group_role_only = (not blocked_by_invoice and not blocked_by_gstin and same_branch and same_date)
                        if would_group_role_only:
                            count_role_only_merged += 1
                            
                        # 2. GSTIN Only
                        would_group_gstin_only = (not blocked_by_role and not blocked_by_invoice and gstin_fuzzy_match and same_branch and same_date)
                        if would_group_gstin_only:
                            count_gstin_only_merged += 1
                            
                        # 3. Invoice Only
                        would_group_invoice_only = (not blocked_by_role and not blocked_by_gstin and invoice_fuzzy_match and same_branch and same_date)
                        if would_group_invoice_only:
                            count_invoice_only_merged += 1
                            
                        # 4. Combined (Role disabled + GSTIN fuzzy + Invoice fuzzy)
                        would_group_combined = (gstin_fuzzy_match and invoice_fuzzy_match and same_branch and same_date)
                        if would_group_combined:
                            count_combined_merged += 1
                            
                        logger.info(
                            f"[COUNTERFACTUAL_DECISION] page_a={page_a} page_b={page_b} "
                            f"would_group={would_group_combined} first_blocking='{first_blocking}' "
                            f"would_group_role_only={would_group_role_only} "
                            f"would_group_gstin_only={would_group_gstin_only} "
                            f"would_group_invoice_only={would_group_invoice_only}"
                        )
                    
                    if should:
                        logger.info(f"[MERGE_DECISION] candidate_page={curr_page_no} decision='MERGE' reason='{reason}'")
                        group.append(curr)
                        consumed_page_indices.add(curr_page_no)
                        matched = True
                        break
                        
                if not matched:
                    logger.info(f"[NEW_INVOICE_CREATED] inv='{curr_inv}' gstin={curr_gstin} page={curr_page_no}")
                    new_group = [curr]
                    final_groups.append(new_group)
                    consumed_page_indices.add(curr_page_no)
                    logger.info(f"[DOCUMENT_GROUP_CREATED] group_key={len(final_groups)-1} pages=[{curr_page_no}]")
                    logger.info(f"[GROUP_KEY_CREATED] group_key=GRP_{len(final_groups)-1}_{curr_inv} invoice_no={curr_inv} pages=[{curr_page_no}]")

        logger.info(f"[FORENSIC GROUP DONE] {len(invoices)} pages -> {len(final_groups)} distinct groups")
        logger.info(
            f"[COUNTERFACTUAL_SUMMARY] "
            f"total_rejections={total_rejections} "
            f"role_only_resolved={count_role_only_merged} "
            f"gstin_only_resolved={count_gstin_only_merged} "
            f"invoice_only_resolved={count_invoice_only_merged} "
            f"combined_resolved={count_combined_merged}"
        )

        # ── 3. FINAL GROUP RECONSTRUCTION & CLEANUP ──
        validated_groups = {}
        for i, group in enumerate(final_groups):
            # Check if all pages in the group are continuation summary pages
            is_group_cont_summary = all(self.is_continuation_summary_page(p) for p in group)
                    
            if is_group_cont_summary:
                logger.info(
                    f"[CONTINUATION_PAGE_REJECTED] Group {i} consisting of pages "
                    f"{[p.get('_page_no') for p in group]} rejected: all pages are continuation-summary-only."
                )
                logger.info(f"[RECORD_CREATION_BLOCKED] reason=continuation_page group_key={i}")
                for p in group:
                    logger.info(
                        f"[SUMMARY_ROW_DROPPED] page={p.get('_page_no')} "
                        f"reason='isolated continuation summary page' items={[itm.get('description') or itm.get('item_name') for itm in p.get('items', [])]}"
                    )
                continue

            primary_count = sum(1 for p in group if p.get("_page_role") == "PAGE_ROLE_PRIMARY")
            logger.info(f"[PRIMARY_CHECK] group={i} size={len(group)} primary_count={primary_count}")
            
            # Compute a deterministic canonical hash for the group
            import hashlib
            physical_pages = sorted(list(set(p.get("_physical_page_no") for p in group if p.get("_physical_page_no") is not None)))
            page_str = ",".join(map(str, physical_pages))
            record_id_str = str(group[0].get("record_id") or "")
            group_hash = hashlib.sha256(f"{record_id_str}:{page_str}".encode('utf-8')).hexdigest()[:16]
            key_id = f"GRP_HASH_{group_hash}"
            
            logger.info(f"[GROUP_FINALIZED] group_key={key_id} final_item_count=PENDING pages_merged={len(group)}")
            
            # Collect valid invoice numbers from all pages in the group
            group_inv_nos = [str(p.get('invoice_no') or '').strip() for p in group]
            valid_inv_nos = [n for n in group_inv_nos if n and n.upper() != 'MISSING']
            
            if not valid_inv_nos:
                logger.warning(f"[PAGE_PRESERVED] Group {i} has no valid invoice_no across {len(group)} pages but we will preserve it safely.")
                key = f"{key_id}_UNKNOWN"
                validated_groups[key] = group
                continue

            # Use unique key to avoid collision
            key = f"{key_id}_{valid_inv_nos[0]}"
            validated_groups[key] = group
            
            for p in group:
                logger.info(f"[PAGE_NOT_DISCARDED] Preserving page {p.get('_page_no')} in group {key}")

        # [FORENSIC_GROUPING]
        import json
        for key, group in validated_groups.items():
            first_page = group[0] if group else {}
            grouped_pages = [p.get("_page_no") for p in group]
            dto_memory_ids = [str(id(p)) for p in group]
            grouping_info = {
                "group_key": str(key),
                "upload_session_id": str(first_page.get("upload_session_id") or ""),
                "physical_file_id": str(first_page.get("record_id") or ""),
                "grouped_pages": grouped_pages,
                "invoice_no": str(first_page.get("invoice_no") or first_page.get("supplier_invoice_no") or ""),
                "gstin": str(first_page.get("vendor_gstin") or first_page.get("gstin") or ""),
                "dto_memory_ids": dto_memory_ids
            }
            logger.info(f"[FORENSIC_GROUPING]\n{json.dumps(grouping_info, indent=2, default=str)}")

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
        raw_text = str(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "").upper()
        
        # Check for standard copy types
        for type_name, pattern in self.copy_patterns.items():
            if re.search(pattern, raw_text, re.IGNORECASE):
                return type_name
                
        # Check for continuation roles
        from .integrity_enforcer import get_integrity_enforcer
        enforcer = get_integrity_enforcer()
        role = enforcer.classify_page(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "", inv.get("items", []))
        
        if role == "PAGE_ROLE_PRIMARY":
            return "original"
        elif role in ["PAGE_ROLE_CONTINUATION", "PAGE_ROLE_TOTALS", "PAGE_ROLE_TAX_SUMMARY"]:
            return "continuation"
            
        return "page_result"

    def is_continuation_summary_page(self, inv: Dict[str, Any]) -> bool:
        """
        [FORENSIC] Lightweight page-role heuristic to identify isolated continuation summary pages.
        Targets mathematically redundant continuation-summary-only footer pages.
        Covers:
          - Rounded Off / Round Off rows
          - Tax ledger rows: Output CGST @9%, Output SGST @9%, Output IGST @18%
          - Services / Amount Chargeable / Declaration / Authorised Signatory pages
        """
        items = inv.get("items", [])

        # Heuristic A: Blank page (no items) is always a footer/blank
        if not items:
            return True

        # Expanded generic term set — includes GST ledger rows that appear on summary pages.
        # Using substring matching (any(kw in desc)) for robustness against OCR noise.
        generic_keywords = [
            "services", "total", "subtotal", "sub-total", "summary",
            "carried forward", "brought forward",
            "rounded off", "round off", "rounding", "adjustment",
            "output cgst", "output sgst", "output igst",
            "input cgst", "input sgst", "input igst",
            "cgst @", "sgst @", "igst @",
            "tax summary", "amount chargeable", "declaration",
            "less round", "add round", "bank charges", "net amount",
            "e & o.e", "balance",
        ]

        all_generic = True
        for itm in items:
            desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            is_generic = any(kw in desc for kw in generic_keywords)
            if not is_generic:
                all_generic = False
                break

        # Heuristic B: Lacks invoice-start metadata (invoice_no missing / MISSING)
        invoice_no = str(inv.get("invoice_no") or "").strip().upper()
        lacks_metadata = not invoice_no or invoice_no in ("", "MISSING", "—")

        # Heuristic C: Raw OCR text contains known continuation/footer phrases
        raw_text = str(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "").lower()
        continuation_keywords = [
            "continued to page", "rounded off", "tax summary",
            "output cgst", "output sgst", "authorised signatory",
            "carried forward", "brought forward", "round off",
            "rounding adjustment", "amount chargeable in words",
            "e & o.e", "declaration",
        ]
        has_continuation_keywords = any(kw in raw_text for kw in continuation_keywords)

        # A page is continuation-summary if ALL items are generic AND
        # it either lacks header metadata OR has continuation footer phrases.
        is_cont = all_generic and (has_continuation_keywords or lacks_metadata)

        if is_cont:
            logger.info(
                f"[CONTINUATION_PAGE_HEURISTIC] page={inv.get('_page_no')} "
                f"all_generic={all_generic} lacks_metadata={lacks_metadata} "
                f"has_keywords={has_continuation_keywords} -> CLASSIFIED AS CONTINUATION_SUMMARY_PAGE"
            )
        return is_cont

    def deduplicate_items(self, items: List[Dict[str, Any]], invoice_no: str = None, group_id: str = None) -> List[Dict[str, Any]]:
        """
        [FORENSIC] Deterministic Item Deduplication & Multi-page Summary Cleanup.
        Dedupes cross-page duplicate items and filters out fake summary/totals
        or rounding rows commonly found on continuation pages of multi-page invoices.
        """
        if not items:
            return []

        # 1. Trace pre-dedupe item states
        logger.info(f"[FORENSIC_PRE_DEDUPE] item_count={len(items)} descriptions={[itm.get('description') or itm.get('item_name') for itm in items]}")

        seen_keys = set()
        unique_items = []
        
        for itm in items:
            desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            amt = self._to_float(itm.get("taxable_value") or itm.get("amount"))
            rate = self._to_float(itm.get("rate") or 0.0)
            
            # Cross-page deduplication key
            key = (desc, amt, rate)
            
            if key not in seen_keys:
                seen_keys.add(key)
                unique_items.append(itm)
            else:
                logger.info(f"[ITEM_DEDUPE_GUARD] Dropping cross-page duplicate item: desc='{desc[:20]}' amt={amt} rate={rate}")
                # [CLEANUP_DECISION]
                logger.info(
                    f"[CLEANUP_DECISION] description='{itm.get('description') or itm.get('item_name')}' "
                    f"reason='cross-page duplicate item' "
                    f"invoice_no={invoice_no} "
                    f"group_id={group_id}"
                )
                
        # Post-deduplication cleaning of fake summary and round-off rows
        # 1. Drop 'Rounded Off' / 'Round Off' rows as they are represented in header level
        non_roundoff_items = []
        for itm in unique_items:
            desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            if desc in ["rounded off", "round off", "rounding adjustment", "rounding off", "round_off", "adjustment"]:
                logger.info(f"[ITEM_CLEANUP_GUARD] Dropping 'Rounded Off' item: {itm}")
                # [CLEANUP_DECISION]
                logger.info(
                    f"[CLEANUP_DECISION] description='{itm.get('description') or itm.get('item_name')}' "
                    f"reason='rounded off or rounding adjustment item' "
                    f"invoice_no={invoice_no} "
                    f"group_id={group_id}"
                )
                continue
            non_roundoff_items.append(itm)

        if not non_roundoff_items:
            logger.info(f"[FORENSIC_POST_DEDUPE] item_count=0 descriptions=[]")
            logger.info(f"[FINAL_INVENTORY_ITEMS] item_count=0 descriptions=[]")
            return unique_items

        # 2. Drop generic summary rows ('Services' or 'Total') whose value/qty is a sum of other items
        final_items = []
        for idx, itm in enumerate(non_roundoff_items):
            desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            
            if desc in ["services", "total", "subtotal", "sub-total", "summary", "carried forward", "brought forward"]:
                other_items = [x for i, x in enumerate(non_roundoff_items) if i != idx]
                if other_items:
                    sum_taxable = sum(self._to_float(x.get("taxable_value") or x.get("amount")) for x in other_items)
                    sum_qty = sum(self._to_float(x.get("qty") or x.get("quantity")) for x in other_items)
                    
                    itm_taxable = self._to_float(itm.get("taxable_value") or itm.get("amount"))
                    itm_qty = self._to_float(itm.get("qty") or itm.get("quantity"))
                    
                    taxable_matches = abs(itm_taxable - sum_taxable) <= 2.0
                    qty_matches = itm_qty > 0 and abs(itm_qty - sum_qty) <= 0.1
                    
                    if taxable_matches or qty_matches:
                        logger.info(
                            f"[ITEM_CLEANUP_GUARD] Dropping generic summary item '{desc}' "
                            f"itm_taxable={itm_taxable} sum_other_taxable={sum_taxable} "
                            f"itm_qty={itm_qty} sum_other_qty={sum_qty}"
                        )
                        # [CLEANUP_DECISION]
                        logger.info(
                            f"[CLEANUP_DECISION] description='{itm.get('description') or itm.get('item_name')}' "
                            f"reason='generic summary row matching mathematical sum of other items' "
                            f"invoice_no={invoice_no} "
                            f"group_id={group_id}"
                        )
                        continue
            final_items.append(itm)

        # 3. Double-Layer Safety Net: If remaining items consist ONLY of generic summary rows, drop them entirely!
        has_real_item = False
        for itm in final_items:
            desc = str(itm.get("description") or itm.get("item_name") or "").strip().lower()
            if desc not in ["services", "total", "subtotal", "sub-total", "summary", "carried forward", "brought forward"]:
                has_real_item = True
                break
        
        explicitly_dropped = False
        if not has_real_item and final_items:
            logger.info(f"[CONTINUATION_PAGE_REJECTED] Dropping item set because it only contains generic summary rows: {[itm.get('description') or itm.get('item_name') for itm in final_items]}")
            for itm in final_items:
                logger.info(f"[SUMMARY_ROW_DROPPED] item={itm.get('description') or itm.get('item_name')} reason='standalone generic summary item without real items'")
                # [CLEANUP_DECISION]
                logger.info(
                    f"[CLEANUP_DECISION] description='{itm.get('description') or itm.get('item_name')}' "
                    f"reason='standalone generic summary item without real items (double-layer safety net)' "
                    f"invoice_no={invoice_no} "
                    f"group_id={group_id}"
                )
            final_items = []
            explicitly_dropped = True

        ret_items = final_items if (final_items or explicitly_dropped) else unique_items
        logger.info(f"[FORENSIC_POST_DEDUPE] item_count={len(ret_items)} descriptions={[itm.get('description') or itm.get('item_name') for itm in ret_items]}")
        logger.info(f"[FINAL_INVENTORY_ITEMS] item_count={len(ret_items)} descriptions={[itm.get('description') or itm.get('item_name') for itm in ret_items]}")

        return ret_items


    def merge_group(self, group: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Step 3: MERGE ALL PAGES (MANDATORY)."""
        if not group:
            return {}

        import copy
        import json
        group = copy.deepcopy(group) # Deepcopy to prevent DTO leakage during in-place merges

        # [FORENSIC_PRE_MERGE]
        try:
            sorted_group = sorted(group, key=lambda x: x.get("_page_no", 0))
            page_a = sorted_group[0] if len(sorted_group) > 0 else {}
            page_b = sorted_group[1] if len(sorted_group) > 1 else {}
            
            # Check total for page A
            total_a = page_a.get('header', {}).get('total_amount') or page_a.get('header', {}).get('total_invoice_value') or page_a.get('total_invoice_value')
            page_a_has_final_total = False
            if total_a is not None:
                try:
                    page_a_has_final_total = float(str(total_a).replace(',', '')) > 0.0
                except ValueError:
                    pass
                    
            # Check total for page B
            total_b = page_b.get('header', {}).get('total_amount') or page_b.get('header', {}).get('total_invoice_value') or page_b.get('total_invoice_value')
            page_b_has_final_total = False
            if total_b is not None:
                try:
                    page_b_has_final_total = float(str(total_b).replace(',', '')) > 0.0
                except ValueError:
                    pass
            
            pre_merge_info = {
                "invoice_no": str(page_a.get("invoice_no") or page_a.get("supplier_invoice_no") or ""),
                "page_a_items": page_a.get("items", []),
                "page_b_items": page_b.get("items", []) if page_b else [],
                "page_a_has_final_total": page_a_has_final_total,
                "page_b_has_final_total": page_b_has_final_total,
                "merge_reason": "Relational multi-page continuation merge" if page_b else "Single-page pass-through",
                "dto_memory_ids": [str(id(p)) for p in sorted_group]
            }
            logger.info(f"[FORENSIC_PRE_MERGE]\n{json.dumps(pre_merge_info, indent=2, default=str)}")
        except Exception as le:
            logger.warning(f"[FORENSIC_PRE_MERGE_LOG_ERR] {le}")

        # [MERGE_GROUP_TRACE] (Requirement #5)
        for p in group:
            logger.info(f"[MERGE_GROUP_ENTRY_COUNT] page={p.get('_page_no')} items={len(p.get('items', []))}")
            
        enforcer = get_integrity_enforcer()

        # Step 1: Detect roles for all members
        for inv in group:
            # [MANDATORY HYDRATION] (Requirement #1)
            hydrate_identity_fields(inv)
            role = enforcer.classify_page(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "", inv.get("items", []), invoice_data=inv)
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

        # Compute group_id deterministically
        import hashlib
        physical_pages = sorted(list(set(p.get("_physical_page_no") for p in group if p.get("_physical_page_no") is not None)))
        page_str = ",".join(map(str, physical_pages))
        record_id_str = str(group[0].get("record_id") or "")
        group_hash = hashlib.sha256(f"{record_id_str}:{page_str}".encode('utf-8')).hexdigest()[:16]
        group_id = f"GRP_HASH_{group_hash}"
        pages_in_group = [p.get("_page_no") for p in sorted_group]

        # [GROUP_RESULT]
        logger.info(
            f"[GROUP_RESULT] group_id={group_id} "
            f"pages_in_group={pages_in_group} "
            f"invoice_no={merged_invoice.get('invoice_no')} "
            f"item_count_before_cleanup={len(all_raw_items)}"
        )

        item_count_before = len(all_raw_items)

        # Deduplicate and handle variations
        merged_invoice["items"] = self.deduplicate_items(all_raw_items, invoice_no=merged_invoice.get('invoice_no'), group_id=group_id)

        item_count_after = len(merged_invoice["items"])

        # [ITEM_LOSS_DETECTED]
        if item_count_before > 0 and item_count_after == 0:
            rule_responsible = "Unknown"
            has_round_off = any(str(itm.get("description") or itm.get("item_name") or "").strip().lower() in ["rounded off", "round off", "rounding adjustment", "rounding off", "round_off", "adjustment"] for itm in all_raw_items)
            has_generic = any(str(itm.get("description") or itm.get("item_name") or "").strip().lower() in ["services", "total", "subtotal", "sub-total", "summary", "carried forward", "brought forward"] for itm in all_raw_items)
            
            if has_generic and not has_round_off:
                rule_responsible = "standalone generic summary item without real items (double-layer safety net)"
            elif has_round_off and not has_generic:
                rule_responsible = "rounded off or rounding adjustment item"
            else:
                rule_responsible = "combination of rounded-off and standalone generic summary items (double-layer safety net)"

            logger.critical(
                f"[ITEM_LOSS_DETECTED] "
                f"invoice_no={merged_invoice.get('invoice_no')} "
                f"group_id={group_id} "
                f"pages_in_group={pages_in_group} "
                f"item_count_before={item_count_before} "
                f"item_count_after={item_count_after} "
                f"exact_cleanup_rule_responsible='{rule_responsible}'"
            )
        
        # [FORENSIC_CANONICAL_DTO]
        try:
            after_cleanup = merged_invoice["items"]
            removed_items = []
            for item in all_raw_items:
                if item not in after_cleanup:
                    removed_items.append(item)
            
            generic_keywords = [
                "services", "total", "subtotal", "sub-total", "summary",
                "carried forward", "brought forward",
                "rounded off", "round off", "rounding", "adjustment",
                "output cgst", "output sgst", "output igst",
                "input cgst", "input sgst", "input igst",
                "cgst @", "sgst @", "igst @",
                "tax summary", "amount chargeable", "declaration",
                "less round", "add round", "bank charges", "net amount",
                "e & o.e", "balance",
            ]
            contains_only_summary_rows = len(after_cleanup) > 0 and all(
                any(kw in str(itm.get("description") or itm.get("item_name") or "").lower() for kw in generic_keywords)
                for itm in after_cleanup
            )
            
            post_merge_info = {
                "invoice_no": str(merged_invoice.get("invoice_no") or merged_invoice.get("supplier_invoice_no") or ""),
                "canonical_items_before_cleanup": all_raw_items,
                "canonical_items_after_cleanup": after_cleanup,
                "removed_items": removed_items,
                "contains_only_summary_rows": contains_only_summary_rows,
                "dto_memory_id": str(id(merged_invoice))
            }
            logger.info(f"[FORENSIC_CANONICAL_DTO]\n{json.dumps(post_merge_info, indent=2, default=str)}")
        except Exception as le:
            logger.warning(f"[FORENSIC_CANONICAL_DTO_LOG_ERR] {le}")

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

        # [ROOT-CAUSE FIX] Explicit lineage tracking for pipeline integrity verification
        merged_invoice["_source_pages"] = [p.get("_page_no") for p in sorted_group if p.get("_page_no")]

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
